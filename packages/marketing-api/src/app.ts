import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as Sentry from "@sentry/cloudflare";
import { signupRoute } from "./routes/signup";
import { pricingClickRoute } from "./routes/pricing-click";
import { surveyRoute } from "./routes/survey";
import { statsRoute } from "./routes/stats";
import { referralRoute } from "./routes/referral";
import { feedbackRoute } from "./routes/feedback";
import { leadMagnetDownloadRoute } from "./routes/lead-magnet-download";
import { unsubscribeRoute } from "./routes/unsubscribe";
import { cors } from "./middleware/cors";
import { rateLimit } from "./middleware/rate-limit";
import type { LocalOutbox } from "./integration/local-outbox";
import { scrubSentryEvent } from "./services/sentry";

export interface ApiEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  APOLLO_API_KEY?: string;
  PRODUCT_NAME: string;
  PRODUCT_DOMAIN: string;
  PRODUCT_LOGO_URL: string;
  PRODUCT_BRAND_COLOR: string;
  PRODUCT_ACCENT_COLOR: string;
  CALENDAR_URL: string;
  EMAIL_FROM: string;
  STATS_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  ALLOWED_ORIGIN: string;
  E2E_MODE?: string;
  LOCAL_OUTBOX?: LocalOutbox;
  LEAD_MAGNETS_R2?: R2Bucket;
  POSTHOG_API_KEY?: string;
  SEQUENCER_BASE_URL?: string;
  SEQUENCER_CF_ACCESS_CLIENT_ID?: string;
  SEQUENCER_CF_ACCESS_CLIENT_SECRET?: string;
  // Internal: for testing with a pre-built db instance
  _db?: DrizzleD1Database;
}

export type { DrizzleD1Database };

type HonoEnv = {
  Bindings: ApiEnv;
  Variables: {
    db: DrizzleD1Database;
  };
};

export function createApi(env: ApiEnv) {
  const app = new Hono<HonoEnv>();
  const dbBinding = env.SENTRY_DSN
    ? Sentry.instrumentD1WithSentry(env.DB)
    : env.DB;
  const db = env._db ?? drizzle(dbBinding);

  app.use("*", cors(env.ALLOWED_ORIGIN));

  // Inject closure-captured env into Hono context so routes can access
  // c.env.PRODUCT_NAME etc. even when called via app.request() in tests
  // (app.request() doesn't pass env, unlike app.fetch(req, env, ctx))
  app.use("*", async (c, next) => {
    // c.env is undefined when called via app.request() in tests;
    // initialise it before merging the closure-captured env.
    if (!c.env) (c as unknown as { env: ApiEnv }).env = {} as ApiEnv;
    Object.assign(c.env, env);
    c.set("db", db);
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/health/", (c) => c.json({ ok: true }));

  app.use("/api/signup", rateLimit(5, 60_000, "signup"));
  app.use("/api/pricing-click", rateLimit(10, 60_000, "pricing-click"));
  app.use("/api/survey", rateLimit(10, 60_000, "survey"));
  app.use("/api/referral/*", rateLimit(5, 60_000, "referral"));

  app.route("/api/signup", signupRoute());
  app.route("/api/pricing-click", pricingClickRoute());
  app.route("/api/survey", surveyRoute());
  // Pass null when STATS_SECRET is falsy (undefined OR empty string).
  // Both cases lock the endpoint â€” an empty string is treated as "no secret configured",
  // which denies all access rather than accidentally permitting a trivially-guessable token.
  app.use("/api/stats", rateLimit(10, 60_000, "stats"));
  app.route("/api/stats", statsRoute(env.STATS_SECRET || null));
  app.route("/api/referral", referralRoute());
  app.use("/api/feedback", rateLimit(5, 60_000, "feedback"));
  app.route("/api/feedback", feedbackRoute());
  app.use("/api/lead-magnets/*", rateLimit(20, 60_000, "lead-magnet-download"));
  app.route("/api/lead-magnets", leadMagnetDownloadRoute());
  app.use("/api/unsubscribe", rateLimit(5, 60_000, "unsubscribe"));
  app.route("/api/unsubscribe", unsubscribeRoute());
  if (env.SENTRY_DSN) {
    return Sentry.withSentry(
      () => ({
        dsn: env.SENTRY_DSN!,
        environment: env.ENVIRONMENT ?? "production",
        release: env.CF_VERSION_METADATA?.id,
        tracesSampleRate: 1.0,
        sendDefaultPii: false,
        beforeSend: scrubSentryEvent,
        initialScope: {
          tags: { site: env.PRODUCT_NAME, service: "kaiplan-marketing-api" },
        },
      }),
      app,
    );
  }
  return app;
}
