CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wedding_id" uuid,
  "actor_user_id" text,
  "event_type" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_log_wedding_id_wedding_id_fk"
    FOREIGN KEY ("wedding_id") REFERENCES "public"."wedding"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "audit_log_actor_user_id_user_id_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id")
    ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "audit_log_wedding_created_at_idx"
  ON "audit_log" USING btree ("wedding_id", "created_at");

CREATE INDEX IF NOT EXISTS "audit_log_actor_created_at_idx"
  ON "audit_log" USING btree ("actor_user_id", "created_at");

CREATE INDEX IF NOT EXISTS "audit_log_event_type_idx"
  ON "audit_log" USING btree ("event_type");
