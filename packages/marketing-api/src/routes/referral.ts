import { Hono } from "hono";
import { and, count, eq, lte, sql } from "drizzle-orm";
import { signups, referrals } from "../db/schema";
import type { ApiEnv, DrizzleD1Database } from "../app";
import { captureMarketingApiException } from "../services/sentry";

export function referralRoute() {
  const route = new Hono<{
    Bindings: ApiEnv;
    Variables: { db: DrizzleD1Database };
  }>();

  route.get("/:code", async (c) => {
    const code = c.req.param("code");
    if (code.length > 100) {
      return c.json({ error: "Invalid referral code" }, 404);
    }

    const db = c.get("db");

    try {
      const [referrer] = await db
        .select({
          id: signups.id,
          createdAt: signups.createdAt,
          queuePosition: signups.queuePosition,
        })
        .from(signups)
        .where(eq(signups.referralCode, code));

      if (!referrer) {
        return c.json({ error: "Invalid referral code" }, 404);
      }

      let position =
        referrer.queuePosition && referrer.queuePosition > 0
          ? referrer.queuePosition
          : null;

      if (position === null) {
        const [updatedPosition] = await db
          .update(signups)
          .set({
            queuePosition: sql<number>`(
            select coalesce(max(${signups.queuePosition}), 0)
            from ${signups}
            where ${signups.queuePosition} > 0
          ) + 1`,
          })
          .where(
            and(eq(signups.id, referrer.id), lte(signups.queuePosition, 0)),
          )
          .returning({
            id: signups.id,
            queuePosition: signups.queuePosition,
          });

        position = Number(
          updatedPosition?.id === referrer.id
            ? updatedPosition.queuePosition
            : 0,
        );
        if (position <= 0) {
          const [repairedReferrer] = await db
            .select({ queuePosition: signups.queuePosition })
            .from(signups)
            .where(eq(signups.id, referrer.id));
          position = Number(repairedReferrer?.queuePosition ?? 0);
        }

        if (position <= 0) {
          return c.json({ error: "Referral position is unavailable" }, 503);
        }
      }

      const [referralCountResult] = await db
        .select({ count: count() })
        .from(referrals)
        .where(eq(referrals.referralCode, code));

      return c.json({
        referralCount: referralCountResult?.count ?? 0,

        position,
      });
    } catch (error) {
      console.error("[referral] DB query failed:", error);
      captureMarketingApiException(error, { source: "referral-db-query" });
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  return route;
}
