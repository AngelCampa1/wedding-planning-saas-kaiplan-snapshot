import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { wedding } from "./schema";

export const guest = pgTable(
  "guest",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => wedding.id, { onDelete: "cascade" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle self-referencing FKs require any cast for circular reference
    primaryGuestId: uuid("primary_guest_id").references((): any => guest.id, {
      onDelete: "cascade",
    }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    side: text("side").notNull().default("mutual"),
    groupName: text("group_name"),
    dietaryTags: text("dietary_tags").array().notNull().default([]),
    dietaryNotes: text("dietary_notes"),
    rsvpStatus: text("rsvp_status").notNull().default("pending"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Primary guests (primaryGuestId IS NULL): unique by wedding + name
    uniqueIndex("guest_primary_name_unique")
      .on(table.weddingId, table.firstName, table.lastName)
      .where(sql`${table.primaryGuestId} IS NULL`),
    // Plus-ones (primaryGuestId IS NOT NULL): unique by wedding + name + primary
    uniqueIndex("guest_plusone_name_unique")
      .on(
        table.weddingId,
        table.firstName,
        table.lastName,
        table.primaryGuestId,
      )
      .where(sql`${table.primaryGuestId} IS NOT NULL`),
    // M11: indexes for high-traffic FK/filter columns
    index("guest_wedding_id_idx").on(table.weddingId),
    index("guest_primary_guest_id_idx").on(table.primaryGuestId),
  ],
);
