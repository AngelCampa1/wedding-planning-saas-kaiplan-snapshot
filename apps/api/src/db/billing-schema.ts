import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  BillingInterval,
  BillingPlan,
  BillingStatus,
} from "@kaiplan/shared";
import { user } from "./auth-schema";

export const subscription = pgTable(
  "subscription",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    plan: text("plan").notNull().$type<BillingPlan>().default("free"),
    status: text("status")
      .notNull()
      .$type<BillingStatus>()
      .default("inactive"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    billingGateRequiredAt: timestamp("billing_gate_required_at", {
      withTimezone: true,
    }),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndingReminderSentAt: timestamp("trial_ending_reminder_sent_at", {
      withTimezone: true,
    }),
    trialEndingReminderClaimedAt: timestamp(
      "trial_ending_reminder_claimed_at",
      {
        withTimezone: true,
      },
    ),
    pendingCheckoutSessionId: text("pending_checkout_session_id"),
    pendingCheckoutPlan: text("pending_checkout_plan").$type<BillingPlan>(),
    pendingCheckoutInterval: text(
      "pending_checkout_interval",
    ).$type<BillingInterval>(),
    pendingCheckoutCreatedAt: timestamp("pending_checkout_created_at", {
      withTimezone: true,
    }),
    vendorsFirstUsedAt: timestamp("vendors_first_used_at", {
      withTimezone: true,
    }),
    extraPlannerFirstUsedAt: timestamp("extra_planner_first_used_at", {
      withTimezone: true,
    }),
    weddingWebsiteFirstUsedAt: timestamp("wedding_website_first_used_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_stripe_customer_id_unique")
      .on(table.stripeCustomerId)
      .where(sql`${table.stripeCustomerId} is not null`),
  ],
);

export const processedWebhookEvent = pgTable(
  "processed_webhook_event",
  {
    eventId: text("event_id").primaryKey(),
    type: text("type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // M11: index for processedAt used in cleanup queries
    index("processed_webhook_event_processed_at_idx").on(table.processedAt),
  ],
);
