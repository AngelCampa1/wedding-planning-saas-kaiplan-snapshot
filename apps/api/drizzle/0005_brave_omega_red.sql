CREATE TABLE "household_rsvp_token" (
	"token" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"primary_guest_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_rsvp_token_primary_guest_unique" UNIQUE("primary_guest_id")
);
--> statement-breakpoint
CREATE TABLE "wedding_website" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"template" text NOT NULL,
	"draft_content" jsonb NOT NULL,
	"published_slug" text,
	"published_template" text,
	"published_content" jsonb DEFAULT 'null'::jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wedding_website_wedding_id_unique" UNIQUE("wedding_id"),
	CONSTRAINT "wedding_website_slug_unique" UNIQUE("slug"),
	CONSTRAINT "wedding_website_published_slug_unique" UNIQUE("published_slug")
);
--> statement-breakpoint
ALTER TABLE "household_rsvp_token" ADD CONSTRAINT "household_rsvp_token_wedding_id_wedding_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."wedding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_rsvp_token" ADD CONSTRAINT "household_rsvp_token_primary_guest_id_guest_id_fk" FOREIGN KEY ("primary_guest_id") REFERENCES "public"."guest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_website" ADD CONSTRAINT "wedding_website_wedding_id_wedding_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."wedding"("id") ON DELETE cascade ON UPDATE no action;