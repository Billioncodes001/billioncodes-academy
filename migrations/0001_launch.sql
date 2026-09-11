-- Additive migration. Run through Wrangler D1 migrations, never at request time.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('applications', 'project-requests')),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  consent_version TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS submissions_created ON submissions(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS submissions_review ON submissions(status, kind, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS submission_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL,
  status TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'admin',
  version INTEGER NOT NULL,
  UNIQUE(submission_id, version)
);
CREATE INDEX IF NOT EXISTS audit_submission ON submission_audit(submission_id, id DESC);

CREATE TRIGGER IF NOT EXISTS audit_submission_status
AFTER UPDATE OF status ON submissions
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO submission_audit(submission_id, previous_status, status, changed_at, actor, version)
  VALUES (NEW.id, OLD.status, NEW.status, NEW.updated_at, 'admin', NEW.version);
END;

CREATE TABLE IF NOT EXISTS rate_buckets (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_buckets_expiry ON rate_buckets(expires_at);
