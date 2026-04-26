-- Per-city cache of OSM highway=street_lamp nodes.
-- Stored as a single GeoJSON FeatureCollection per city slug, refreshed
-- on demand from Overpass with a long staleness window (lamps rarely move).
CREATE TABLE IF NOT EXISTS street_lamps (
    slug         TEXT PRIMARY KEY,
    area_label   TEXT NOT NULL,
    geojson      JSONB NOT NULL,
    point_count  INTEGER NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS street_lamps_updated_at_idx ON street_lamps(updated_at);
