CREATE TABLE IF NOT EXISTS learner_users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS learner_profiles (
  user_id TEXT PRIMARY KEY REFERENCES learner_users(id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL, consent_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_courses (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'Beginner',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  price_minor INTEGER NOT NULL DEFAULT 0 CHECK(price_minor >= 0 AND price_minor <= 100000000), currency TEXT NOT NULL DEFAULT 'NGN' CHECK(currency = 'NGN'),
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_lessons (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE, title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('text','pdf','video')), body_json TEXT NOT NULL DEFAULT '[]',
  resource_id TEXT, position INTEGER NOT NULL CHECK(position >= 0), UNIQUE(course_id, position)
);
CREATE TABLE IF NOT EXISTS learning_resources (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('pdf','video')), object_key TEXT UNIQUE, stream_uid TEXT UNIQUE, filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK(size_bytes >= 0), status TEXT NOT NULL CHECK(status IN ('uploading','ready','failed')),
  created_at TEXT NOT NULL, rights_confirmed INTEGER NOT NULL CHECK(rights_confirmed = 1)
);
CREATE TABLE IF NOT EXISTS learning_enrolments (
  user_id TEXT NOT NULL REFERENCES learner_users(id) ON DELETE CASCADE, course_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('free','verified-payment')), payment_reference TEXT,
  created_at TEXT NOT NULL, PRIMARY KEY(user_id, course_id),
  CHECK(source = 'free' OR payment_reference IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS learning_progress (
  user_id TEXT NOT NULL, course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, completed INTEGER NOT NULL CHECK(completed IN (0,1)),
  updated_at TEXT NOT NULL, PRIMARY KEY(user_id, course_id, lesson_id),
  FOREIGN KEY(user_id, course_id) REFERENCES learning_enrolments(user_id, course_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS training_cohorts (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, year INTEGER NOT NULL CHECK(year BETWEEN 2026 AND 2100),
  quarter INTEGER NOT NULL CHECK(quarter IN (1,4)), status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','open','closed')),
  opens_at TEXT, closes_at TEXT, starts_at TEXT, format TEXT NOT NULL DEFAULT 'online' CHECK(format IN ('online','physical','hybrid')),
  details TEXT NOT NULL, tuition_note TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(year, quarter)
);
CREATE TABLE IF NOT EXISTS training_applications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES learner_users(id) ON DELETE CASCADE,
  cohort_id TEXT NOT NULL REFERENCES training_cohorts(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','under-review','offered','declined','withdrawn')),
  data_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, consent_at TEXT, submitted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, cohort_id)
);
CREATE INDEX IF NOT EXISTS training_applications_owner ON training_applications(user_id);
CREATE TABLE IF NOT EXISTS learning_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  action TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL
);
