import { expect, type APIRequestContext } from "@playwright/test";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";
import {
  buildLocalSubscriptionUpdatedEvent,
  type LocalBillingPlan as BillingPlan,
  type LocalBillingSummary as BillingSummary,
} from "../../scripts/local-e2e-billing";

const runtime = readLocalE2ERuntime();

async function postLocalBillingWebhook(
  request: APIRequestContext,
  event: ReturnType<typeof buildLocalSubscriptionUpdatedEvent>,
) {
  const webhookResponse = await request.post(
    `${runtime.urls.api}/api/billing/webhook`,
    {
      headers: {
        "stripe-signature": "local-e2e-signature",
      },
      data: event,
    },
  );

  expect(
    webhookResponse.ok(),
    `billing webhook ${event.type} failed ${webhookResponse.status()}: ${await webhookResponse.text()}`,
  ).toBeTruthy();
}

async function fetchBillingSummary(request: APIRequestContext) {
  const billingResponse = await request.get(`${runtime.urls.api}/api/billing`);
  expect(
    billingResponse.ok(),
    `billing summary failed ${billingResponse.status()}: ${await billingResponse.text()}`,
  ).toBeTruthy();

  return billingResponse.json() as Promise<BillingSummary>;
}

export async function completeLocalCheckoutForEmail(
  request: APIRequestContext,
  _email: string,
  plan: BillingPlan,
) {
  const checkoutResponse = await request.post(
    `${runtime.urls.api}/api/billing/checkout`,
    {
      headers: { Origin: runtime.urls.app },
      data: { plan },
    },
  );

  if (checkoutResponse.status() !== 409) {
    // First subscription: verify normal checkout flow.
    expect(
      checkoutResponse.ok(),
      `checkout failed ${checkoutResponse.status()}: ${await checkoutResponse.text()}`,
    ).toBeTruthy();

    const checkout = (await checkoutResponse.json()) as {
      url?: string | null;
    };
    expect(checkout.url).toContain("checkout=success");
    expect(checkout.url).toContain(`plan=${plan}`);
  }
  // 409 means already subscribed; the double-checkout guard is working.
  // Local E2E checkout writes the customer and initial subscription directly.
  // Replay customer-scoped subscription webhooks so browser coverage exercises
  // the production webhook path without hosted Stripe checkout.
  let summary = await fetchBillingSummary(request);

  if (plan !== "lifetime") {
    const customerId = summary.stripeCustomerId;
    if (!customerId) {
      throw new Error("Could not find Stripe customer after checkout.");
    }

    await postLocalBillingWebhook(
      request,
      buildLocalSubscriptionUpdatedEvent(customerId, plan),
    );
    summary = await fetchBillingSummary(request);
  }

  return summary;
}
