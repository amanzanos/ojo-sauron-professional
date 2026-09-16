-- Anonymous, aggregate store-zone analytics only. No visitor-identity column exists anywhere
-- in this schema by design — there is structurally nowhere to record "who" visited a zone,
-- only which zone, for how long, and when.

-- "Deleting" a zone from the editing UI sets active=false rather than removing the row, so
-- historical zone_visits (which reference it by id) stay intact instead of being lost.
CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS zone_visits (
  id SERIAL PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  dwell_ms INTEGER NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zone_visits_ended_at_idx ON zone_visits (ended_at);
CREATE INDEX IF NOT EXISTS zone_visits_zone_id_idx ON zone_visits (zone_id);

-- Citizen reports (WEROS feed + map). Public by design: no visitor-identity column, no
-- API-key gate — anyone running the app can read or post one, same as the feed itself.
CREATE TABLE IF NOT EXISTS citizen_events (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  author_label TEXT NOT NULL DEFAULT 'Vecino/a',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS citizen_events_created_at_idx ON citizen_events (created_at DESC);
