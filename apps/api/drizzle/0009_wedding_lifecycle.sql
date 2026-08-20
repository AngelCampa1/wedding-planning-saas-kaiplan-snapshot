ALTER TABLE "wedding" ADD COLUMN "archived_at" timestamp with time zone;
ALTER TABLE "wedding" ADD COLUMN "status" text NOT NULL DEFAULT 'planning';
