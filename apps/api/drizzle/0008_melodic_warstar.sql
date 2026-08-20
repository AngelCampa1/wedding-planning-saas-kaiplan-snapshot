CREATE TYPE "public"."milestone_bucket" AS ENUM('12mo_plus', '9_to_12mo', '6_to_9mo', '3_to_6mo', '1_to_3mo', 'under_1mo', 'week_of', 'day_of');--> statement-breakpoint
CREATE TABLE "checklist_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"bucket" "milestone_bucket" DEFAULT '3_to_6mo' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"due_offset_days" integer,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_task" ADD CONSTRAINT "checklist_task_wedding_id_wedding_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."wedding"("id") ON DELETE cascade ON UPDATE no action;