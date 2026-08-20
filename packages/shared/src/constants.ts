export const WEDDING_ROLES = ["owner", "editor", "viewer"] as const;
export type WeddingRole = (typeof WEDDING_ROLES)[number];

// Invites may only grant non-owner roles; ownership cannot be reassigned via an invite.
export const INVITABLE_WEDDING_ROLES = WEDDING_ROLES.filter(
  (role): role is Exclude<WeddingRole, "owner"> => role !== "owner",
);
export type InvitableWeddingRole = (typeof INVITABLE_WEDDING_ROLES)[number];

export const BILLING_PLANS = ["free", "starter", "pro", "lifetime"] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];

export const BILLING_PLAN_LABELS: Record<BillingPlan, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  lifetime: "Lifetime",
};

// PRICING_TIERS is derived from BILLING_PLANS minus the free plan, so the two
// stay in sync automatically when a new paid tier is added.
export const PRICING_TIERS = BILLING_PLANS.filter(
  (plan): plan is Exclude<BillingPlan, "free"> => plan !== "free",
);
export type PricingTier = (typeof PRICING_TIERS)[number];

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  month: "Monthly",
  year: "Yearly",
};

export const TRIAL_DURATION_DAYS = 30;

// Stripe price IDs must be of the form `price_...`.
export type StripePriceId = `price_${string}`;

// Typed map of Stripe price IDs keyed by paid plan and billing interval.
// Lifetime is a one-time purchase so it only has a single price.
export type StripePriceMap = {
  starter: { month: StripePriceId; year: StripePriceId };
  pro: { month: StripePriceId; year: StripePriceId };
  lifetime: { month: StripePriceId };
};

export const STRIPE_PRICE_ENV_KEYS = {
  starter: {
    month: "STRIPE_STARTER_PRICE_ID",
    year: "STRIPE_STARTER_ANNUAL_PRICE_ID",
  },
  pro: {
    month: "STRIPE_PRO_PRICE_ID",
    year: "STRIPE_PRO_ANNUAL_PRICE_ID",
  },
  lifetime: {
    month: "STRIPE_LIFETIME_PRICE_ID",
  },
} as const satisfies Record<
  PricingTier,
  Partial<Record<BillingInterval, string>>
>;
type ValueOf<T> = T[keyof T];
export type StripePriceEnvKey = ValueOf<{
  [Plan in keyof typeof STRIPE_PRICE_ENV_KEYS]: ValueOf<
    (typeof STRIPE_PRICE_ENV_KEYS)[Plan]
  >;
}>;

export const BILLING_FEATURES = [
  "vendors",
  "extraPlanner",
  "weddingWebsite",
] as const;
export type BillingFeature = (typeof BILLING_FEATURES)[number];

export const BILLING_FEATURE_LABELS: Record<BillingFeature, string> = {
  vendors: "Vendor tracking & contracts",
  extraPlanner: "Multi-planner collaboration",
  weddingWebsite: "Wedding website & RSVP",
};

export const BILLING_STATUSES = [
  "inactive",
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const BILLING_PLAN_FEATURES: Record<
  BillingPlan,
  readonly BillingFeature[]
> = {
  free: [],
  starter: [],
  pro: BILLING_FEATURES,
  // Lifetime is a one-time purchase ($100) that grants all features permanently,
  // including extraPlanner (multi-planner support). The one-time price is the
  // trade-off for losing the recurring billing; feature parity with paid plans
  // is intentional.
  lifetime: BILLING_FEATURES,
};

export const WEDDING_WEBSITE_TEMPLATES = [
  "classic",
  "modern",
  "editorial",
] as const;
export type WeddingWebsiteTemplate = (typeof WEDDING_WEBSITE_TEMPLATES)[number];

export const WEDDING_WEBSITE_RESERVED_SLUGS = [
  "admin",
  "api",
  "edit",
  "new",
  "preview",
  "public",
  "rsvp",
  "w",
  "website",
  "weddings",
] as const;

// Infrastructure subdomains that must never be used as public wedding slugs.
// These are common DNS/service names that could conflict with hosting infrastructure.
export const RESERVED_SLUG_WORDS = [
  "admin",
  "api",
  "app",
  "www",
  "mail",
  "ftp",
  "smtp",
  "pop",
  "imap",
] as const;
export type ReservedSlugWord = (typeof RESERVED_SLUG_WORDS)[number];
export type WeddingWebsiteReservedSlug =
  (typeof WEDDING_WEBSITE_RESERVED_SLUGS)[number];

export const GUEST_SIDES = ["partner1", "partner2", "mutual"] as const;
export type GuestSide = (typeof GUEST_SIDES)[number];

export const RSVP_STATUSES = [
  "pending",
  "invited",
  "accepted",
  "declined",
] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "halal",
  "kosher",
  "nut_allergy",
  "dairy_free",
  "other",
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const SEATING_TABLE_SHAPES = ["round", "rectangle"] as const;
export type SeatingTableShape = (typeof SEATING_TABLE_SHAPES)[number];

export const CONTRACT_STATUSES = ["none", "sent", "signed"] as const;
export type VendorContractStatus = (typeof CONTRACT_STATUSES)[number];

export const VENDOR_QUOTE_STATUSES = [
  "pending",
  "accepted",
  "rejected",
] as const;
export type VendorQuoteStatus = (typeof VENDOR_QUOTE_STATUSES)[number];

export const VENDOR_PAYMENT_TYPES = [
  "deposit",
  "installment",
  "final",
] as const;
export type VendorPaymentType = (typeof VENDOR_PAYMENT_TYPES)[number];

export const SEATING_MAX_TABLES = 40;
export const SEATING_MIN_CAPACITY = 2;
export const SEATING_MAX_CAPACITY = 20;
export const SEATING_WORKSPACE_WIDTH = 1200;
export const SEATING_WORKSPACE_HEIGHT = 800;
export const SEATING_TABLE_FOOTPRINT = 190;

export const EMAIL_PREFERENCE_TYPES = [
  "appLifecycle",
  "memberInvite",
  "rsvpConfirmation",
  "rsvpReminder",
] as const;
export type EmailPreferenceType = (typeof EMAIL_PREFERENCE_TYPES)[number];

export const EMAIL_DELIVERY_STATUSES = ["sent", "failed", "skipped"] as const;
export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];
