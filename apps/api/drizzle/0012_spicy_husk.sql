ALTER TABLE "wedding" ALTER COLUMN "budget_cents" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "wedding" ALTER COLUMN "budget_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wedding_member" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;