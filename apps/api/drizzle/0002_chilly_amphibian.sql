CREATE TABLE "seating_chart" (
	"wedding_id" uuid PRIMARY KEY NOT NULL,
	"chart" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seating_chart" ADD CONSTRAINT "seating_chart_wedding_id_wedding_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."wedding"("id") ON DELETE cascade ON UPDATE no action;