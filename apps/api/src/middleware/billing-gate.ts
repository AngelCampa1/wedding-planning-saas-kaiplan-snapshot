import { createMiddleware } from "hono/factory";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import {
  getEffectiveBillingPlan,
  isBillingGateRequired,
  loadSubscription,
} from "../lib/billing";

type BillingGateVariables = {
  user: { id: string; email: string; name: string };
};

export async function requireBillingAccess(
  db: Database,
  c: {
    get: <T extends keyof BillingGateVariables>(
      key: T,
    ) => BillingGateVariables[T];
    json: (body: unknown, status?: number) => Response;
  },
) {
  const current = await loadSubscription(db, c.get("user").id);

  if (!isBillingGateRequired(current)) {
    return null;
  }

  return c.json(
    {
      error: "Complete billing setup to continue.",
      plan: current?.plan ?? "free",
      status: current?.status ?? "inactive",
      effectivePlan: getEffectiveBillingPlan(current),
      billingGateRequired: true,
    },
    402,
  );
}

export function billingGateMiddleware(db: Database) {
  return createMiddleware<{
    Bindings: Env;
    Variables: BillingGateVariables;
  }>(async (c, next) => {
    const response = await requireBillingAccess(db, c);
    if (response) {
      return response;
    }

    await next();
  });
}
