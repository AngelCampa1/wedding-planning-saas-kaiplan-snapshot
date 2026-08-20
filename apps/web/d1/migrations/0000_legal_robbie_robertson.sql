CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  source_page TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  survey_completed INTEGER NOT NULL DEFAULT 0,
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  queue_position INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT NOT NULL UNIQUE,
  survey_token TEXT NOT NULL UNIQUE,
  referred_by TEXT,
  lead_magnet_title TEXT,
  lead_magnet_url TEXT,
  nurture_unsubscribed_at TEXT,
  created_at TEXT NOT NULL,
  email_sent_at TEXT
);

CREATE TABLE IF NOT EXISTS pricing_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier TEXT NOT NULL,
  source_page TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  billing_period TEXT
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signup_email TEXT NOT NULL REFERENCES signups(email),
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_email TEXT NOT NULL REFERENCES signups(email),
  referral_code TEXT NOT NULL,
  referred_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
