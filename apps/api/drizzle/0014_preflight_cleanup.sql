-- M11: Add missing indexes on high-traffic FK / filter columns.
-- All indexes use IF NOT EXISTS so this migration is safe to re-run.

-- wedding_member.user_id — used in every session-gated request to resolve the
-- caller's role; without an index every request does a full table scan.
CREATE INDEX IF NOT EXISTS "wedding_member_user_id_idx"
  ON "wedding_member" ("user_id");

-- email_preference.email — queried before every outbound email to check
-- opt-out status.
CREATE INDEX IF NOT EXISTS "email_preference_email_idx"
  ON "email_preference" ("email");

-- email_unsubscribe_token.email — queried by the unsubscribe flow and by the
-- M14 cleanup routine (prune expired/used tokens for a given email).
CREATE INDEX IF NOT EXISTS "email_unsubscribe_token_email_idx"
  ON "email_unsubscribe_token" ("email");

-- guest.wedding_id — the primary fan-out key for every guest-list query.
CREATE INDEX IF NOT EXISTS "guest_wedding_id_idx"
  ON "guest" ("wedding_id");

-- guest.primary_guest_id — used for household grouping (plus-one lookups).
CREATE INDEX IF NOT EXISTS "guest_primary_guest_id_idx"
  ON "guest" ("primary_guest_id");

-- budget_category.wedding_id — the join key for every budget summary query.
CREATE INDEX IF NOT EXISTS "budget_category_wedding_id_idx"
  ON "budget_category" ("wedding_id");

-- budget_item.category_id — the join key for per-category item breakdowns.
CREATE INDEX IF NOT EXISTS "budget_item_category_id_idx"
  ON "budget_item" ("category_id");

-- vendor.wedding_id — primary fan-out key for vendor list queries.
CREATE INDEX IF NOT EXISTS "vendor_wedding_id_idx"
  ON "vendor" ("wedding_id");

-- vendor.category_id — used for category-scoped vendor filtering.
CREATE INDEX IF NOT EXISTS "vendor_category_id_idx"
  ON "vendor" ("category_id");

-- vendor_quote.vendor_id — FK join for quote lookups per vendor.
CREATE INDEX IF NOT EXISTS "vendor_quote_vendor_id_idx"
  ON "vendor_quote" ("vendor_id");

-- vendor_payment.quote_id — FK join for payment lookups per quote.
CREATE INDEX IF NOT EXISTS "vendor_payment_quote_id_idx"
  ON "vendor_payment" ("quote_id");

-- checklist_task.wedding_id — primary fan-out key for checklist queries.
CREATE INDEX IF NOT EXISTS "checklist_task_wedding_id_idx"
  ON "checklist_task" ("wedding_id");

-- processed_webhook_event.processed_at — used by the cleanup job to prune
-- old rows efficiently (range scan on timestamp).
CREATE INDEX IF NOT EXISTS "processed_webhook_event_processed_at_idx"
  ON "processed_webhook_event" ("processed_at");
