import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import { siteConfig } from "@/config/site";

const indexSource = readFileSync(
  fileURLToPath(new URL("./index.astro", import.meta.url)),
  "utf8",
);

describe("homepage (index.astro)", () => {
  it("renders the trial banner copy as the pricing chapter footnote", () => {
    expect(indexSource).toContain("homepage.pricing.helperText");
    expect(indexSource).toContain("pricing-note");
    expect(indexSource).toContain("pricing-grid");
  });

  it("keeps the trial banner copy discoverable via siteConfig", () => {
    expect(siteConfig.pricingConfig.trialBannerText.toLowerCase()).toContain(
      `${TRIAL_DURATION_DAYS}-day`,
    );
  });

  it("keeps homepage pricing simple and sends tier CTAs to signup", () => {
    expect(indexSource).toContain("pricing-card");
    expect(indexSource).toContain("tier.ctaTarget");
    expect(indexSource).not.toContain("data-pricing-tab-monthly");
    expect(indexSource).not.toContain("data-pricing-toggle");
  });

  it("renders the clarity hero and main conversion sections", () => {
    expect(indexSource).toContain("homepage.hero.headline");
    for (const heading of [
      "What Kaiplan solves",
      "How Kaiplan works",
      "Built for couples and their planning circle",
      "Everything stays connected",
      "Simple pricing for one wedding",
    ]) {
      expect(indexSource).toContain(heading);
    }
    expect(indexSource).toContain("editorial-display-xl");
    expect(indexSource).toContain("product-stack");
    expect(indexSource).toContain("workflow-list");
    expect(indexSource).toContain("editorial-qa");
  });

  it("does not retain banned legacy patterns", () => {
    // Per the Wave 2 ban list — no card grids, gradient text, marquee,
    // or rounded icon containers in the homepage source.
    expect(indexSource).not.toContain("marketing-card-grid");
    expect(indexSource).not.toContain("marketing-card");
    expect(indexSource).not.toContain("ScreenshotGallery");
    expect(indexSource).not.toContain("SocialProofBar");
    expect(indexSource).not.toContain("HeroSection");
  });

  it("links the primary hero CTA to the app", () => {
    // openAppUrl is built once with buildAppSignupUrl() and threaded into
    // the hero CTA. The signup URL points at https://my.kaiplan.app in
    // production (per app-links.ts).
    expect(indexSource).toContain("buildAppSignupUrl()");
    expect(indexSource).toContain("homepage.hero.primaryCta.text");
  });
});
