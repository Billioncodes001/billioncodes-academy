-- Anonymous learning-funnel counters. Aggregates only: one row per day, event and subject
-- (a lesson, practice build or start path). No visitor identifiers, IP addresses or
-- per-event records are ever stored.
CREATE TABLE IF NOT EXISTS learning_metrics (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (day, event, subject)
);
CREATE INDEX IF NOT EXISTS learning_metrics_event_day ON learning_metrics(event, day);
