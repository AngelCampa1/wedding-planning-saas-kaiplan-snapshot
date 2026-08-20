import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";
import { wedding } from "./schema";
import { budgetCategory, budgetItem } from "./budget-schema";

export const vendor = pgTable(
  "vendor",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => wedding.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => budgetCategory.id, { onDelete: "restrict" }),
    primaryContactName: text("primary_contact_name").notNull(),
    companyName: text("company_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    contractStatus: text("contract_status")
      .notNull()
      .$type<"none" | "sent" | "signed">()
      .default("none"),
    contractUrl: text("contract_url"),
    contractSentAt: date("contract_sent_at"),
    contractSignedAt: date("contract_signed_at"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // M11: indexes for high-traffic FK/filter columns
    index("vendor_wedding_id_idx").on(table.weddingId),
    index("vendor_category_id_idx").on(table.categoryId),
  ],
);

export const vendorQuote = pgTable(
  "vendor_quote",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    quotedAt: date("quoted_at").notNull(),
    status: text("status")
      .notNull()
      .$type<"pending" | "accepted" | "rejected">()
      .default("pending"),
    budgetItemId: uuid("budget_item_id").references(() => budgetItem.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // M11: index for vendorId FK lookups
    index("vendor_quote_vendor_id_idx").on(table.vendorId),
  ],
);

export const vendorPayment = pgTable(
  "vendor_payment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => vendorQuote.id, { onDelete: "cascade" }),
    paymentType: text("payment_type")
      .notNull()
      .$type<"deposit" | "installment" | "final">(),
    amountCents: integer("amount_cents").notNull(),
    paidAt: date("paid_at").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // M11: index for quoteId FK lookups
    index("vendor_payment_quote_id_idx").on(table.quoteId),
  ],
);
