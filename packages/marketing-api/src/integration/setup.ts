import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import { createApi } from "../app";
import type { ApiEnv } from "../app";
import {
  hits,
  identifierBuckets,
  resetIdentifierPruneClock,
} from "../middleware/rate-limit";
import { createLocalOutbox } from "./local-outbox";

const DDL = `
  CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    source_page TEXT NOT NULL,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    survey_completed INTEGER NOT NULL DEFAULT 0,
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    queue_position INTEGER NOT NULL DEFAULT 0,
    referral_code TEXT NOT NULL UNIQUE,
    referred_by TEXT,
    survey_token TEXT NOT NULL UNIQUE,
    lead_magnet_title TEXT,
    lead_magnet_url TEXT,
    email_sent_at TEXT,
    email_send_claimed_at TEXT,
    unsubscribed_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pricing_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier TEXT NOT NULL,
    source_page TEXT NOT NULL,
    session_id TEXT NOT NULL,
    billing_period TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signup_email TEXT NOT NULL REFERENCES signups(email),
    question_id TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (signup_email, question_id)
  );
  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_email TEXT NOT NULL REFERENCES signups(email),
    referral_code TEXT NOT NULL,
    referred_email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (referral_code, referred_email)
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    email TEXT,
    page_url TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lead_magnet_downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signup_email TEXT NOT NULL REFERENCES signups(email),
    lead_magnet_slug TEXT NOT NULL,
    download_token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    downloaded_at TEXT,
    email_sent_at TEXT,
    email_send_claimed_at TEXT,
    download_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS lead_magnet_downloads_email_slug_idx
    ON lead_magnet_downloads (signup_email, lead_magnet_slug);
`;

export async function makeDb() {
  const client = createClient({
    url: `file:${join(tmpdir(), `marketing-api-${crypto.randomUUID()}.db`)}`,
  });
  await client.executeMultiple(DDL);
  return drizzle(client, { schema });
}

const baseEnv: Omit<ApiEnv, "_db"> = {
  DB: null as unknown as D1Database,
  RESEND_API_KEY: "test-resend-key",
  APOLLO_API_KEY: "test-apollo-key",
  PRODUCT_NAME: "Horiva",
  PRODUCT_DOMAIN: "horiva.app",
  PRODUCT_LOGO_URL: "https://horiva.app/logo.png",
  PRODUCT_BRAND_COLOR: "#6B2D8B",
  PRODUCT_ACCENT_COLOR: "#f59e0b",
  CALENDAR_URL: "https://cal.com/horiva",
  EMAIL_FROM: "Angel Campa <angel.campa@kaiplan.app>",
  STATS_SECRET: "test-secret",
  ALLOWED_ORIGIN: "https://test.app",
  ENVIRONMENT: "test",
  E2E_MODE: "true",
  LOCAL_OUTBOX: createLocalOutbox(),
};

export function makeLocalEnv(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return {
    ...baseEnv,
    LOCAL_OUTBOX: createLocalOutbox(),
    ...overrides,
  };
}

export async function makeApp(overrides: Partial<ApiEnv> = {}) {
  const db = await makeDb();
  return createApi({
    ...makeLocalEnv(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- makeDb returns a LibSQLDatabase (integration tests run on a temp-file libSQL database) but ApiEnv._db is typed DrizzleD1Database; the two drizzle drivers are nominally incompatible despite the query surface used here being identical
    _db: db as any,
    ...overrides,
  });
}

/** Clear the shared rate-limit hit counters between tests. */
export function clearRateLimit() {
  hits.clear();
  identifierBuckets.clear();
  resetIdentifierPruneClock();
}
