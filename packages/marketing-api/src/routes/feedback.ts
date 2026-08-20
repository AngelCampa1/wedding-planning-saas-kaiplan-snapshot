import { Hono } from "hono";
import { z } from "zod";
import { feedback } from "../db/schema";
import { sendFeedbackNotification } from "../services/email";
import type { ApiEnv, DrizzleD1Database } from "../app";
import { captureMarketingApiException } from "../services/sentry";
import {
  guardPublicForm,
  isHoneypotTripped,
} from "../lib/public-form-protection";
import { consumeIdentifierToken } from "../middleware/rate-limit";
import { isMarketingE2EAllowed } from "../lib/e2e-gate";
import { scheduleBackgroundTask } from "../lib/background-task";
import { isJsonObject } from "../lib/json-body";

const feedbackBodySchema = z.object({
  category: z.enum(["bug", "idea", "other"]),
  message: z.string().trim().min(1).max(2000),
  email: z
    .preprocess(
      (value) => {
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      },
      z.string().email().optional(),
    )
    .optional(),
  pageUrl: z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().url().min(1).max(2000),
    ),
});

export function feedbackRoute() {
  const route = new Hono<{
    Bindings: ApiEnv;
    Variables: { db: DrizzleD1Database };
  }>();

  route.post("/", async (c) => {
    const rawBody = await c.req.json().catch(() => null);
    if (!isJsonObject(rawBody)) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    if (isHoneypotTripped(rawBody)) {
      return c.json({ ok: true }, 201);
    }

    const parsed = feedbackBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const guard = await guardPublicForm(rawBody, c.env);
    if (guard.outcome === "reject") {
      return c.json({ error: "Verification failed." }, 403);
    }

    const body = parsed.data;

    // Always throttle: when the email is omitted (which is allowed), fall back
    // to the client IP so a bot can't bypass the limit by leaving email blank.
    const throttleIdentity =
      body.email ?? c.req.header("CF-Connecting-IP") ?? "feedback-anon";
    if (!consumeIdentifierToken("feedback-email", throttleIdentity)) {
      return c.json({ error: "Too many requests" }, 429);
    }
    const db = c.get("db");
    const userAgent = c.req.header("User-Agent") ?? null;
    const timestamp = new Date().toISOString();

    try {
      await db.insert(feedback).values({
        category: body.category,
        message: body.message,
        email: body.email ?? null,
        pageUrl: body.pageUrl,
        userAgent,
        createdAt: timestamp,
      });
    } catch (err) {
      console.error("[feedback] DB insert failed:", err);
      captureMarketingApiException(err, { source: "feedback-db-insert" });
      return c.json({ error: "Internal server error" }, 500);
    }

    const env = c.env;

    const emailPromise = sendFeedbackNotification({
      productName: env.PRODUCT_NAME,
      category: body.category,
      message: body.message,
      pageUrl: body.pageUrl,
      email: body.email,
      userAgent: userAgent ?? undefined,
      timestamp,
      emailFrom: env.EMAIL_FROM,
      resendApiKey: env.RESEND_API_KEY,
      e2eMode: isMarketingE2EAllowed(env),
      localOutbox: env.LOCAL_OUTBOX,
    }).catch((err) => {
      console.error("[feedback] email notification failed:", err);
      captureMarketingApiException(err, {
        source: "feedback-email-notification",
      });
    });

    scheduleBackgroundTask(c, emailPromise);

    return c.json({ ok: true }, 201);
  });

  return route;
}
