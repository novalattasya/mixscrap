-- comics table: metadata per komik
CREATE TABLE IF NOT EXISTS comics (
  id SERIAL PRIMARY KEY,
  param TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  thumbnail TEXT,
  synopsis TEXT,
  genres TEXT, -- JSON encoded array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- chapters table: tiap chapter dari komik
CREATE TABLE IF NOT EXISTS chapters (
  id SERIAL PRIMARY KEY,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL,
  param TEXT NOT NULL,
  release_date TEXT,
  detail_url TEXT NOT NULL,
  seq INTEGER NOT NULL, -- sequence number to keep ordering (higher = newer)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comic_id, param)
);

-- pages table: tiap file image link per chapter
CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, -- page order starting from 1
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chapter_id, idx)
);

-- simple run log
CREATE TABLE IF NOT EXISTS meta_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  status TEXT,
  details TEXT
);
