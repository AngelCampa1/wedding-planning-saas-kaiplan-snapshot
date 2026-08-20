-- Normalize existing preference emails after scoped unique indexes are in place.
-- Delete case-insensitive duplicates first so the lower(trim(email)) update
-- cannot violate the global or wedding-scoped unique indexes.
DELETE FROM email_preference
WHERE id NOT IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(email)), COALESCE(wedding_id, '__global__'), preference_type
        ORDER BY updated_at DESC, created_at DESC, id DESC
      ) AS row_number
    FROM email_preference
  )
  WHERE row_number = 1
);

UPDATE email_preference
SET email = lower(trim(email));
