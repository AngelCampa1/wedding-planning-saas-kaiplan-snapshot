import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { wedding } from "./schema";

export const seatingChart = pgTable("seating_chart", {
  weddingId: uuid("wedding_id")
    .primaryKey()
    .notNull()
    .references(() => wedding.id, { onDelete: "cascade" }),
  chart: jsonb("chart").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
