import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/env";
import { createDb } from "./db/client";
import { createMarketingDb } from "./db/marketing-client";
import { createLocalMarketingDb } from "./db/local-marketing-db";
import { createAuth } from "./auth";
import { createStripeClient } from "./lib/stripe";
import { weddingRoutes } from "./routes/weddings";
import { guestRoutes } from "./routes/guests";
import { budgetRoutes } from "./routes/budget";
import { checklistRoutes } from "./routes/checklist";
import { seatingRoutes } from "./routes/seating";
import { vendorRoutes } from "./routes/vendors";
import { exportRoutes } from "./routes/export";
import {
  publicWeddingWebsiteRoutes,
  weddingWebsiteRoutes,
} from "./routes/wedding-website";
import { healthRoutes } from "./routes/health";
import { billingRoutes } from "./routes/billing";
import {
  cleanupOldEmailOperationalData,
  createEmailService,
  createNoopEmailService,
  getCapturedPasswordResets,
} from "./lib/email";
import {
  cleanupOldProcessedEvents,
  dispatchTrialEndingReminders,
  expireElapsedFreeTrials,
} from "./lib/billing";
import { dispatchSignupLifecycleEmails } from "./lib/lifecycle-emails";
import {
  emailPreferencesRoutes,
  publicEmailPreferencesRoutes,
} from "./routes/email-preferences";
import { feedbackRoutes } from "./routes/feedback";
import {
  buildCorsOriginsForPath,
  resolveDatabaseConnectionString,
} from "./lib/runtime";
import { csrfMiddleware } from "./middleware/csrf";
import { isE2eAllowed } from "./lib/e2e-gate";
import { validateEnv } from "./lib/env-schema";
import { isMalformedJsonBodyError } from "./lib/json-body";
import {
  captureApiException,
  scrubSentryPath,
  shouldCaptureApiException,
  withSentry,
} from "./lib/sentry";
import {
  createRateLimitMiddleware,
  ipKeyFn,
  RateLimiter,
} from "./lib/rate-limit";

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 3000,
): Promise<T> {
  const isTransientMessage = (msg: string) =>
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("connect");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Drizzle wraps the underlying driver error as `error.cause`, so we
      // must inspect both layers to detect transient Hyperdrive/pg failures.
      const ownMsg = err instanceof Error ? err.message.toLowerCase() : "";
      const cause = err instanceof Error ? err.cause : undefined;
      const causeMsg =
        cause instanceof Error ? cause.message.toLowerCase() : "";
      const isTransient =
        err instanceof Error &&
        (isTransientMessage(ownMsg) || isTransientMessage(causeMsg));
      if (attempt === retries || !isTransient) throw err;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("unreachable");
}

const app = new Hono<{ Bindings: Env }>();

function applySecurityHeaders(headers: Headers): void {
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
}

app.use("*", async (c, next) => {
  await next();
  applySecurityHeaders(c.res.headers);
});

function createRuntimeMarketingDb(env: Env) {
  if (!env.MARKETING_DB) {
    if (isE2eAllowed(env)) {
      return createLocalMarketingDb();
    }

    throw new Error("MARKETING_DB binding is not configured.");
  }

  return createMarketingDb(env.MARKETING_DB);
}

function createRuntimeEmailService(db: ReturnType<typeof createDb>, env: Env) {
  if (isE2eAllowed(env)) {
    return createNoopEmailService();
  }

  return createEmailService(db, env, undefined, createRuntimeMarketingDb(env));
}

function createRuntimeAuth(
  db: ReturnType<typeof createDb>,
  env: Env,
  emailService: ReturnType<typeof createRuntimeEmailService>,
) {
  return createAuth(db, env, {
    sendPasswordReset: emailService.sendPasswordReset,
    sendEmailVerification: emailService.sendEmailVerification,
  });
}

function forwardToChildRouter(
  c: Context<{ Bindings: Env }>,
  routes: ReturnType<typeof seatingRoutes>,
) {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/weddings/, "");
  return routes.fetch(new Request(url.toString(), c.req.raw), c.env);
}

function forwardToWeddingRouter(
  c: Context<{ Bindings: Env }>,
  routes:
    | ReturnType<typeof weddingRoutes>
    | ReturnType<typeof guestRoutes>
    | ReturnType<typeof vendorRoutes>
    | ReturnType<typeof budgetRoutes>
    | ReturnType<typeof checklistRoutes>
    | ReturnType<typeof exportRoutes>,
) {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/weddings/, "") || "/";
  return routes.fetch(new Request(url.toString(), c.req.raw), c.env);
}

function forwardToPublicRouter(
  c: Context<{ Bindings: Env }>,
  routes: ReturnType<typeof publicWeddingWebsiteRoutes>,
) {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/public/, "");
  return routes.fetch(new Request(url.toString(), c.req.raw), c.env);
}

function forwardToPublicEmailPreferencesRouter(
  c: Context<{ Bindings: Env }>,
  routes: ReturnType<typeof publicEmailPreferencesRoutes>,
) {
  const url = new URL(c.req.url);
  url.pathname =
    url.pathname.replace(/^\/api\/public\/email\/preferences/, "") || "/";
  return routes.fetch(new Request(url.toString(), c.req.raw), c.env);
}

// ---------------------------------------------------------------------------
// Global error handler (Task 19)
//
// Catches any unhandled error thrown by route handlers. In development / E2E
// mode the original error message is returned so developers can diagnose
// failures quickly. In production the message is suppressed to prevent
// leaking internal details; a generic string is returned instead.
//
// If the error is a Hono HTTPException it carries a status code that is
// forwarded verbatim (e.g. 403, 404). All other errors map to 500.
// ---------------------------------------------------------------------------
app.onError((err, c) => {
  console.error("[API error]", err.message, err.stack);

  const errorMessage = err.message;
  const isMalformedJson = isMalformedJsonBodyError(err);
  const status = isMalformedJson
    ? 400
    : "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : 500;

  const errorId = shouldCaptureApiException(err, status)
    ? captureApiException(err, {
        source: "hono-on-error",
        path: scrubSentryPath(new URL(c.req.url).pathname),
      })
    : undefined;

  const isDev = isE2eAllowed(c.env) || c.env.ENVIRONMENT === "development";

  const body = isMalformedJson
    ? { error: "Malformed JSON request body", ...(errorId ? { errorId } : {}) }
    : isDev
      ? { error: errorMessage, ...(errorId ? { errorId } : {}) }
      : { error: "Internal server error", ...(errorId ? { errorId } : {}) };

  const response = c.json(body, status as Parameters<typeof c.json>[1]);
  if (errorId) {
    response.headers.set("X-Kaiplan-Error-Id", errorId);
  }
  return response;
});

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowedOrigins = buildCorsOriginsForPath(
        c.env,
        new URL(c.req.url).pathname,
      );
      if (allowedOrigins.includes(origin)) return origin;
      return null;
    },
    credentials: true,
    allowHeaders: ["Content-Type"],
    exposeHeaders: ["X-Kaiplan-Error-Id"],
  }),
);

// CSRF / Origin verification on all state-changing API requests.
// Runs AFTER CORS (so preflight is already handled) but BEFORE any
// route handler that mutates state. Public and webhook endpoints are
// exempted inside the middleware (see src/middleware/csrf.ts).
app.use("/api/*", csrfMiddleware());

app.route("/api/health", healthRoutes);

app.route(
  "/api/feedback",
  (() => {
    const router = new Hono<{ Bindings: Env }>();
    router.all("/", (c) => {
      const db = createDb(resolveDatabaseConnectionString(c.env));
      const emailService = createRuntimeEmailService(db, c.env);
      const auth = createRuntimeAuth(db, c.env, emailService);
      const routes = feedbackRoutes(emailService, auth);
      const url = new URL(c.req.url);
      url.pathname = url.pathname.replace(/^\/api\/feedback/, "") || "/";
      return routes.fetch(new Request(url.toString(), c.req.raw), c.env);
    });
    return router;
  })(),
);

app.get("/api/e2e/captured-password-resets", (c) => {
  if (!isE2eAllowed(c.env)) {
    return c.json({ error: "Not found" }, 404);
  }
  const email = c.req.query("email");
  const all = getCapturedPasswordResets();
  const filtered = email ? all.filter((row) => row.email === email) : all;
  return c.json({ resets: filtered });
});

// ---------------------------------------------------------------------------
// Rate-limited auth endpoints (brute-force / credential-stuffing protection).
//
// Specific POST routes are declared before the catch-all so the rate-limiter
// middleware fires only on the targeted paths. The general catch-all below
// handles all other /api/auth/* requests (GET, OPTIONS, etc.) without
// rate limiting overhead.
// ---------------------------------------------------------------------------

const signInRateLimit = createRateLimitMiddleware({
  limit: 10,
  window: 60,
  keyFn: ipKeyFn,
});

const signUpRateLimit = createRateLimitMiddleware({
  limit: 10,
  window: 60,
  keyFn: ipKeyFn,
});

const forgotPasswordRateLimit = createRateLimitMiddleware({
  limit: 5,
  window: 60,
  keyFn: ipKeyFn,
});

const changePasswordRateLimit = createRateLimitMiddleware({
  limit: 5,
  window: 60,
  keyFn: (c) => {
    // Prefer email key if available in the request body; fall back to IP.
    // Keyed by IP — reading the body here would exhaust the stream before
    // Better Auth processes it. The Better Auth handler itself validates the body.
    return ipKeyFn(c);
  },
});

// M9: Baseline rate limiter for the auth catch-all. Endpoints like
// /api/auth/reset-password (token-based) are otherwise unprotected and
// susceptible to brute-force. 20 req/min per IP is generous enough for
// normal use while blocking enumeration/brute-force at scale.
const authCatchAllRateLimit = createRateLimitMiddleware({
  limit: 20,
  window: 60,
  keyFn: ipKeyFn,
});

// M16: Loose rate limiter for unauthenticated public endpoints to prevent
// bot enumeration and scraping. 60 req/min per IP.
const publicApiRateLimit = createRateLimitMiddleware({
  limit: 60,
  window: 60,
  keyFn: ipKeyFn,
});

app.post("/api/auth/sign-in/email", signInRateLimit, (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  return auth.handler(c.req.raw);
});

app.post("/api/auth/sign-up/email", signUpRateLimit, (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  return auth.handler(c.req.raw);
});

app.post("/api/auth/forget-password", forgotPasswordRateLimit, (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  return auth.handler(c.req.raw);
});

app.post("/api/auth/change-password", changePasswordRateLimit, (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  return auth.handler(c.req.raw);
});

// M9: Apply baseline rate limit to the auth catch-all so endpoints like
// /api/auth/reset-password that were previously unprotected are guarded.
app.all("/api/auth/*", authCatchAllRateLimit, (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  return auth.handler(c.req.raw);
});

app.route(
  "/api/billing",
  (() => {
    const router = new Hono<{ Bindings: Env }>();
    router.all("/*", (c) => {
      const db = createDb(resolveDatabaseConnectionString(c.env));
      const emailService = createRuntimeEmailService(db, c.env);
      const auth = createRuntimeAuth(db, c.env, emailService);
      let ctxWaitUntil: ((p: Promise<unknown>) => void) | undefined;
      try {
        const executionCtx = c.executionCtx;
        ctxWaitUntil = executionCtx.waitUntil.bind(executionCtx);
      } catch {
        // No ExecutionContext in test/local environments — cleanup runs
        // fire-and-forget.
      }
      const routes = billingRoutes(
        db,
        auth,
        createStripeClient(c.env),
        ctxWaitUntil,
      );
      const url = new URL(c.req.url);
      url.pathname = url.pathname.replace(/^\/api\/billing/, "") || "/";
      return routes.fetch(new Request(url.toString(), c.req.raw), c.env);
    });
    return router;
  })(),
);

app.route(
  "/api/email/preferences",
  (() => {
    const router = new Hono<{ Bindings: Env }>();
    router.all("/*", (c) => {
      const db = createDb(resolveDatabaseConnectionString(c.env));
      const marketingDb = createRuntimeMarketingDb(c.env);
      const emailService = createRuntimeEmailService(db, c.env);
      const auth = createRuntimeAuth(db, c.env, emailService);
      const routes = emailPreferencesRoutes(marketingDb, auth);
      const url = new URL(c.req.url);
      url.pathname =
        url.pathname.replace(/^\/api\/email\/preferences/, "") || "/";
      return routes.fetch(new Request(url.toString(), c.req.raw), c.env);
    });
    return router;
  })(),
);

// ---------------------------------------------------------------------------
// Consolidated /api/weddings router (audit finding #28).
//
// All sub-paths under /api/weddings are now mounted on a single router so
// the ordering is explicit and a single catch-all at the end acts as the
// fallback for the base weddingRoutes (list/create/get/patch/delete, plus
// /:weddingId/members and /:weddingId/archive|unarchive).
//
// Ordering rule: most-specific sub-paths FIRST, catch-all for the base
// weddingRoutes LAST. Hono's trie router matches left-to-right, so any
// specific `/:weddingId/<subpath>` must be declared before `/:weddingId/*`.
// ---------------------------------------------------------------------------
const weddingsRouter = new Hono<{ Bindings: Env }>();

weddingsRouter.all("/:weddingId/website/*", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = weddingWebsiteRoutes(db, auth, emailService);
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/weddings/, "");
  return routes.fetch(new Request(url.toString(), c.req.raw), c.env);
});
weddingsRouter.all("/:weddingId/website", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = weddingWebsiteRoutes(db, auth, emailService);
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/weddings/, "");
  return routes.fetch(new Request(url.toString(), c.req.raw), c.env);
});

weddingsRouter.all("/:weddingId/seating", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = seatingRoutes(db, auth);
  return forwardToChildRouter(c, routes);
});

weddingsRouter.all("/:weddingId/guests/*", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = guestRoutes(db, auth);
  return forwardToWeddingRouter(c, routes);
});
weddingsRouter.all("/:weddingId/guests", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = guestRoutes(db, auth);
  return forwardToWeddingRouter(c, routes);
});

weddingsRouter.all("/:weddingId/vendors/*", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = vendorRoutes(db, auth);
  return forwardToWeddingRouter(c, routes);
});
weddingsRouter.all("/:weddingId/vendors", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = vendorRoutes(db, auth);
  return forwardToWeddingRouter(c, routes);
});

weddingsRouter.all("/:weddingId/budget/*", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = budgetRoutes(db, auth);
  return forwardToWeddingRouter(c, routes);
});

weddingsRouter.all("/:weddingId/export/*", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = exportRoutes(db, auth);
  return forwardToWeddingRouter(c, routes);
});

weddingsRouter.all("/:weddingId/checklist/*", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = checklistRoutes(db, auth);
  return forwardToWeddingRouter(c, routes);
});
weddingsRouter.all("/:weddingId/checklist", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = checklistRoutes(db, auth);
  return forwardToWeddingRouter(c, routes);
});

// Base weddingRoutes handles / (list/create), /:weddingId (get/patch/delete),
// /:weddingId/members/*, /:weddingId/archive, /:weddingId/unarchive.
// Declared LAST so specific sub-paths above take precedence.
weddingsRouter.all("/", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = weddingRoutes(db, auth, emailService);
  return forwardToWeddingRouter(c, routes);
});
weddingsRouter.all("/*", (c) => {
  const db = createDb(resolveDatabaseConnectionString(c.env));
  const emailService = createRuntimeEmailService(db, c.env);
  const auth = createRuntimeAuth(db, c.env, emailService);
  const routes = weddingRoutes(db, auth, emailService);
  return forwardToWeddingRouter(c, routes);
});

app.route("/api/weddings", weddingsRouter);

app.route(
  "/api/public",
  (() => {
    const router = new Hono<{ Bindings: Env }>();
    // M16: Apply a loose rate limit to unauthenticated public routes to prevent
    // bot enumeration and scraping. 60 req/min per IP.
    router.all("/websites/*", publicApiRateLimit, (c) => {
      const db = createDb(resolveDatabaseConnectionString(c.env));
      const routes = publicWeddingWebsiteRoutes(
        db,
        createRuntimeEmailService(db, c.env),
      );
      return forwardToPublicRouter(c, routes);
    });
    router.all("/websites/:slug", publicApiRateLimit, (c) => {
      const db = createDb(resolveDatabaseConnectionString(c.env));
      const routes = publicWeddingWebsiteRoutes(
        db,
        createRuntimeEmailService(db, c.env),
      );
      return forwardToPublicRouter(c, routes);
    });
    router.all("/rsvp/*", publicApiRateLimit, (c) => {
      const db = createDb(resolveDatabaseConnectionString(c.env));
      const routes = publicWeddingWebsiteRoutes(
        db,
        createRuntimeEmailService(db, c.env),
      );
      return forwardToPublicRouter(c, routes);
    });
    router.all("/rsvp/:token", publicApiRateLimit, (c) => {
      const db = createDb(resolveDatabaseConnectionString(c.env));
      const routes = publicWeddingWebsiteRoutes(
        db,
        createRuntimeEmailService(db, c.env),
      );
      return forwardToPublicRouter(c, routes);
    });
    router.all("/email/preferences/*", publicApiRateLimit, (c) => {
      const routes = publicEmailPreferencesRoutes(
        createRuntimeMarketingDb(c.env),
      );
      return forwardToPublicEmailPreferencesRouter(c, routes);
    });
    router.all("/email/preferences/:token", publicApiRateLimit, (c) => {
      const routes = publicEmailPreferencesRoutes(
        createRuntimeMarketingDb(c.env),
      );
      return forwardToPublicEmailPreferencesRouter(c, routes);
    });
    return router;
  })(),
);

// Durable Object class must be exported from the worker entry point so
// Cloudflare can instantiate it for the RATE_LIMITER binding.
export { RateLimiter };

const worker: ExportedHandler<Env> = {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    const validation = validateEnv(env as unknown as Record<string, unknown>);
    if (!validation.success) {
      const errorId = env.SENTRY_DSN
        ? captureApiException(new Error(validation.message), {
            source: "env-validation",
          })
        : undefined;

      const isDev =
        env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test";
      const body = isDev
        ? JSON.stringify({
            error: "Server misconfiguration",
            detail: validation.message,
            ...(errorId ? { errorId } : {}),
          })
        : JSON.stringify({
            error: "Server misconfiguration",
            ...(errorId ? { errorId } : {}),
          });
      const headers = new Headers({
        "Content-Type": "application/json",
        ...(errorId ? { "X-Kaiplan-Error-Id": errorId } : {}),
      });
      applySecurityHeaders(headers);

      return new Response(body, {
        status: 500,
        headers,
      });
    }
    return app.fetch(request, env, ctx);
  },

  scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): void {
    const db = createDb(resolveDatabaseConnectionString(env));
    const marketingDb = createRuntimeMarketingDb(env);
    const emailService = createRuntimeEmailService(db, env);
    const stripe = createStripeClient(env);
    // Run maintenance jobs sequentially. They share a single pg Pool
    // (`max: 1`) backed by Hyperdrive, so concurrent execution causes the
    // later jobs to time out waiting for the one connection. Each job is
    // isolated so a single failure does not skip the others.
    const jobs: Array<{ name: string; run: () => Promise<unknown> }> = [
      {
        name: "cleanupOldProcessedEvents",
        run: () => withDbRetry(() => cleanupOldProcessedEvents(db)),
      },
      {
        name: "cleanupOldEmailOperationalData",
        run: () =>
          withDbRetry(() => cleanupOldEmailOperationalData(marketingDb)),
      },
      {
        name: "dispatchTrialEndingReminders",
        run: () =>
          withDbRetry(() =>
            dispatchTrialEndingReminders(db, env, stripe, emailService),
          ),
      },
      {
        name: "dispatchSignupLifecycleEmails",
        run: () =>
          withDbRetry(() =>
            dispatchSignupLifecycleEmails(db, marketingDb, env, emailService),
          ),
      },
      {
        name: "expireElapsedFreeTrials",
        run: () =>
          withDbRetry(() =>
            expireElapsedFreeTrials(db).then((count) => {
              console.log(`Trial expiry: ${count} subscription(s) gated`);
            }),
          ),
      },
    ];
    ctx.waitUntil(
      (async () => {
        for (const job of jobs) {
          try {
            await job.run();
          } catch (error) {
            captureApiException(error, { source: "scheduled" });
          }
        }
      })(),
    );
  },
};

export default withSentry(worker);
