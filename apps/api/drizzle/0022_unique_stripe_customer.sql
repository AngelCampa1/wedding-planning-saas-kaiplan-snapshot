-- Production deploy runs scripts/check-stripe-customer-duplicates.ts first,
-- which creates this index with CREATE UNIQUE INDEX CONCURRENTLY outside
-- Drizzle's transaction. This migration is retained so Drizzle records the
-- schema version and local databases still converge when the index is absent.
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_stripe_customer_id_unique"
  ON "subscription" USING btree ("stripe_customer_id")
  WHERE "stripe_customer_id" IS NOT NULL;
