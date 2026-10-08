-- Additive Course Studio tables. New tables (not ALTER) keep the migration safely re-runnable.
CREATE TABLE IF NOT EXISTS learning_lesson_sections (
  lesson_id TEXT PRIMARY KEY REFERENCES learning_lessons(id) ON DELETE CASCADE,
  section TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_media_uploads (
  resource_id TEXT PRIMARY KEY REFERENCES learning_resources(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL, content_type TEXT NOT NULL CHECK(content_type IN ('video/mp4','video/webm')),
  part_size INTEGER NOT NULL CHECK(part_size > 0), part_count INTEGER NOT NULL CHECK(part_count BETWEEN 1 AND 10000),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_upload_parts (
  resource_id TEXT NOT NULL REFERENCES learning_media_uploads(resource_id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 10000), etag TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0), PRIMARY KEY(resource_id, part_number)
);
