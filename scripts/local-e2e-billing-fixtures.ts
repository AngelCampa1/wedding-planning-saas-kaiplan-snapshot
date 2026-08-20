import {
  STRIPE_PRICE_ENV_KEYS,
  TRIAL_DURATION_DAYS,
  type PricingTier,
  type StripePriceEnvKey,
} from "../packages/shared/src/index";

export const LOCAL_E2E_DEFAULT_PAID_PLAN = "pro" satisfies PricingTier;

export const LOCAL_E2E_STRIPE_PRICE_IDS = {
  starter: {
    month: "price_starter_local",
    year: "price_starter_annual_local",
  },
  pro: {
    month: "price_pro_local",
    year: "price_pro_annual_local",
  },
  lifetime: {
    month: "price_lifetime_local",
  },
} as const satisfies Record<
  PricingTier,
  Partial<Record<"month" | "year", string>>
>;

export const LOCAL_E2E_TRIAL_DURATION_SECONDS =
  TRIAL_DURATION_DAYS * 24 * 60 * 60;

export const LOCAL_E2E_TRIAL_DURATION_SQL_INTERVAL = `${TRIAL_DURATION_DAYS} days`;

export function buildLocalE2eStripePriceEnv(): Record<
  StripePriceEnvKey,
  string
> {
  return {
    [STRIPE_PRICE_ENV_KEYS.starter.month]:
      LOCAL_E2E_STRIPE_PRICE_IDS.starter.month,
    [STRIPE_PRICE_ENV_KEYS.starter.year]:
      LOCAL_E2E_STRIPE_PRICE_IDS.starter.year,
    [STRIPE_PRICE_ENV_KEYS.pro.month]: LOCAL_E2E_STRIPE_PRICE_IDS.pro.month,
    [STRIPE_PRICE_ENV_KEYS.pro.year]: LOCAL_E2E_STRIPE_PRICE_IDS.pro.year,
    [STRIPE_PRICE_ENV_KEYS.lifetime.month]:
      LOCAL_E2E_STRIPE_PRICE_IDS.lifetime.month,
  };
}
