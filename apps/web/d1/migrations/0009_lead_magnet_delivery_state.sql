ALTER TABLE lead_magnet_downloads
  ADD COLUMN email_sent_at TEXT;

UPDATE lead_magnet_downloads
SET email_sent_at = created_at
WHERE email_sent_at IS NULL;
