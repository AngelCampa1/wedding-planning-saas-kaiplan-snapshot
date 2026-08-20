import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema";

export const wedding = pgTable("wedding", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  date: date("date"),
  // NULL means "no budget configured" (show estimated totals as the budget).
  // 0 means "budget explicitly set to zero".
  budgetCents: integer("budget_cents"),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("America/New_York"),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  status: text("status")
    .notNull()
    .$type<"planning" | "archived">()
    .default("planning"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const weddingMember = pgTable(
  "wedding_member",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => wedding.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().$type<"owner" | "editor" | "viewer">(),
    invitedEmail: text("invited_email"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("weddingMember_weddingId_userId_unique").on(
      table.weddingId,
      table.userId,
    ),
    uniqueIndex("weddingMember_weddingId_invitedEmail_unique").on(
      table.weddingId,
      table.invitedEmail,
    ),
    // M11: index for userId FK lookups (member lookups by user)
    index("wedding_member_user_id_idx").on(table.userId),
    check(
      "wedding_member_role_check",
      sql`${table.role} in ('owner', 'editor', 'viewer')`,
    ),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id").references(() => wedding.id, {
      onDelete: "cascade",
    }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_log_wedding_created_at_idx").on(
      table.weddingId,
      table.createdAt,
    ),
    index("audit_log_actor_created_at_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("audit_log_event_type_idx").on(table.eventType),
  ],
);

export { subscription, processedWebhookEvent } from "./billing-schema";
export { userLifecycleEmail } from "./lifecycle-schema";
export { budgetCategory, budgetItem } from "./budget-schema";
export { guest } from "./guest-schema";
export { weddingWebsite, householdRsvpToken } from "./wedding-website-schema";
export { seatingChart } from "./seating-schema";
export { vendor, vendorQuote, vendorPayment } from "./vendor-schema";
export { user, session, account, verification } from "./auth-schema";
export { checklistTask, milestoneBucketEnum } from "./checklist-schema";
