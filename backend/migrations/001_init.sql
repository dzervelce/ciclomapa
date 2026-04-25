-- Initial schema for velokarte.
-- Stores OSM cycling-infrastructure data per Latvian city as JSONB blobs.
-- No PostGIS required: this is a keyed cache, not a spatial query store.

CREATE TABLE IF NOT EXISTS cities (
    slug         TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    geojson      JSONB NOT NULL,
    lengths      JSONB NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stats (
    slug         TEXT PRIMARY KEY,
    lengths      JSONB NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cities_updated_at_idx ON cities(updated_at);
