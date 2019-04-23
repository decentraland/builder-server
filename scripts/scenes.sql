DROP TABLE IF EXISTS scenes;

CREATE TABLE scenes (
  id TEXT NOT NULL PRIMARY KEY, 
  value JSONB NOT NULL,
  email TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  parcels_count INTEGER NOT NULL,
  triangles_count INTEGER NOT NULL,
  items_count INTEGER NOT NULL,
  sessions INTEGER NOT NULL,
  days INTEGER NOT NULL,
  n_events INTEGER NOT NULL,
  create_time INTEGER NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);