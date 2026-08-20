ALTER TABLE signups
  ADD COLUMN email_send_claimed_at TEXT;

ALTER TABLE lead_magnet_downloads
  ADD COLUMN email_send_claimed_at TEXT;
