ALTER TABLE "subscription" ADD COLUMN "pending_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "pending_checkout_plan" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "pending_checkout_interval" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "pending_checkout_created_at" timestamp with time zone;