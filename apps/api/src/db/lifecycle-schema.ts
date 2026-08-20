import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const userLifecycleEmail = pgTable(
  "user_lifecycle_email",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    status: text("status")
      .notNull()
      .$type<"pending" | "sent" | "failed">()
      .default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_lifecycle_email_user_step_unique").on(
      table.userId,
      table.stepKey,
    ),
    index("user_lifecycle_email_user_id_idx").on(table.userId),
    index("user_lifecycle_email_step_status_idx").on(
      table.stepKey,
      table.status,
    ),
  ],
);
