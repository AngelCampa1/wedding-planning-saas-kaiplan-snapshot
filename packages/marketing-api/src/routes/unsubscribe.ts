import { Hono } from "hono";
import type { Context } from "hono";
import { eq, sql } from "drizzle-orm";
import { signups } from "../db/schema";
import type { ApiEnv, DrizzleD1Database } from "../app";
import { captureMarketingApiException } from "../services/sentry";
import { unsubscribeSequencerContact } from "../services/sequencer";

const TOKEN_REGEX = /^[0-9a-f]{64}$/;

type UnsubscribeContext = Context<{
  Bindings: ApiEnv;
  Variables: { db: DrizzleD1Database };
}>;

export function unsubscribeRoute() {
  const route = new Hono<{
    Bindings: ApiEnv;
    Variables: { db: DrizzleD1Database };
  }>();

  async function loadSignupEmail(c: UnsubscribeContext) {
    const token = c.req.query("token") ?? "";
    if (!TOKEN_REGEX.test(token)) {
      return { response: c.text("Invalid unsubscribe link.", 400) };
    }

    const db = c.get("db");
    let signup: { email: string } | undefined;
    try {
      [signup] = await db
        .select({ email: signups.email })
        .from(signups)
        .where(eq(signups.surveyToken, token))
        .limit(1);
    } catch (error) {
      console.error("[unsubscribe] signup lookup failed", error);
      captureMarketingApiException(error, {
        source: "unsubscribe-signup-lookup",
      });
      return { response: c.text("Internal server error", 500) };
    }

    if (!signup) {
      return { response: c.text("Unsubscribe link not found.", 404) };
    }

    return { token, email: signup.email };
  }

  route.get("/", async (c) => {
    const result = await loadSignupEmail(c);
    if ("response" in result) {
      return result.response;
    }

    return c.html(
      `<form method="post" action="/api/unsubscribe?token=${result.token}"><button type="submit">Unsubscribe</button></form>`,
    );
  });

  route.post("/", async (c) => {
    const result = await loadSignupEmail(c);
    if ("response" in result) {
      return result.response;
    }

    const db = c.get("db");
    const normalizedEmail = result.email.trim().toLowerCase();
    try {
      await db
        .update(signups)
        .set({ unsubscribedAt: new Date().toISOString() })
        .where(sql`lower(${signups.email}) = ${normalizedEmail}`);
    } catch (error) {
      console.error("[unsubscribe] local suppression failed", error);
      captureMarketingApiException(error, {
        source: "unsubscribe-local-suppression",
      });
      return c.text("Internal server error", 500);
    }

    try {
      const unsubscribed = await unsubscribeSequencerContact(
        c.env,
        normalizedEmail,
        {
          source: "kaiplan-unsubscribe-link",
        },
      );
      if (!unsubscribed) {
        const error = new Error("Sequencer unsubscribe is not configured.");
        console.error("[unsubscribe] Sequencer unsubscribe skipped", error);
        captureMarketingApiException(error, {
          source: "sequencer-unsubscribe-unconfigured",
        });
      }
    } catch (error) {
      console.error("[unsubscribe] Sequencer unsubscribe failed", error);
      captureMarketingApiException(error, {
        source: "sequencer-unsubscribe",
      });
      return c.text(
        "You have been unsubscribed locally, but upstream suppression could not be confirmed. Please retry.",
        502,
      );
    }

    return c.text("You have been unsubscribed.");
  });

  return route;
}
