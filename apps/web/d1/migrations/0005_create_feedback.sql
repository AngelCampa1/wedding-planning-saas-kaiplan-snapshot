CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  email TEXT,
  page_url TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
