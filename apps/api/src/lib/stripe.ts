import Stripe from "stripe";
import type { Env } from "./env";
import { isE2eAllowed } from "./e2e-gate";

// Pin Stripe API version explicitly so upgrades are intentional and auditable.
// See: https://docs.stripe.com/api/versioning
const STRIPE_API_VERSION = "2025-04-30.basil" as const;

type StripeClientEnv = Pick<
  Env,
  "E2E_MODE" | "STRIPE_SECRET_KEY" | "ENVIRONMENT"
>;

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

type StripeCheckoutSessionCreateInput = {
  customer: string;
  mode: "subscription" | "payment";
  line_items: { price: string; quantity: number }[];
  success_url: string;
  cancel_url: string;
  metadata: { userId: string; plan: string; interval?: string };
  payment_method_collection?: "always";
};

// Minimal Stripe interface used by the billing routes. Keeping it explicit
// here lets the billing module import a concrete type without depending on
// the full stripe SDK types or using unsafe casts.
export type StripeLike = {
  customers: {
    create: (input: {
      email: string;
      name: string;
      metadata: { userId: string };
    }) => Promise<{ id: string }>;
    createWithIdempotency?: (
      input: {
        email: string;
        name: string;
        metadata: { userId: string };
      },
      idempotencyKey: string,
    ) => Promise<{ id: string }>;
    retrieve: (customerId: string) => Promise<{
      id: string;
      deleted?: boolean;
      metadata: Record<string, string | undefined>;
    }>;
  };
  billingPortal: {
    sessions: {
      create: (input: {
        customer: string;
        return_url: string;
      }) => Promise<{ url: string | null }>;
    };
  };
  checkout: {
    sessions: {
      create: (
        input: StripeCheckoutSessionCreateInput,
      ) => Promise<{ id: string; url: string | null }>;
      retrieve?: (
        sessionId: string,
      ) => Promise<{ id: string; url: string | null; status: string | null }>;
      expire?: (
        sessionId: string,
      ) => Promise<{ id: string; url: string | null; status: string | null }>;
      createWithIdempotency?: (
        input: StripeCheckoutSessionCreateInput,
        idempotencyKey: string,
      ) => Promise<{ id: string; url: string | null }>;
    };
  };
  invoices: {
    retrieveUpcoming?: (input: { customer: string }) => Promise<{
      amount_due: number;
      currency: string;
    }>;
    list: (input: { customer: string; limit: number }) => Promise<{
      data: Array<{
        id: string;
        status: string | null;
        hosted_invoice_url: string | null;
        amount_paid: number;
        currency: string;
        created: number;
        payment_intent?: string | null;
      }>;
    }>;
  };
  paymentIntents: {
    list: (input: { customer: string; limit: number }) => Promise<{
      data: Array<{
        id: string;
        status: string;
        amount: number;
        currency: string;
        created: number;
      }>;
    }>;
  };
  webhooks: {
    constructEventAsync: (
      payload: string,
      signature: string,
      secret: string,
    ) => Promise<StripeEvent>;
  };
};

function buildE2eStripeCustomerId(userId: string) {
  const encodedUserId = Array.from(new TextEncoder().encode(userId))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `cus_e2e_${encodedUserId}`;
}

export function createE2eStripeClient() {
  const customers = new Map<
    string,
    { id: string; metadata: Record<string, string | undefined> }
  >();
  const checkoutSessions = new Map<
    string,
    { id: string; url: string | null; status: string | null }
  >();

  return {
    customers: {
      create: async (input: { metadata: { userId: string } }) => {
        const customer = {
          id: buildE2eStripeCustomerId(input.metadata.userId),
          metadata: { userId: input.metadata.userId },
        };
        customers.set(customer.id, customer);
        return { id: customer.id };
      },
      createWithIdempotency: async (input: {
        metadata: { userId: string };
      }) => {
        const customer = {
          id: buildE2eStripeCustomerId(input.metadata.userId),
          metadata: { userId: input.metadata.userId },
        };
        customers.set(customer.id, customer);
        return { id: customer.id };
      },
      retrieve: async (customerId: string) =>
        customers.get(customerId) ?? {
          id: customerId,
          metadata: {},
        },
    },
    billingPortal: {
      sessions: {
        create: async (input: { return_url: string }) => ({
          url: input.return_url,
        }),
      },
    },
    checkout: {
      sessions: {
        create: async (input: { success_url: string }) => {
          const session = {
            id: "cs_e2e",
            url: input.success_url,
            status: "open",
          };
          checkoutSessions.set(session.id, session);
          return session;
        },
        retrieve: async (sessionId: string) =>
          checkoutSessions.get(sessionId) ?? {
            id: sessionId,
            url: null,
            status: "open",
          },
        expire: async (sessionId: string) => {
          const existing = checkoutSessions.get(sessionId) ?? {
            id: sessionId,
            url: null,
            status: "open",
          };
          const expired = { ...existing, status: "expired" };
          checkoutSessions.set(sessionId, expired);
          return expired;
        },
        createWithIdempotency: async (input: { success_url: string }) => {
          const session = {
            id: "cs_e2e",
            url: input.success_url,
            status: "open",
          };
          checkoutSessions.set(session.id, session);
          return session;
        },
      },
    },
    invoices: {
      retrieveUpcoming: async () => ({
        amount_due: 2000,
        currency: "usd",
      }),
      list: async () => ({ data: [] }),
    },
    paymentIntents: {
      list: async () => ({ data: [] }),
    },
    webhooks: {
      constructEventAsync: async (payload: string) => {
        try {
          return JSON.parse(payload) as {
            id: string;
            type: string;
            data: { object: Record<string, unknown> };
          };
        } catch {
          return {
            id: "evt_e2e",
            type: "checkout.session.completed",
            data: { object: {} },
          };
        }
      },
    },
  };
}

export function createStripeClient(env: StripeClientEnv): StripeLike {
  // E2E stub is only permitted when ENVIRONMENT is explicitly "development" or
  // "test". An unset ENVIRONMENT must never silently enable the stub — the gate
  // is fail-closed so a misconfigured worker falls through to the real client.
  if (isE2eAllowed(env)) {
    return createE2eStripeClient();
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
  (stripe.customers as StripeLike["customers"]).createWithIdempotency = (
    input: {
      email: string;
      name: string;
      metadata: { userId: string };
    },
    idempotencyKey: string,
  ) => stripe.customers.create(input, { idempotencyKey });
  const retrieveCheckoutSession = stripe.checkout.sessions.retrieve.bind(
    stripe.checkout.sessions,
  );
  const expireCheckoutSession = stripe.checkout.sessions.expire.bind(
    stripe.checkout.sessions,
  );
  (
    stripe.checkout.sessions as StripeLike["checkout"]["sessions"]
  ).createWithIdempotency = (
    input: StripeCheckoutSessionCreateInput,
    idempotencyKey: string,
  ) =>
    stripe.checkout.sessions.create(input, {
      idempotencyKey,
    }) as Promise<{ id: string; url: string | null }>;
  (stripe.checkout.sessions as StripeLike["checkout"]["sessions"]).retrieve =
    retrieveCheckoutSession as StripeLike["checkout"]["sessions"]["retrieve"];
  (stripe.checkout.sessions as StripeLike["checkout"]["sessions"]).expire =
    expireCheckoutSession as StripeLike["checkout"]["sessions"]["expire"];
  (stripe.invoices as StripeLike["invoices"]).retrieveUpcoming = (input: {
    customer: string;
  }) =>
    stripe.invoices.createPreview(input) as Promise<{
      amount_due: number;
      currency: string;
    }>;

  // Cloudflare Workers lack Node's crypto module. Bind the WebCrypto-based
  // provider so constructEventAsync works in the Workers runtime.
  const subtleProvider = Stripe.createSubtleCryptoProvider();
  const rawConstructEventAsync = stripe.webhooks.constructEventAsync.bind(
    stripe.webhooks,
  );
  (stripe.webhooks as unknown as StripeLike["webhooks"]).constructEventAsync = (
    payload: string,
    signature: string,
    secret: string,
  ) =>
    rawConstructEventAsync(
      payload,
      signature,
      secret,
      undefined,
      subtleProvider,
    ) as unknown as Promise<StripeEvent>;

  // The real Stripe SDK satisfies StripeLike structurally once the small
  // helper methods above are attached.
  return stripe as unknown as StripeLike;
}
