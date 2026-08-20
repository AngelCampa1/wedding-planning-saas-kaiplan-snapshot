import { z } from "zod";
import {
  BILLING_FEATURES,
  BILLING_PLANS,
  BILLING_STATUSES,
  type BillingPlan,
} from "./constants";

// Derive the paid plan list from BILLING_PLANS so it automatically tracks
// additions to the canonical plan list. The tuple assertion below only
// asserts non-emptiness for z.enum; the element type remains derived.
type PaidBillingPlan = Exclude<BillingPlan, "free">;

const paidBillingPlans: readonly PaidBillingPlan[] = BILLING_PLANS.filter(
  (plan): plan is PaidBillingPlan => plan !== "free",
);

// z.enum requires a non-empty readonly tuple. `paidBillingPlans` is guaranteed
// non-empty at runtime because BILLING_PLANS always contains non-free plans;
// this cast narrows the type signature without hard-coding the list.
const paidBillingPlansTuple = paidBillingPlans as unknown as readonly [
  PaidBillingPlan,
  ...PaidBillingPlan[],
];

export const createCheckoutSessionSchema = z.object({
  plan: z.enum(paidBillingPlansTuple),
  interval: z.enum(["month", "year"]).optional().default("month"),
});

export const billingSummarySchema = z.object({
  plan: z.enum(BILLING_PLANS),
  status: z.enum(BILLING_STATUSES),
  stripeCustomerId: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  billingGateRequired: z.boolean(),
  features: z.array(z.enum(BILLING_FEATURES)),
  canManageBilling: z.boolean(),
  trialDaysRemaining: z.number().int().min(0).nullable(),
  featuresUsed: z.array(z.enum(BILLING_FEATURES)),
});

export const billingHistoryItemSchema = z.object({
  id: z.string(),
  type: z.enum(["invoice", "payment_intent"]),
  amountCents: z.number().int().nonnegative(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO 4217 uppercase code"),
  status: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  hostedUrl: z.string().url().nullable(),
});

export const billingHistoryResponseSchema = z.object({
  items: z.array(billingHistoryItemSchema),
});

export type CreateCheckoutSessionInput = z.infer<
  typeof createCheckoutSessionSchema
>;
