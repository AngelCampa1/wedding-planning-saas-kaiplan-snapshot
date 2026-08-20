ALTER TABLE "guest" DROP CONSTRAINT "guest_wedding_name_primary";--> statement-breakpoint
ALTER TABLE "wedding" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding" ADD CONSTRAINT "wedding_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_primary_name_unique" ON "guest" USING btree ("wedding_id","first_name","last_name") WHERE "guest"."primary_guest_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_plusone_name_unique" ON "guest" USING btree ("wedding_id","first_name","last_name","primary_guest_id") WHERE "guest"."primary_guest_id" IS NOT NULL;