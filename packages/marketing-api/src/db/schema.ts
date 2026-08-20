import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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
  emailSendClaimedAt: text("email_send_claimed_at"),
  unsubscribedAt: text("unsubscribed_at"),
  createdAt: text("created_at").notNull(),
});

export const pricingClicks = sqliteTable("pricing_clicks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tier: text("tier").notNull(),
  sourcePage: text("source_page").notNull(),
  sessionId: text("session_id").notNull(),
  billingPeriod: text("billing_period"), // nullable — "monthly" | "annual" | null
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
  (t) => [
    uniqueIndex("survey_responses_unique_idx").on(t.signupEmail, t.questionId),
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
  (t) => [
    uniqueIndex("referrals_pair_idx").on(t.referralCode, t.referredEmail),
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
    emailSendClaimedAt: text("email_send_claimed_at"),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("lead_magnet_downloads_email_slug_idx").on(
      t.signupEmail,
      t.leadMagnetSlug,
    ),
  ],
);

export const schema = {
  signups,
  pricingClicks,
  surveyResponses,
  referrals,
  feedback,
  leadMagnetDownloads,
};
