import { sql } from 'bun:sql';

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
    await sql`
      INSERT INTO cities (slug, name, geojson, lengths, updated_at)
      VALUES (
        ${slug},
        ${body.name},
        ${JSON.stringify(body.geoJson)}::jsonb,
        ${JSON.stringify(body.lengths)}::jsonb,
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
      VALUES (${slug}, ${JSON.stringify(body.lengths)}::jsonb, now())
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

    return notFound();
  },
});

console.log(`velokarte-api listening on :${PORT}`);
