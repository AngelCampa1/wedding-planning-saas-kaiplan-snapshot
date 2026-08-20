import { describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import {
  createStripeClient,
  createE2eStripeClient,
} from "../../src/lib/stripe";

describe("createStripeClient", () => {
  it("creates a Stripe client from env", () => {
    const client = createStripeClient({ STRIPE_SECRET_KEY: "sk_test_123" });

    expect(client).toBeInstanceOf(Stripe);
  });

  it("returns a deterministic local stub in e2e mode", async () => {
    const client = createStripeClient({
      E2E_MODE: "true",
      STRIPE_SECRET_KEY: "sk_test_123",
      ENVIRONMENT: "development",
    });
    const successUrl =
      "http://127.0.0.1:3001/settings?checkout=success&plan=starter";
    const returnUrl = "http://127.0.0.1:3001/settings";

    expect(client).not.toBeInstanceOf(Stripe);
    await expect(
      client.checkout.sessions.create({
        customer: "cus_e2e",
        mode: "subscription",
        line_items: [{ price: "price_starter", quantity: 1 }],
        success_url: successUrl,
        cancel_url: "http://127.0.0.1:3001/settings",
        metadata: { userId: "user_1", plan: "starter" },
      }),
    ).resolves.toMatchObject({
      id: "cs_e2e",
      url: successUrl,
    });
    await expect(
      client.customers.create({
        email: "user@example.com",
        name: "Test User",
        metadata: { userId: "user_1" },
      }),
    ).resolves.toEqual({
      id: "cus_e2e_757365725f31",
    });
    await expect(
      client.customers.createWithIdempotency?.(
        {
          email: "user@example.com",
          name: "Test User",
          metadata: { userId: "user_2" },
        },
        "customer:user_2:new",
      ),
    ).resolves.toEqual({
      id: "cus_e2e_757365725f32",
    });
    await expect(client.customers.retrieve("cus_custom")).resolves.toEqual({
      id: "cus_custom",
      metadata: {},
    });
    await expect(
      client.customers.retrieve("cus_e2e_757365725f31"),
    ).resolves.toEqual({
      id: "cus_e2e_757365725f31",
      metadata: { userId: "user_1" },
    });
    await expect(
      client.billingPortal.sessions.create({
        customer: "cus_e2e",
        return_url: returnUrl,
      }),
    ).resolves.toEqual({
      url: returnUrl,
    });
    await expect(client.invoices.list()).resolves.toEqual({ data: [] });
    await expect(
      client.invoices.retrieveUpcoming?.({ customer: "cus_e2e" }),
    ).resolves.toEqual({
      amount_due: 2000,
      currency: "usd",
    });
    await expect(client.paymentIntents.list()).resolves.toEqual({ data: [] });
    await expect(
      client.checkout.sessions.createWithIdempotency?.(
        {
          customer: "cus_e2e",
          mode: "subscription",
          line_items: [{ price: "price_starter", quantity: 1 }],
          success_url: successUrl,
          cancel_url: "http://127.0.0.1:3001/settings",
          metadata: { userId: "user_1", plan: "starter" },
        },
        "checkout:user_1:starter:month",
      ),
    ).resolves.toMatchObject({
      id: "cs_e2e",
      url: successUrl,
    });
    await expect(
      client.checkout.sessions.retrieve?.("cs_e2e"),
    ).resolves.toEqual({
      id: "cs_e2e",
      url: successUrl,
      status: "open",
    });
    await expect(
      client.checkout.sessions.retrieve?.("cs_missing"),
    ).resolves.toEqual({
      id: "cs_missing",
      url: null,
      status: "open",
    });
    await expect(client.checkout.sessions.expire?.("cs_e2e")).resolves.toEqual({
      id: "cs_e2e",
      url: successUrl,
      status: "expired",
    });
    await expect(
      client.webhooks.constructEventAsync(
        JSON.stringify({
          id: "evt_e2e",
          type: "checkout.session.completed",
          data: {
            object: {
              customer: "cus_e2e",
              metadata: { userId: "user_1", plan: "starter" },
            },
          },
        }),
        "sig",
        "whsec_local",
      ),
    ).resolves.toMatchObject({
      id: "evt_e2e",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_e2e",
          metadata: { userId: "user_1", plan: "starter" },
        },
      },
    });

    await expect(
      client.webhooks.constructEventAsync("{", "sig", "whsec_local"),
    ).resolves.toEqual({
      id: "evt_e2e",
      type: "checkout.session.completed",
      data: { object: {} },
    });
  });

  it("wires constructEventAsync with the SubtleCrypto provider on the real client", async () => {
    const client = createStripeClient({ STRIPE_SECRET_KEY: "sk_test_123" });

    // Invalid signature/secret — we only care that the wrapped async function
    // is invoked (covering the SubtleCrypto-provider wiring). It must reject
    // rather than throw synchronously, proving the async path is in use.
    await expect(
      client.webhooks.constructEventAsync(
        JSON.stringify({ id: "evt_1", type: "ping", data: { object: {} } }),
        "t=0,v1=deadbeef",
        "whsec_test",
      ),
    ).rejects.toThrow();
  });

  it("pins the Stripe API to version 2025-04-30.basil", () => {
    const client = createStripeClient({
      STRIPE_SECRET_KEY: "sk_test_123",
    }) as unknown as Stripe;

    expect(client.getApiField("version")).toBe("2025-04-30.basil");
  });

  it("adds helper methods for idempotent customers, checkout sessions, and upcoming invoice previews", async () => {
    const client = createStripeClient({
      STRIPE_SECRET_KEY: "sk_test_123",
    });
    const customerCreateSpy = vi.fn().mockResolvedValue({ id: "cus_live" });
    const createSpy = vi
      .fn()
      .mockResolvedValue({ id: "cs_live", url: "https://stripe.test/cs_live" });
    const previewSpy = vi
      .fn()
      .mockResolvedValue({ amount_due: 28000, currency: "usd" });

    client.customers.create = customerCreateSpy;
    client.checkout.sessions.create = createSpy;
    (
      client.invoices as unknown as { createPreview: typeof previewSpy }
    ).createPreview = previewSpy;

    await expect(
      client.customers.createWithIdempotency?.(
        {
          email: "user@example.com",
          name: "Live User",
          metadata: { userId: "user_1" },
        },
        "customer:user_1:new",
      ),
    ).resolves.toEqual({ id: "cus_live" });
    expect(customerCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
      }),
      { idempotencyKey: "customer:user_1:new" },
    );

    await expect(
      client.checkout.sessions.createWithIdempotency?.(
        {
          customer: "cus_live",
          mode: "subscription",
          line_items: [{ price: "price_pro", quantity: 1 }],
          success_url: "https://example.com/success",
          cancel_url: "https://example.com/cancel",
          metadata: { userId: "user_1", plan: "pro" },
        },
        "checkout:user_1:pro:month",
      ),
    ).resolves.toMatchObject({ id: "cs_live" });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_live",
      }),
      { idempotencyKey: "checkout:user_1:pro:month" },
    );

    await expect(
      client.invoices.retrieveUpcoming?.({ customer: "cus_live" }),
    ).resolves.toEqual({
      amount_due: 28000,
      currency: "usd",
    });
    expect(previewSpy).toHaveBeenCalledWith({ customer: "cus_live" });
  });

  it("does not return e2e client when ENVIRONMENT is production even with E2E_MODE true", () => {
    const client = createStripeClient({
      E2E_MODE: "true",
      STRIPE_SECRET_KEY: "sk_test_123",
      ENVIRONMENT: "production",
    });

    expect(client).toBeInstanceOf(Stripe);
  });

  it("does not return e2e client when ENVIRONMENT is undefined (fail-closed)", () => {
    // When ENVIRONMENT is not set, the gate must fail-closed and return the real
    // Stripe client — an unset env var must never silently enable the bypass.
    const client = createStripeClient({
      E2E_MODE: "true",
      STRIPE_SECRET_KEY: "sk_test_123",
      ENVIRONMENT: undefined,
    });

    expect(client).toBeInstanceOf(Stripe);
  });

  it("returns e2e stub when ENVIRONMENT is development", () => {
    const client = createStripeClient({
      E2E_MODE: "true",
      STRIPE_SECRET_KEY: "sk_test_123",
      ENVIRONMENT: "development",
    });

    expect(client).not.toBeInstanceOf(Stripe);
  });

  it("returns e2e stub when ENVIRONMENT is test", () => {
    const client = createStripeClient({
      E2E_MODE: "true",
      STRIPE_SECRET_KEY: "sk_test_123",
      ENVIRONMENT: "test",
    });

    expect(client).not.toBeInstanceOf(Stripe);
  });

  it("createE2eStripeClient is exported for use in tests", async () => {
    const client = createE2eStripeClient();
    const session = await client.checkout.sessions.create({
      customer: "cus_test",
      mode: "subscription",
      line_items: [{ price: "price_starter", quantity: 1 }],
      success_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",
      metadata: { userId: "u1", plan: "starter" },
    });
    expect(session).toMatchObject({ id: "cs_e2e" });
    await expect(
      client.checkout.sessions.retrieve?.("cs_e2e"),
    ).resolves.toEqual({
      id: "cs_e2e",
      url: "https://example.com/success",
      status: "open",
    });
    await expect(
      client.checkout.sessions.retrieve?.("cs_unknown"),
    ).resolves.toEqual({
      id: "cs_unknown",
      url: null,
      status: "open",
    });
    await expect(
      client.checkout.sessions.expire?.("cs_unknown"),
    ).resolves.toEqual({
      id: "cs_unknown",
      url: null,
      status: "expired",
    });
  });

  it("creates separate e2e customers per user so customer webhooks stay scoped", async () => {
    const client = createE2eStripeClient();

    await expect(
      client.customers.create({
        email: "one@example.com",
        name: "User One",
        metadata: { userId: "user-1" },
      }),
    ).resolves.toEqual({ id: "cus_e2e_757365722d31" });
    await expect(
      client.customers.create({
        email: "two@example.com",
        name: "User Two",
        metadata: { userId: "user_1" },
      }),
    ).resolves.toEqual({ id: "cus_e2e_757365725f31" });

    await expect(
      client.customers.retrieve("cus_e2e_757365722d31"),
    ).resolves.toEqual({
      id: "cus_e2e_757365722d31",
      metadata: { userId: "user-1" },
    });
    await expect(
      client.customers.retrieve("cus_e2e_757365725f31"),
    ).resolves.toEqual({
      id: "cus_e2e_757365725f31",
      metadata: { userId: "user_1" },
    });
  });
});
