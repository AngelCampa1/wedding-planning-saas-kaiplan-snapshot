import { Hono } from "hono";
import { pricingClicks } from "../db/schema";
import type { DrizzleD1Database } from "../app";
import { captureMarketingApiException } from "../services/sentry";

export function pricingClickRoute() {
  const route = new Hono<{ Variables: { db: DrizzleD1Database } }>();

  route.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.tier || !body.sourcePage || !body.sessionId) {
      return c.json({ error: "tier, sourcePage, and sessionId required" }, 400);
    }
    if (typeof body.tier !== "string") {
      return c.json({ error: "tier must be a string" }, 400);
    }
    if (typeof body.sourcePage !== "string") {
      return c.json({ error: "sourcePage must be a string" }, 400);
    }
    if (typeof body.sessionId !== "string") {
      return c.json({ error: "sessionId must be a string" }, 400);
    }
    if (body.sourcePage.trim() === "") {
      return c.json({ error: "sourcePage must not be blank" }, 400);
    }
    if (body.sourcePage.length > 500) {
      return c.json({ error: "sourcePage too long" }, 400);
    }
    if (body.sessionId.trim() === "") {
      return c.json({ error: "sessionId must not be blank" }, 400);
    }
    if (body.sessionId.length > 200) {
      return c.json({ error: "sessionId too long" }, 400);
    }

    // billingPeriod is optional — if present, must be "monthly" or "annual"
    if (
      body.billingPeriod !== undefined &&
      body.billingPeriod !== "monthly" &&
      body.billingPeriod !== "annual"
    ) {
      return c.json(
        { error: 'billingPeriod must be "monthly" or "annual"' },
        400,
      );
    }

    if (body.tier.length > 100) {
      return c.json({ error: "tier too long" }, 400);
    }

    // Validate tier: only allow alphanumeric characters, hyphens, and underscores
    if (!/^[a-z0-9_-]+$/i.test(body.tier)) {
      return c.json({ error: "tier contains invalid characters" }, 400);
    }
    const tier = body.tier;

    const db = c.get("db");
    try {
      await db.insert(pricingClicks).values({
        tier,
        sourcePage: body.sourcePage.trim(),
        sessionId: body.sessionId.trim(),
        billingPeriod: body.billingPeriod ?? null,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[pricing-click] DB insert failed:", err);
      captureMarketingApiException(err, { source: "pricing-click-db-insert" });
      return c.json({ error: "Internal server error" }, 500);
    }

    return c.json({ success: true });
  });

  return route;
}
