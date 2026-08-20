import { STRIPE_PRICE_ENV_KEYS, type StripePriceEnvKey } from "@kaiplan/shared";

export const TEST_STRIPE_PRICE_IDS = {
  starter: {
    month: "price_starter",
    year: "price_starter_annual",
  },
  pro: {
    month: "price_pro",
    year: "price_pro_annual",
  },
  lifetime: {
    month: "price_lifetime",
  },
} as const;

export const TEST_STRIPE_PRICE_ENV = {
  [STRIPE_PRICE_ENV_KEYS.starter.month]: TEST_STRIPE_PRICE_IDS.starter.month,
  [STRIPE_PRICE_ENV_KEYS.starter.year]: TEST_STRIPE_PRICE_IDS.starter.year,
  [STRIPE_PRICE_ENV_KEYS.pro.month]: TEST_STRIPE_PRICE_IDS.pro.month,
  [STRIPE_PRICE_ENV_KEYS.pro.year]: TEST_STRIPE_PRICE_IDS.pro.year,
  [STRIPE_PRICE_ENV_KEYS.lifetime.month]: TEST_STRIPE_PRICE_IDS.lifetime.month,
} satisfies Record<StripePriceEnvKey, string>;
