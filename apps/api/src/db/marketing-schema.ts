import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const signups = sqliteTable("signups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  sourcePage: text("source_page").notNull(),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  surveyCompleted: integer("survey_completed").notNull().default(0),
  reminderSent: integer("reminder_sent").notNull().default(0),
  queuePosition: integer("queue_position").notNull().default(0),
  referralCode: text("referral_code").notNull().unique(),
  surveyToken: text("survey_token").notNull().unique(),
  referredBy: text("referred_by"),
  leadMagnetTitle: text("lead_magnet_title"),
  leadMagnetUrl: text("lead_magnet_url"),
  emailSentAt: text("email_sent_at"),
  unsubscribedAt: text("unsubscribed_at"),
  createdAt: text("created_at").notNull(),
});

export const pricingClicks = sqliteTable("pricing_clicks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tier: text("tier").notNull(),
  sourcePage: text("source_page").notNull(),
  sessionId: text("session_id").notNull(),
  billingPeriod: text("billing_period"),
  createdAt: text("created_at").notNull(),
});

export const surveyResponses = sqliteTable(
  "survey_responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    signupEmail: text("signup_email")
      .notNull()
      .references(() => signups.email),
    questionId: text("question_id").notNull(),
    answer: text("answer").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("survey_responses_unique_idx").on(
      table.signupEmail,
      table.questionId,
    ),
  ],
);

export const referrals = sqliteTable(
  "referrals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referrerEmail: text("referrer_email")
      .notNull()
      .references(() => signups.email),
    referralCode: text("referral_code").notNull(),
    referredEmail: text("referred_email").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("referrals_pair_idx").on(
      table.referralCode,
      table.referredEmail,
    ),
  ],
);

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  message: text("message").notNull(),
  email: text("email"),
  pageUrl: text("page_url").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
});

export const leadMagnetDownloads = sqliteTable(
  "lead_magnet_downloads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    signupEmail: text("signup_email")
      .notNull()
      .references(() => signups.email),
    leadMagnetSlug: text("lead_magnet_slug").notNull(),
    downloadToken: text("download_token").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    downloadedAt: text("downloaded_at"),
    emailSentAt: text("email_sent_at"),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("lead_magnet_downloads_email_slug_idx").on(
      table.signupEmail,
      table.leadMagnetSlug,
    ),
  ],
);

export const emailPreference = sqliteTable(
  "email_preference",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    weddingId: text("wedding_id"),
    preferenceType: text("preference_type").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("email_preference_email_idx").on(table.email),
    uniqueIndex("email_preference_global_unique")
      .on(table.email, table.preferenceType)
      .where(sql`${table.weddingId} IS NULL`),
    uniqueIndex("email_preference_wedding_unique")
      .on(table.email, table.weddingId, table.preferenceType)
      .where(sql`${table.weddingId} IS NOT NULL`),
  ],
);

export const emailUnsubscribeToken = sqliteTable(
  "email_unsubscribe_token",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    weddingId: text("wedding_id"),
    allowedTypes: text("allowed_types", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("email_unsubscribe_token_email_idx").on(table.email)],
);

export const emailSendLog = sqliteTable("email_send_log", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  weddingId: text("wedding_id"),
  emailType: text("email_type").notNull(),
  status: text("status").notNull(),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
});

export const marketingSchema = {
  signups,
  pricingClicks,
  surveyResponses,
  referrals,
  feedback,
  leadMagnetDownloads,
  emailPreference,
  emailUnsubscribeToken,
  emailSendLog,
};
