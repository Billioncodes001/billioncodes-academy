-- Optional step-through code walkthroughs for Course Studio text lessons.
-- Additive table (not ALTER), matching 0003, so the migration is safely re-runnable.
CREATE TABLE IF NOT EXISTS learning_lesson_walkthroughs (
  lesson_id TEXT PRIMARY KEY REFERENCES learning_lessons(id) ON DELETE CASCADE,
  walkthrough_json TEXT NOT NULL CHECK (length(walkthrough_json) <= 8000)
);
