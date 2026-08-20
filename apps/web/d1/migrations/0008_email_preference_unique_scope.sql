-- Keep only the latest row per email/scope/preference type before enforcing
-- uniqueness. SQLite permits duplicate NULLs in composite unique indexes, so
-- global and wedding-scoped preferences need separate partial indexes.
DELETE FROM email_preference
WHERE id NOT IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY email, COALESCE(wedding_id, '__global__'), preference_type
        ORDER BY updated_at DESC, created_at DESC, id DESC
      ) AS row_number
    FROM email_preference
  )
  WHERE row_number = 1
);

CREATE UNIQUE INDEX IF NOT EXISTS email_preference_global_unique
  ON email_preference (email, preference_type)
  WHERE wedding_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_preference_wedding_unique
  ON email_preference (email, wedding_id, preference_type)
  WHERE wedding_id IS NOT NULL;
