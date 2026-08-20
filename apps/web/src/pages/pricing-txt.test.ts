import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { GET } from "./pricing.txt";

describe("pricing.txt route", () => {
  it("serves machine-readable pricing from site config", async () => {
    const response = GET({} as never);
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
    expect(body).toContain(`# ${siteConfig.name} Pricing`);
    expect(body).toContain("Updated: 2026-05-12");

    for (const tier of siteConfig.pricingTiers ?? []) {
      expect(body).toContain(`## ${tier.name}`);
      expect(body).toContain(
        tier.pricingModel === "one-time"
          ? `One-time: ${tier.price}`
          : `Monthly: ${tier.price}`,
      );
      expect(body).toContain(tier.features[0]);
    }
    expect(body).not.toContain("Monthly: $50 once");
  });
});
