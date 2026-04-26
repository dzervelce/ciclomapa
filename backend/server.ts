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

  try {
    const upstreamRes = await fetch(OVERPASS_UPSTREAM, {
      method: 'POST',
      headers: {
        'User-Agent': OVERPASS_UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'data=' + encodeURIComponent(dataParam),
    });

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        'Content-Type':
          upstreamRes.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (err) {
    console.error('[overpass-proxy] failed:', err);
    return json(
      { error: 'overpass_proxy_failed', detail: String(err) },
      { status: 502 }
    );
  }
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
