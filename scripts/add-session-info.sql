CREATE TEMP TABLE tmp_x (
  id INTEGER,
  project_id TEXT NOT NULL PRIMARY KEY, 
  sessions INTEGER,
  days INTEGER,
  n_events INTEGER,
  create_time INTEGER
);

\copy tmp_x FROM :scriptpath (FORMAT csv, HEADER true);

UPDATE scenes
  SET sessions = tmp_x.sessions,
      days = tmp_x.days,
      n_events = tmp_x.n_events,
      create_time = tmp_x.create_time
FROM tmp_x
WHERE scenes.id = tmp_x.project_id;

DROP TABLE tmp_x;