DROP TABLE IF EXISTS scenes;

CREATE TABLE scenes (
  id TEXT NOT NULL PRIMARY KEY, 
  value JSONB,
  email TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  parcels_count INTEGER,
  triangles_count INTEGER,
  items_count INTEGER,
  env TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
