-- Debug Defender leaderboard. A run is opened by the server when a game starts,
-- so every submitted score is tied to a server-timed session. No raw IP is stored:
-- ip_hash is an HMAC of the day and address, used only for rate limiting.
CREATE TABLE IF NOT EXISTS arcade_runs (
  id TEXT PRIMARY KEY NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  submitted INTEGER NOT NULL DEFAULT 0 CHECK (submitted IN (0, 1))
);
CREATE INDEX IF NOT EXISTS arcade_runs_expiry ON arcade_runs(expires_at);

CREATE TABLE IF NOT EXISTS arcade_scores (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 16),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 1000000),
  wave INTEGER NOT NULL CHECK (wave BETWEEN 1 AND 500),
  duration INTEGER NOT NULL CHECK (duration >= 0),
  created_at TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  moderated_by TEXT
);
CREATE INDEX IF NOT EXISTS arcade_scores_rank ON arcade_scores(hidden, score DESC, created_at);
CREATE INDEX IF NOT EXISTS arcade_scores_recent ON arcade_scores(created_at DESC);
