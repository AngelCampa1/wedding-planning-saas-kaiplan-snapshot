import { PRICING_TIERS, type PricingTier } from "../packages/shared/src/index";
import {
  LOCAL_E2E_STRIPE_PRICE_IDS,
  LOCAL_E2E_TRIAL_DURATION_SECONDS,
} from "./local-e2e-billing-fixtures";

export type LocalBillingPlan = PricingTier;

export type LocalBillingSummary = {
  plan: LocalBillingPlan;
  status: string;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  features: string[];
  canManageBilling: boolean;
};

export const LOCAL_BILLING_PRICE_IDS = Object.fromEntries(
  PRICING_TIERS.map((plan) => [plan, LOCAL_E2E_STRIPE_PRICE_IDS[plan].month]),
) as Record<LocalBillingPlan, string>;

type RecurringBillingPlan = Exclude<LocalBillingPlan, "lifetime">;

type LocalBillingUrls = {
  apiUrl: string;
  appUrl: string;
};

export function buildLocalSubscriptionUpdatedEvent(
  customerId: string,
  plan: RecurringBillingPlan,
  nowMs = Date.now(),
) {
  const nowSeconds = Math.floor(nowMs / 1000);
  const periodEndSeconds = nowSeconds + LOCAL_E2E_TRIAL_DURATION_SECONDS;

  return {
    id: `evt_local_${plan}_subscription_${nowMs}`,
    type: "customer.subscription.updated",
    data: {
      object: {
        customer: customerId,
        status: "trialing",
        trial_start: nowSeconds,
        current_period_start: nowSeconds,
        current_period_end: periodEndSeconds,
        items: {
          data: [
            {
              price: { id: LOCAL_BILLING_PRICE_IDS[plan] },
              current_period_end: periodEndSeconds,
            },
          ],
        },
      },
    },
  };
}

export async function fetchLocalBillingSummary({
  apiUrl,
  appUrl,
  cookie,
}: LocalBillingUrls & { cookie: string }) {
  const res = await fetch(`${apiUrl}/api/billing`, {
    headers: { Cookie: cookie, Origin: appUrl },
  });
  if (!res.ok) throw new Error(`billing summary failed: ${await res.text()}`);
  return res.json() as Promise<LocalBillingSummary>;
}

export async function postLocalBillingWebhook({
  apiUrl,
  event,
}: {
  apiUrl: string;
  event: ReturnType<typeof buildLocalSubscriptionUpdatedEvent>;
}) {
  const webhookRes = await fetch(`${apiUrl}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "local-e2e-signature",
    },
    body: JSON.stringify(event),
  });
  if (!webhookRes.ok)
    throw new Error(`webhook failed: ${await webhookRes.text()}`);
}

export async function completeLocalCheckoutWithCookie({
  apiUrl,
  appUrl,
  cookie,
  plan,
}: LocalBillingUrls & { cookie: string; plan: LocalBillingPlan }) {
  const checkoutRes = await fetch(`${apiUrl}/api/billing/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: appUrl,
    },
    body: JSON.stringify({ plan }),
  });

  if (checkoutRes.status !== 409 && !checkoutRes.ok)
    throw new Error(`checkout failed: ${await checkoutRes.text()}`);

  let summary = await fetchLocalBillingSummary({ apiUrl, appUrl, cookie });

  if (plan !== "lifetime") {
    const customerId = summary.stripeCustomerId;
    if (!customerId) {
      throw new Error("billing summary did not include a Stripe customer ID");
    }

    await postLocalBillingWebhook({
      apiUrl,
      event: buildLocalSubscriptionUpdatedEvent(customerId, plan),
    });
    summary = await fetchLocalBillingSummary({ apiUrl, appUrl, cookie });
  }

  return summary;
}
