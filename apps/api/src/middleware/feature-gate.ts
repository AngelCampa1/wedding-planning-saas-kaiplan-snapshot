import { createMiddleware } from "hono/factory";
import type { BillingFeature } from "@kaiplan/shared";
import {
  getEffectiveBillingPlan,
  getWeddingOwnerSubscription,
  loadSubscription,
  recordFeatureFirstUse,
  subscriptionHasFeatureAccess,
} from "../lib/billing";
import type { Database } from "../db/client";
import type { Env } from "../lib/env";

type FeatureGateVariables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
  weddingStatus?: "planning" | "archived";
};

type OptionalExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

type FeatureGateOptions = {
  recordUse?: boolean;
};

type FeatureUseDb = Pick<Database, "select" | "update">;

function getExecutionContext(c: unknown): OptionalExecutionContext | undefined {
  try {
    const executionCtx = (c as { executionCtx?: OptionalExecutionContext })
      .executionCtx;
    return executionCtx;
  } catch {
    return undefined;
  }
}

async function resolveWeddingPlan(
  db: Pick<Database, "select">,
  weddingId: string,
  userId: string,
  weddingRole: FeatureGateVariables["weddingRole"],
) {
  if (weddingRole === "owner") {
    return loadSubscription(db, userId);
  }

  return getWeddingOwnerSubscription(db, weddingId);
}

export async function requireWeddingFeature(
  db: Database,
  c: {
    req: { method?: string; param: (name: string) => string | undefined };
    get: <T extends keyof FeatureGateVariables>(
      key: T,
    ) => FeatureGateVariables[T];
    json: (body: unknown, status?: number) => Response;
  },
  feature: BillingFeature,
  options: FeatureGateOptions = {},
) {
  const weddingId = c.req.param("weddingId");
  if (!weddingId) {
    return c.json({ error: "Wedding ID required." }, 400);
  }
  if (c.req.method === "GET" && c.get("weddingStatus") === "archived") {
    return null;
  }

  const subscription = await resolveWeddingPlan(
    db,
    weddingId,
    c.get("user").id,
    c.get("weddingRole"),
  );

  if (!subscriptionHasFeatureAccess(subscription, feature)) {
    return c.json(
      {
        error: "This feature requires a paid plan.",
        feature,
        plan: subscription?.plan ?? "free",
        status: subscription?.status ?? "inactive",
        effectivePlan: getEffectiveBillingPlan(subscription),
      },
      402,
    );
  }

  // Record first-use on the billing owner's subscription. For editors, the
  // subscription row comes from the wedding owner (getWeddingOwnerSubscription),
  // so this stamps the owner — intentional, since the owner is the billing entity
  // and the downgrade-warning UI shows whether this wedding has ever used the feature.
  if (options.recordUse !== false) {
    await recordSubscriptionFeatureUse(db, c, subscription, feature);
  }

  return null;
}

export async function recordWeddingFeatureUse(
  db: FeatureUseDb,
  c: {
    req: { method?: string; param: (name: string) => string | undefined };
    get: <T extends keyof FeatureGateVariables>(
      key: T,
    ) => FeatureGateVariables[T];
  },
  feature: BillingFeature,
) {
  if (c.req.method === "GET" && c.get("weddingStatus") === "archived") {
    return;
  }

  const weddingId = c.req.param("weddingId");
  if (!weddingId) {
    return;
  }

  const subscription = await resolveWeddingPlan(
    db,
    weddingId,
    c.get("user").id,
    c.get("weddingRole"),
  );
  await recordSubscriptionFeatureUse(db, c, subscription, feature);
}

async function recordSubscriptionFeatureUse(
  db: Pick<Database, "update">,
  c: unknown,
  subscription: Awaited<ReturnType<typeof resolveWeddingPlan>>,
  feature: BillingFeature,
) {
  if (!subscription?.userId) {
    return;
  }

  const firstUsePromise = recordFeatureFirstUse(
    db,
    subscription.userId,
    feature,
  ).catch((error) => {
    console.warn("[feature-gate] failed to record first use", {
      feature,
      userId: subscription.userId,
      error,
    });
  });
  const executionCtx = getExecutionContext(c);
  if (executionCtx) {
    executionCtx.waitUntil(firstUsePromise);
  } else {
    await firstUsePromise;
  }
}

export function weddingFeatureMiddleware(
  db: Database,
  feature: BillingFeature,
) {
  return createMiddleware<{
    Bindings: Env;
    Variables: FeatureGateVariables;
  }>(async (c, next) => {
    const response = await requireWeddingFeature(db, c, feature);
    if (response) {
      return response;
    }

    await next();
  });
}
