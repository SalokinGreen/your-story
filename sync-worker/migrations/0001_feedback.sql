-- Feedback submissions (docs/feedback-design.md section 3).
-- No IP address and no device id is stored, by design.
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  system_id TEXT,
  starter_id TEXT,
  rating INTEGER,
  text TEXT NOT NULL,
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  turn_json TEXT,
  session INTEGER,
  handled INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS feedback_received_at ON feedback (received_at);

-- One row per UTC day: the global daily cap on submissions.
CREATE TABLE IF NOT EXISTS feedback_day (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);
