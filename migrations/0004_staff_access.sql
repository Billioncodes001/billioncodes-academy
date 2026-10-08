-- Individual staff access. Additive tables only; the shared ADMIN_TOKEN remains the owner bootstrap.
-- A grant is made by an owner for a verified email address. The Firebase UID is bound on first
-- successful staff sign-in, so a later account that reuses the address cannot inherit the grant.
CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK(email = lower(email) AND length(email) BETWEEN 3 AND 254),
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('owner','editor','reviewer')),
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  uid TEXT UNIQUE,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS staff_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  email TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('grant','role','revoke')),
  role TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
