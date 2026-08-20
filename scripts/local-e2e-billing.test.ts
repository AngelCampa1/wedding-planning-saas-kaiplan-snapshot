import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLocalSubscriptionUpdatedEvent,
  completeLocalCheckoutWithCookie,
} from "./local-e2e-billing";
import { LOCAL_E2E_STRIPE_PRICE_IDS } from "./local-e2e-billing-fixtures";

const API_URL = "http://127.0.0.1:5030";
const APP_URL = "http://127.0.0.1:3030";
const COOKIE = "kaiplan.session=test";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildLocalSubscriptionUpdatedEvent", () => {
  it("builds a customer-scoped recurring subscription event", () => {
    expect(
      buildLocalSubscriptionUpdatedEvent(
        "cus_e2e_abc",
        "pro",
        1_700_000_000_000,
      ),
    ).toMatchObject({
      id: "evt_local_pro_subscription_1700000000000",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_e2e_abc",
          status: "trialing",
          trial_start: 1_700_000_000,
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          items: {
            data: [
              {
                price: { id: LOCAL_E2E_STRIPE_PRICE_IDS.pro.month },
                current_period_end: 1_702_592_000,
              },
            ],
          },
        },
      },
    });
  });
});

describe("completeLocalCheckoutWithCookie", () => {
  it("checks out, reads the real customer, and replays a subscription webhook", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ url: `${APP_URL}/settings` }))
      .mockResolvedValueOnce(
        jsonResponse({ stripeCustomerId: "cus_e2e_real_customer" }),
      )
      .mockResolvedValueOnce(jsonResponse({ received: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          plan: "pro",
          status: "trialing",
          stripeCustomerId: "cus_e2e_real_customer",
          currentPeriodEnd: "2026-06-19T00:00:00.000Z",
          features: [],
          canManageBilling: true,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const summary = await completeLocalCheckoutWithCookie({
      apiUrl: API_URL,
      appUrl: APP_URL,
      cookie: COOKIE,
      plan: "pro",
    });

    expect(summary.status).toBe("trialing");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_URL}/api/billing/checkout`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan: "pro" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_URL}/api/billing`,
      expect.objectContaining({
        headers: { Cookie: COOKIE, Origin: APP_URL },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${API_URL}/api/billing/webhook`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "stripe-signature": "local-e2e-signature",
        }),
        body: expect.stringContaining("cus_e2e_real_customer"),
      }),
    );
  });

  it("does not replay a subscription webhook for lifetime checkout", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ url: `${APP_URL}/settings` }))
      .mockResolvedValueOnce(
        jsonResponse({
          plan: "lifetime",
          status: "active",
          stripeCustomerId: "cus_e2e_lifetime",
          currentPeriodEnd: null,
          features: [],
          canManageBilling: true,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await completeLocalCheckoutWithCookie({
      apiUrl: API_URL,
      appUrl: APP_URL,
      cookie: COOKIE,
      plan: "lifetime",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
