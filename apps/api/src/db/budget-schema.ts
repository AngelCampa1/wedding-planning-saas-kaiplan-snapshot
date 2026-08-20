import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { wedding } from "./schema";

export const budgetCategory = pgTable(
  "budget_category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => wedding.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    estimatedCents: integer("estimated_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("budget_category_wedding_name").on(table.weddingId, table.name),
    // M11: index for weddingId FK lookups
    index("budget_category_wedding_id_idx").on(table.weddingId),
  ],
);

export const budgetItem = pgTable(
  "budget_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => budgetCategory.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    estimatedCents: integer("estimated_cents").notNull().default(0),
    quotedCents: integer("quoted_cents").notNull().default(0),
    paidCents: integer("paid_cents").notNull().default(0),
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
    // M11: index for categoryId FK lookups
    index("budget_item_category_id_idx").on(table.categoryId),
  ],
);
