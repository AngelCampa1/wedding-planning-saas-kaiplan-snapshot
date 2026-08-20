CREATE TABLE IF NOT EXISTS lead_magnet_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signup_email TEXT NOT NULL REFERENCES signups(email),
  lead_magnet_slug TEXT NOT NULL,
  download_token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  downloaded_at TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_magnet_downloads_email_slug_idx
  ON lead_magnet_downloads (signup_email, lead_magnet_slug);

CREATE TABLE IF NOT EXISTS nurture_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signup_email TEXT NOT NULL REFERENCES signups(email),
  lead_magnet_slug TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  send_after TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  delivery_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS nurture_schedule_email_slug_step_idx
  ON nurture_schedule (signup_email, lead_magnet_slug, step_index);

CREATE TABLE IF NOT EXISTS email_preference (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  wedding_id TEXT,
  preference_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS email_preference_email_idx
  ON email_preference (email);

CREATE TABLE IF NOT EXISTS email_unsubscribe_token (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  wedding_id TEXT,
  allowed_types TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS email_unsubscribe_token_email_idx
  ON email_unsubscribe_token (email);

CREATE TABLE IF NOT EXISTS email_send_log (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  wedding_id TEXT,
  email_type TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);
