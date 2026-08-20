import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { wedding } from "./schema";

export const milestoneBucketEnum = pgEnum("milestone_bucket", [
  "12mo_plus",
  "9_to_12mo",
  "6_to_9mo",
  "3_to_6mo",
  "1_to_3mo",
  "under_1mo",
  "week_of",
  "day_of",
]);

export const checklistTask = pgTable(
  "checklist_task",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => wedding.id, { onDelete: "cascade" }),
    bucket: milestoneBucketEnum("bucket").notNull().default("3_to_6mo"),
    title: text("title").notNull(),
    notes: text("notes"),
    dueOffsetDays: integer("due_offset_days"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // M11: index for weddingId FK lookups
    index("checklist_task_wedding_id_idx").on(table.weddingId),
  ],
);
