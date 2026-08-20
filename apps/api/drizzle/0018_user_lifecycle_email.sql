CREATE TABLE IF NOT EXISTS "user_lifecycle_email" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "step_key" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "sent_at" timestamp with time zone,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_lifecycle_email_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_lifecycle_email_user_step_unique"
  ON "user_lifecycle_email" USING btree ("user_id","step_key");
CREATE INDEX IF NOT EXISTS "user_lifecycle_email_user_id_idx"
  ON "user_lifecycle_email" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "user_lifecycle_email_step_status_idx"
  ON "user_lifecycle_email" USING btree ("step_key","status");
