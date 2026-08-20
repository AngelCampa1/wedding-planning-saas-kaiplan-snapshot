import { siteConfig } from "@/config/site";
import { buildPricingTxt } from "@kaiplan/marketing/lib/pricing-txt";
import type { APIContext } from "astro";

export const prerender = true;

const PRICING_TXT_UPDATED_AT = "2026-05-12";

export function GET(_context: APIContext) {
  return new Response(
    buildPricingTxt({
      productName: siteConfig.name,
      tiers: siteConfig.pricingTiers,
      updatedAt: PRICING_TXT_UPDATED_AT,
      trialText: siteConfig.pricingConfig?.trialBannerText,
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
