CREATE TABLE "guest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"primary_guest_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"side" text DEFAULT 'mutual' NOT NULL,
	"group_name" text,
	"dietary_tags" text[] DEFAULT '{}' NOT NULL,
	"dietary_notes" text,
	"rsvp_status" text DEFAULT 'pending' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_wedding_name_primary" UNIQUE("wedding_id","first_name","last_name","primary_guest_id")
);
--> statement-breakpoint
ALTER TABLE "guest" ADD CONSTRAINT "guest_wedding_id_wedding_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."wedding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest" ADD CONSTRAINT "guest_primary_guest_id_guest_id_fk" FOREIGN KEY ("primary_guest_id") REFERENCES "public"."guest"("id") ON DELETE cascade ON UPDATE no action;