import { PRICING_TIERS, type PricingTier } from "@kaiplan/shared";

const configuredPublicAppOrigin = import.meta.env.PUBLIC_APP_ORIGIN?.trim();
const DEFAULT_LOCAL_APP_ORIGIN = "http://localhost:3030";
const DEFAULT_PRODUCTION_APP_ORIGIN = "https://my.kaiplan.app";

function resolvePublicAppOrigin(): string {
  if (configuredPublicAppOrigin && configuredPublicAppOrigin.length > 0) {
    return configuredPublicAppOrigin.replace(/\/$/, "");
  }

  if (!import.meta.env.PROD) {
    return DEFAULT_LOCAL_APP_ORIGIN;
  }

  return DEFAULT_PRODUCTION_APP_ORIGIN;
}

export const PUBLIC_APP_ORIGIN = resolvePublicAppOrigin();

export type PublicAppPlan = PricingTier;

function normalizeAppOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

function buildAppUrl(
  path: string,
  search: Record<string, string | undefined> | undefined,
  origin = PUBLIC_APP_ORIGIN,
): string {
  const normalizedPath = path;
  const normalizedOrigin =
    origin.trim().length > 0 ? normalizeAppOrigin(origin) : "";

  if (normalizedOrigin.length === 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(search ?? {})) {
      if (value) {
        searchParams.set(key, value);
      }
    }

    const query = searchParams.toString();
    return query.length > 0 ? `${normalizedPath}?${query}` : normalizedPath;
  }

  const url = new URL(normalizedPath, `${normalizedOrigin}/`);

  for (const [key, value] of Object.entries(search ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

export function resolvePricingTierPlan(
  tierName: string,
): PublicAppPlan | undefined {
  const normalizedName = tierName.trim().toLowerCase();

  return PRICING_TIERS.find((plan) => plan === normalizedName);
}

export function buildAppSignupUrl(
  plan?: PublicAppPlan,
  interval?: "month" | "year",
  origin = PUBLIC_APP_ORIGIN,
): string {
  if (plan === undefined) {
    return buildAppUrl("/signup", undefined, origin);
  }

  const search: Record<string, string> = { plan };
  if (interval === "year") {
    search.interval = "year";
  }
  return buildAppUrl("/signup", search, origin);
}

export function buildAppLoginUrl(
  plan?: PublicAppPlan,
  origin = PUBLIC_APP_ORIGIN,
): string {
  return buildAppUrl(
    "/login",
    plan === undefined ? undefined : { plan },
    origin,
  );
}
