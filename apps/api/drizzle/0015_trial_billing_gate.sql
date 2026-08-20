ALTER TABLE "subscription" ADD COLUMN "billing_gate_required_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "trial_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "trial_ending_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_category_wedding_id_idx" ON "budget_category" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_item_category_id_idx" ON "budget_item" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_task_wedding_id_idx" ON "checklist_task" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_preference_email_idx" ON "email_preference" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_unsubscribe_token_email_idx" ON "email_unsubscribe_token" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_wedding_id_idx" ON "guest" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_primary_guest_id_idx" ON "guest" USING btree ("primary_guest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_webhook_event_processed_at_idx" ON "processed_webhook_event" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_wedding_id_idx" ON "vendor" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_category_id_idx" ON "vendor" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_payment_quote_id_idx" ON "vendor_payment" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_quote_vendor_id_idx" ON "vendor_quote" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wedding_member_user_id_idx" ON "wedding_member" USING btree ("user_id");
