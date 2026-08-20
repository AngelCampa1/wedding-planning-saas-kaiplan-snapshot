CREATE TABLE "vendor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"primary_contact_name" text NOT NULL,
	"company_name" text NOT NULL,
	"email" text,
	"phone" text,
	"contract_status" text DEFAULT 'none' NOT NULL,
	"contract_url" text,
	"contract_sent_at" date,
	"contract_signed_at" date,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"payment_type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_at" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"quoted_at" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"budget_item_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_wedding_id_wedding_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."wedding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_category_id_budget_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_quote_id_vendor_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."vendor_quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_quote" ADD CONSTRAINT "vendor_quote_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_quote" ADD CONSTRAINT "vendor_quote_budget_item_id_budget_item_id_fk" FOREIGN KEY ("budget_item_id") REFERENCES "public"."budget_item"("id") ON DELETE set null ON UPDATE no action;