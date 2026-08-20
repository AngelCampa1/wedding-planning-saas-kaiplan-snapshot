import { createMiddleware } from "hono/factory";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { WEDDING_ROLES, type WeddingRole } from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import { subscription, wedding, weddingMember } from "../db/schema";
import { getEffectiveBillingPlan, isBillingGateRequired } from "../lib/billing";

type WeddingAccessVariables = {
  user: { id: string; email: string; name: string };
  weddingRole: WeddingRole;
  weddingStatus?: "planning" | "archived";
};

function isWeddingRole(role: string): role is WeddingRole {
  return WEDDING_ROLES.includes(role as WeddingRole);
}

const weddingIdParamSchema = z.string().uuid();

export function weddingAccessMiddleware(db: Database) {
  return createMiddleware<{
    Bindings: Env;
    Variables: WeddingAccessVariables;
  }>(async (c, next) => {
    const weddingId = c.req.param("weddingId");
    const user = c.get("user");

    if (!weddingId) {
      return c.json({ error: "Wedding ID required" }, 400);
    }

    if (!weddingIdParamSchema.safeParse(weddingId).success) {
      return c.json({ error: "Invalid wedding ID" }, 400);
    }

    const row = await db
      .select({
        memberId: weddingMember.id,
        weddingId: weddingMember.weddingId,
        userId: weddingMember.userId,
        role: weddingMember.role,
        weddingStatus: wedding.status,
        billingGateRequiredAt: subscription.billingGateRequiredAt,
        trialStartedAt: subscription.trialStartedAt,
        plan: subscription.plan,
        status: subscription.status,
      })
      .from(weddingMember)
      .innerJoin(wedding, eq(weddingMember.weddingId, wedding.id))
      .leftJoin(subscription, eq(subscription.userId, wedding.createdBy))
      .where(
        and(
          eq(weddingMember.weddingId, weddingId),
          eq(weddingMember.userId, user.id),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) {
      return c.json({ error: "Not a member of this wedding" }, 403);
    }

    const billingState = {
      billingGateRequiredAt: row.billingGateRequiredAt,
      plan: row.plan ?? "free",
      status: row.status ?? "inactive",
      trialStartedAt: row.trialStartedAt,
    };
    const isArchivedReadRequest =
      row.weddingStatus === "archived" && c.req.method === "GET";

    if (isBillingGateRequired(billingState) && !isArchivedReadRequest) {
      return c.json(
        {
          error: "Complete billing setup to continue.",
          plan: billingState.plan,
          status: billingState.status,
          effectivePlan: getEffectiveBillingPlan(billingState),
          billingGateRequired: true,
        },
        402,
      );
    }

    if (!isWeddingRole(row.role)) {
      console.error("[wedding-access] invalid wedding member role", {
        memberId: row.memberId,
        weddingId: row.weddingId,
        role: row.role,
      });
      return c.json({ error: "Invalid wedding membership role" }, 403);
    }

    c.set("weddingRole", row.role);
    c.set("weddingStatus", row.weddingStatus);

    const isUnarchiveRequest =
      c.req.method === "POST" && c.req.path.endsWith("/unarchive");
    if (
      row.weddingStatus === "archived" &&
      c.req.method !== "GET" &&
      !isUnarchiveRequest
    ) {
      return c.json({ error: "Wedding is archived and read-only" }, 423);
    }

    await next();
  });
}
