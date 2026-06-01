import { sql } from 'bun';

const PORT = Number(process.env.PORT ?? 8080);
const SLUG_RE = /^[a-z0-9-]{1,128}$/;

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

const notFound = () => json({ error: 'not_found' }, { status: 404 });
const badRequest = (msg = 'bad_request') => json({ error: msg }, { status: 400 });
const methodNotAllowed = () => new Response('Method Not Allowed', { status: 405 });

interface CityPayload {
  name: string;
  geoJson: unknown;
  lengths: unknown;
}

interface StatsPayload {
  lengths: unknown;
}

async function handleCity(slug: string, req: Request): Promise<Response> {
  if (!SLUG_RE.test(slug)) return badRequest('invalid_slug');

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT name, geojson, lengths, updated_at
      FROM cities
      WHERE slug = ${slug}
    `;
    if (rows.length === 0) return notFound();
    const row = rows[0];
    return json({
      name: row.name,
      geoJson: row.geojson,
      lengths: row.lengths,
      updatedAt: row.updated_at,
    });
  }

  if (req.method === 'PUT') {
    let body: CityPayload;
    try {
      body = (await req.json()) as CityPayload;
    } catch {
      return badRequest('invalid_json');
    }
    if (!body?.name || !body?.geoJson || !body?.lengths) {
      return badRequest('missing_fields');
    }
    // bun:sql auto-encodes JS objects as JSON for jsonb columns. Don't
    // pre-stringify (was causing double-encoding into a JSONB string scalar).
    await sql`
      INSERT INTO cities (slug, name, geojson, lengths, updated_at)
      VALUES (
        ${slug},
        ${body.name},
        ${body.geoJson},
        ${body.lengths},
        now()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name       = EXCLUDED.name,
        geojson    = EXCLUDED.geojson,
        lengths    = EXCLUDED.lengths,
        updated_at = now()
    `;
    return json({ ok: true });
  }

  return methodNotAllowed();
}

async function handleStatsItem(slug: string, req: Request): Promise<Response> {
  if (!SLUG_RE.test(slug)) return badRequest('invalid_slug');

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT lengths, updated_at FROM stats WHERE slug = ${slug}
    `;
    if (rows.length === 0) return notFound();
    return json({
      lengths: rows[0].lengths,
      updatedAt: rows[0].updated_at,
    });
  }

  if (req.method === 'PUT') {
    let body: StatsPayload;
    try {
      body = (await req.json()) as StatsPayload;
    } catch {
      return badRequest('invalid_json');
    }
    if (!body?.lengths) return badRequest('missing_fields');
    await sql`
      INSERT INTO stats (slug, lengths, updated_at)
      VALUES (${slug}, ${body.lengths}, now())
      ON CONFLICT (slug) DO UPDATE SET
        lengths    = EXCLUDED.lengths,
        updated_at = now()
    `;
    return json({ ok: true });
  }

  return methodNotAllowed();
}

async function handleStatsList(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const rows = await sql`
    SELECT slug, lengths, updated_at FROM stats ORDER BY slug
  `;
  return json(
    rows.map((r: { slug: string; lengths: unknown; updated_at: string }) => ({
      slug: r.slug,
      lengths: r.lengths,
      updatedAt: r.updated_at,
    }))
  );
}

/**
 * Same-origin proxy for Overpass API queries.
 *
 * Public Overpass servers have unreliable CORS, so the browser can't hit
 * them directly. Frontend posts (or GETs) to /api/overpass; we forward to
 * overpass-api.de and stream the response back.
 *
 * Accepts both GET (?data=…) and POST (form body or raw query) since
 * different OSM client libs use different conventions.
 */
const OVERPASS_UPSTREAM = 'https://overpass-api.de/api/interpreter';
// overpass-api.de is the reliable instance but transiently 429/5xx-throttles our
// shared VPS IP under load. Retry it first (throttles usually clear in <1s), then
// fall back to an alternate. Short per-attempt timeouts keep a dead server from
// hanging the request. Full-city queries normally return in ~6-10s.
const OVERPASS_ATTEMPTS: Array<{ url: string; timeoutMs: number }> = [
  { url: OVERPASS_UPSTREAM, timeoutMs: 40_000 },
  { url: OVERPASS_UPSTREAM, timeoutMs: 40_000 },
  { url: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 20_000 },
];
const OVERPASS_UA = 'velokarte/0.1 (+https://velokarte.pocs.dev)';

const STREET_LAMP_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface LampFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: Record<string, never>;
  }>;
}

const inFlightLampFetches = new Map<string, Promise<LampFeatureCollection>>();

async function fetchLampsFromOverpass(areaLabel: string): Promise<LampFeatureCollection> {
  // City portion only (first comma segment); Overpass's area lookup matches
  // by name and is happy with bare city names.
  const cityName = areaLabel.split(',')[0].trim().replace(/"/g, '');
  if (!cityName) throw new Error('empty_area');

  const query = `[out:json][timeout:300];area["name"="${cityName}"]->.a;node["highway"="street_lamp"](area.a);out skel;`;

  const upstreamRes = await fetch(OVERPASS_UPSTREAM, {
    method: 'POST',
    headers: {
      'User-Agent': OVERPASS_UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'data=' + encodeURIComponent(query),
  });

  if (!upstreamRes.ok) {
    const body = await upstreamRes.text().catch(() => '');
    throw new Error(`overpass_${upstreamRes.status}: ${body.slice(0, 200)}`);
  }

  const data = (await upstreamRes.json()) as {
    elements?: Array<{ type: string; id: number; lon: number; lat: number }>;
  };
  const features = (data.elements ?? [])
    .filter(
      (el) => el.type === 'node' && Number.isFinite(el.lon) && Number.isFinite(el.lat)
    )
    .map((el) => ({
      type: 'Feature' as const,
      id: el.id,
      geometry: { type: 'Point' as const, coordinates: [el.lon, el.lat] as [number, number] },
      properties: {},
    }));
  return { type: 'FeatureCollection', features };
}

async function refreshLampsCache(slug: string, areaLabel: string): Promise<LampFeatureCollection> {
  const existing = inFlightLampFetches.get(slug);
  if (existing) return existing;

  const promise = (async () => {
    const fc = await fetchLampsFromOverpass(areaLabel);
    await sql`
      INSERT INTO street_lamps (slug, area_label, geojson, point_count, updated_at)
      VALUES (
        ${slug},
        ${areaLabel},
        ${fc},
        ${fc.features.length},
        now()
      )
      ON CONFLICT (slug) DO UPDATE SET
        area_label  = EXCLUDED.area_label,
        geojson     = EXCLUDED.geojson,
        point_count = EXCLUDED.point_count,
        updated_at  = now()
    `;
    return fc;
  })();

  inFlightLampFetches.set(slug, promise);
  try {
    return await promise;
  } finally {
    inFlightLampFetches.delete(slug);
  }
}

async function handleStreetLamps(slug: string, req: Request): Promise<Response> {
  if (!SLUG_RE.test(slug)) return badRequest('invalid_slug');
  if (req.method !== 'GET') return methodNotAllowed();

  const areaLabel = new URL(req.url).searchParams.get('area') || '';

  const rows = await sql`
    SELECT area_label, geojson, point_count, updated_at
    FROM street_lamps
    WHERE slug = ${slug}
  `;

  if (rows.length > 0) {
    const row = rows[0];
    const age = Date.now() - new Date(row.updated_at).getTime();
    if (age < STREET_LAMP_STALE_MS) {
      return json({
        geoJson: row.geojson,
        pointCount: row.point_count,
        updatedAt: row.updated_at,
      });
    }
    // Stale — return what we have now and refresh in the background so the
    // caller doesn't block on Overpass.
    if (areaLabel) {
      refreshLampsCache(slug, areaLabel).catch((err) =>
        console.error('[street-lamps] background refresh failed:', err)
      );
    }
    return json({
      geoJson: row.geojson,
      pointCount: row.point_count,
      updatedAt: row.updated_at,
      stale: true,
    });
  }

  // Cold cache — must fetch synchronously so the user sees something.
  if (!areaLabel) return badRequest('missing_area_for_cold_cache');

  try {
    const fc = await refreshLampsCache(slug, areaLabel);
    return json({
      geoJson: fc,
      pointCount: fc.features.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[street-lamps] cold fetch failed:', err);
    return json({ error: 'street_lamps_fetch_failed', detail: String(err) }, { status: 502 });
  }
}

// IPv6 source-address rotation. When OVERPASS_BIND_PREFIX (a /64 CIDR) is set in
// /etc/velokarte/env, each upstream attempt egresses from a fresh random address
// in that /64, so overpass-api.de's per-IP rate limiting can't accumulate against
// a single address. Requires the AnyIP setup applied by
// infra/systemd/velokarte-anyip.service:
//   sysctl -w net.ipv6.ip_nonlocal_bind=1
//   ip -6 route add local <prefix> dev lo
// Bun's fetch/node:net silently ignore localAddress, so the only way to bind a
// source address is to shell out to curl --interface. When the var is unset, the
// proxy uses a plain fetch and behaves byte-identically to before.
const OVERPASS_BIND_PREFIX = process.env.OVERPASS_BIND_PREFIX?.trim();

/** Pick a random host address inside an IPv6 /64 CIDR (handles '::' compression). */
function randomAddrInPrefix64(cidr: string): string {
  const addrPart = cidr.split('/')[0];
  const toGroups = (s: string) => (s ? s.split(':').map((h) => parseInt(h || '0', 16)) : []);
  const halves = addrPart.split('::');
  let groups: number[];
  if (halves.length === 2) {
    const left = toGroups(halves[0]);
    const right = toGroups(halves[1]);
    groups = [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
  } else {
    groups = toGroups(addrPart);
  }
  if (groups.length !== 8) throw new Error(`Cannot parse IPv6 prefix: ${addrPart}`);
  let host: number[];
  do {
    host = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x10000));
  } while (host.every((g) => g === 0) || host.every((g) => g === 0xffff));
  return [...groups.slice(0, 4), ...host].map((g) => g.toString(16)).join(':');
}

interface CurlResult {
  curlExit: number;
  status: number;
  body: Uint8Array;
}

/**
 * One Overpass attempt via curl, optionally binding a source address (the only
 * way to rotate the source IP since Bun ignores localAddress). The status code
 * is emitted to stderr via `-w '%{stderr}%{http_code}'` so stdout stays pure
 * body. The whole body is buffered (the retry/passthrough decision needs the
 * status, which curl only reports after the transfer completes).
 */
async function overpassViaCurl(
  url: string,
  formBody: string,
  timeoutMs: number,
  bindAddr?: string
): Promise<CurlResult> {
  const args = [
    '--silent',
    '--compressed',
    '--max-time',
    String(Math.ceil(timeoutMs / 1000)),
    '-X',
    'POST',
    '--data-binary',
    '@-',
    '-H',
    `User-Agent: ${OVERPASS_UA}`,
    '-H',
    'Accept: application/json',
    '-H',
    'Content-Type: application/x-www-form-urlencoded',
    '--write-out',
    '%{stderr}HTTPSTATUS:%{http_code}',
    url,
  ];
  if (bindAddr) args.push('-6', '--interface', bindAddr);

  const proc = Bun.spawn(['curl', ...args], {
    stdin: new TextEncoder().encode(formBody),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  // Drain both streams concurrently (consuming both avoids any pipe-buffer
  // deadlock on large bodies), then await exit.
  const [bodyBuf, statusText] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
  ]);
  const curlExit = await proc.exited;
  // Status is emitted to stderr with a sentinel (`HTTPSTATUS:NNN`) so it can't be
  // confused with any curl diagnostic text. Take the last occurrence.
  const matches = [...statusText.matchAll(/HTTPSTATUS:(\d{3})/g)];
  const status = matches.length ? parseInt(matches[matches.length - 1][1], 10) : 0;
  if (curlExit === 0 && status === 0) {
    console.warn('[overpass-proxy] curl exited 0 but no HTTP status parsed from stderr');
  }
  return { curlExit, status, body: new Uint8Array(bodyBuf) };
}

async function handleOverpass(req: Request): Promise<Response> {
  let dataParam: string | null = null;

  if (req.method === 'GET') {
    dataParam = new URL(req.url).searchParams.get('data');
  } else if (req.method === 'POST') {
    const raw = await req.text();
    if (raw.startsWith('data=')) {
      // Standard form-urlencoded POST (what jQuery $.ajax does by default).
      dataParam = decodeURIComponent(raw.slice(5).replace(/\+/g, ' '));
    } else {
      // Raw query body — also accepted by Overpass.
      dataParam = raw;
    }
  } else {
    return methodNotAllowed();
  }

  if (!dataParam) return badRequest('missing_data');

  const body = 'data=' + encodeURIComponent(dataParam);
  let lastDetail = 'no upstream attempted';

  // Preferred path: rotate the source IPv6 per attempt via curl (only when a /64
  // is configured). NEVER put the bound address into lastDetail or any
  // client-visible response — it would leak our infrastructure /64.
  if (OVERPASS_BIND_PREFIX) {
    for (let i = 0; i < OVERPASS_ATTEMPTS.length; i++) {
      const { url, timeoutMs } = OVERPASS_ATTEMPTS[i];
      let bindAddr: string;
      try {
        bindAddr = randomAddrInPrefix64(OVERPASS_BIND_PREFIX);
      } catch (e) {
        console.error('[overpass-proxy] invalid OVERPASS_BIND_PREFIX; using direct fetch:', e);
        break;
      }
      try {
        const r = await overpassViaCurl(url, body, timeoutMs, bindAddr);
        if (r.curlExit === 0 && r.status >= 200 && r.status < 300) {
          // All Overpass queries we issue are [out:json], so the body is JSON.
          return new Response(r.body, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Real client error (e.g. 400 bad query): a different source/server
        // won't help — return it as-is.
        if (r.curlExit === 0 && r.status >= 400 && r.status < 500 && r.status !== 429) {
          const text = new TextDecoder().decode(r.body);
          return new Response(text || JSON.stringify({ error: 'overpass_upstream_error' }), {
            status: r.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Transient (429/5xx) or curl failure (timeout/bind/network): retry.
        lastDetail =
          r.curlExit !== 0 ? `${url} -> curl exit ${r.curlExit}` : `${url} -> ${r.status}`;
        console.warn(`[overpass-proxy] (rotated) ${lastDetail}; retrying`);
      } catch (err) {
        lastDetail = `${url} -> ${String(err)}`;
        console.warn(`[overpass-proxy] (rotated) ${lastDetail}; retrying`);
      }
      if (i < OVERPASS_ATTEMPTS.length - 1) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
    // Rotation exhausted or unavailable — fall through to a plain fetch so we are
    // never worse off than before if IPv6 binding ever breaks.
    console.warn('[overpass-proxy] rotated attempts failed; falling back to direct fetch');
  }

  for (let i = 0; i < OVERPASS_ATTEMPTS.length; i++) {
    const { url, timeoutMs } = OVERPASS_ATTEMPTS[i];
    try {
      const upstreamRes = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': OVERPASS_UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (upstreamRes.ok) {
        return new Response(upstreamRes.body, {
          status: 200,
          headers: {
            'Content-Type':
              upstreamRes.headers.get('Content-Type') || 'application/json',
          },
        });
      }

      // Non-transient client errors (e.g. 400 bad query) won't improve on a
      // retry/another server — return as-is so the caller sees the real cause.
      if (upstreamRes.status < 500 && upstreamRes.status !== 429) {
        const text = await upstreamRes.text().catch(() => '');
        return new Response(text || JSON.stringify({ error: 'overpass_upstream_error' }), {
          status: upstreamRes.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Transient (429/5xx): drain, brief backoff, try the next attempt.
      await upstreamRes.arrayBuffer().catch(() => {});
      lastDetail = `${url} -> ${upstreamRes.status}`;
      console.warn(`[overpass-proxy] ${lastDetail}; retrying`);
    } catch (err) {
      lastDetail = `${url} -> ${String(err)}`;
      console.warn(`[overpass-proxy] ${lastDetail}; retrying`);
    }
    if (i < OVERPASS_ATTEMPTS.length - 1) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }

  console.error('[overpass-proxy] all attempts failed:', lastDetail);
  return json(
    { error: 'overpass_proxy_failed', detail: lastDetail },
    { status: 502 }
  );
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/api/health') {
      return new Response('OK');
    }

    const cityMatch = path.match(/^\/api\/cities\/([^/]+)$/);
    if (cityMatch) {
      return handleCity(decodeURIComponent(cityMatch[1]), req);
    }

    const statsItemMatch = path.match(/^\/api\/stats\/([^/]+)$/);
    if (statsItemMatch) {
      return handleStatsItem(decodeURIComponent(statsItemMatch[1]), req);
    }

    if (path === '/api/stats') {
      return handleStatsList(req);
    }

    if (path === '/api/overpass') {
      return handleOverpass(req);
    }

    const lampsMatch = path.match(/^\/api\/street-lamps\/([^/]+)$/);
    if (lampsMatch) {
      return handleStreetLamps(decodeURIComponent(lampsMatch[1]), req);
    }

    return notFound();
  },
});

console.log(`velokarte-api listening on :${PORT}`);
