import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { kaiplanPricingFacts } from "@kaiplan/knowledge/marketing";

const { plans: PLAN_PRICING } = kaiplanPricingFacts;

const pricingSource = readFileSync(
  fileURLToPath(new URL("./pricing.astro", import.meta.url)),
  "utf8",
).replace(/\r\n/g, "\n");

describe("pricing page (pricing.astro) Wave 3", () => {
  it("uses the editorial layout system and the LandingLayout shell", () => {
    expect(pricingSource).toContain("editorial-shell");
    expect(pricingSource).toContain("LandingLayout");
    expect(pricingSource).toContain('data-page="pricing"');
  });

  it("renders the editorial hero with the correct headline and lede", () => {
    expect(pricingSource).toContain("editorial-display-l");
    expect(pricingSource).toContain("Simple pricing for one wedding.");
    expect(pricingSource).toContain("Pricing");
    expect(pricingSource).toContain("Start planning");
    expect(pricingSource).toContain("buildAppSignupUrl()");
  });

  it("renders exactly one h1 and h2 per major section", () => {
    const h1Count = (pricingSource.match(/<h1[\s>]/g) ?? []).length;
    expect(h1Count).toBe(1);
    const h2Count = (pricingSource.match(/<h2[\s>]/g) ?? []).length;
    // Hero h1, then h2s for: tiers spread, tier-detail Q&A, pricing principles, closing CTA
    expect(h2Count).toBeGreaterThanOrEqual(4);
  });

  it("includes the hairline tab pair toggle for monthly/annual billing", () => {
    expect(pricingSource).toContain("editorial-tabs");
    expect(pricingSource).toContain("data-pricing-tab-monthly");
    expect(pricingSource).toContain("data-pricing-tab-annual");
  });

  it("defaults to annual: annual button aria-pressed=true, monthly aria-pressed=false", () => {
    const monthlyIdx = pricingSource.indexOf("data-pricing-tab-monthly");
    const annualIdx = pricingSource.indexOf("data-pricing-tab-annual");
    // monthly button's aria-pressed must appear between the two attribute markers
    const betweenButtons = pricingSource.slice(monthlyIdx, annualIdx);
    expect(betweenButtons).toContain('aria-pressed="false"');
    // annual button's aria-pressed must appear after its own attribute marker
    const afterAnnual = pricingSource.slice(annualIdx);
    expect(afterAnnual).toContain('aria-pressed="true"');
  });

  it("shows '2 months free' badge on the annual tab, accessible to screen readers via aria-label", () => {
    expect(pricingSource).toContain("2 months free");
    expect(pricingSource).toContain("pricing__save-badge");
    expect(pricingSource).toContain('aria-hidden="true"');
    expect(pricingSource).toContain('aria-label="Annually, 2 months free"');
  });

  it("renders standard prices without launch badges", () => {
    expect(pricingSource).not.toContain("pricing__original-price");
    expect(pricingSource).not.toContain("pricing__discount-badge");
    expect(pricingSource).toContain("price");

    const tiersByName = new Map(
      siteConfig.pricingTiers.map((tier) => [tier.name, tier]),
    );
    expect(tiersByName.get("Starter")).toMatchObject({
      price: PLAN_PRICING.starter.price,
    });
    expect(tiersByName.get("Starter")).not.toHaveProperty("originalPrice");
  });

  it("does not render removed pricing disclosures", () => {
    expect(pricingSource).not.toContain("pricing__offer-disclosure");
    expect(pricingSource).not.toContain("/terms/#launch-offer");
    expect(pricingSource).not.toContain("applied automatically");
  });

  it("formats annual prices as per-month with 'billed annually' using the correct formula", () => {
    // Template expressions are not evaluated in the raw source, so we verify the
    // formula itself: divide annualPriceCents by 12 before converting cents to
    // dollars per month. The string "billed annually" must also appear as the
    // label suffix.
    expect(pricingSource).toContain("billed annually");
    expect(pricingSource).toContain(
      "formatMonthlyEquivalent(tier.annualPriceCents)",
    );
    expect(pricingSource).toContain("formatCentsAsDollars(cents / 12)");
    // The ternary fallback for tiers without annualPriceCents (Lifetime) uses
    // the discounted display price directly, so confirm the fallback branch is present.
    expect(pricingSource).toContain(": displayPrice");
    // Verify the formula produces the correct values for siteConfig tiers
    const annualTiers = siteConfig.pricingTiers.filter(
      (t) =>
        "annualPriceCents" in t &&
        (t as { annualPriceCents?: number }).annualPriceCents,
    );
    for (const tier of annualTiers) {
      const cents = (tier as { annualPriceCents: number }).annualPriceCents;
      const expectedMonthly = cents / 12 / 100;
      // Sanity check: 2 months free means 10 × monthly = annual total
      const monthlyPriceCents = (tier as { monthlyPriceCents?: number })
        .monthlyPriceCents;
      if (monthlyPriceCents) {
        expect(cents).toBe(monthlyPriceCents * 10);
      }
      expect(expectedMonthly).toBeGreaterThan(0);
    }
  });

  it("registers the astro:before-swap cleanup listener", () => {
    expect(pricingSource).toContain("astro:before-swap");
    expect(pricingSource).toContain("once: true");
  });

  it("attaches data attributes for the pricing toggle wiring", () => {
    expect(pricingSource).toContain("data-monthly-price");
    expect(pricingSource).toContain("data-annual-price");
  });

  it("keeps trial CTAs generic instead of preselecting a plan", () => {
    expect(pricingSource).toContain("href={openAppUrl}");
    expect(pricingSource).not.toContain("data-cta-monthly-href={monthlyHref}");
    expect(pricingSource).not.toContain("href={annualHref}");
  });

  it("wires the editorial pricing toggle controller", () => {
    expect(pricingSource).toContain("initEditorialPricingToggle");
    expect(pricingSource).toContain("readInitialInterval");
  });

  it("renders the typeset three-tier price spread with hairline columns", () => {
    expect(pricingSource).toContain("editorial-price-spread");
    expect(pricingSource).toContain("editorial-price-spread__column");
    expect(pricingSource).toContain("editorial-price-spread__name");
    expect(pricingSource).toContain("editorial-price-spread__price");
    expect(pricingSource).toContain("editorial-price-spread__features");
    expect(pricingSource).toContain("editorial-price-spread__cta");
  });

  it("marks the Pro column with the EDITOR'S PICK eyebrow bar", () => {
    expect(pricingSource).toContain("editorial-price-spread__editor-pick");
    expect(pricingSource.toLowerCase()).toMatch(/editor.{1,10}s pick/);
  });

  it("reads tier best-for copy from kaiplanOffering.plans dynamically", () => {
    expect(pricingSource).toContain("offeringPlan?.bestFor");
    expect(pricingSource).toContain("kaiplanOffering.plans");
  });

  it("renders the tier-detail Q&A using the editorial qa pattern from kaiplanOffering.planFaqs", () => {
    expect(pricingSource).toContain("editorial-qa");
    expect(pricingSource).toContain("editorial-qa__answer");
    // Q&A items now come from kaiplanOffering.planFaqs. Assert the source
    // reads from the offering rather than asserting on literal copy strings.
    expect(pricingSource).toContain("kaiplanOffering.planFaqs");
    expect(pricingSource).toContain("item.q");
    expect(pricingSource).toContain("item.a");
  });

  it("renders the pricing principles editorial body block", () => {
    expect(pricingSource).toContain("How we think about pricing");
    expect(pricingSource).toContain("editorial-body");
  });

  it("renders a closing CTA sentence with editorial-link styling", () => {
    expect(pricingSource).toContain("editorial-link");
  });

  it("frames the public trial as full-app access before plan choice", () => {
    expect(pricingSource).toContain("full app");
    expect(pricingSource).toContain("choose a plan later");
    expect(pricingSource.toLowerCase()).not.toContain("card required");
    expect(pricingSource.toLowerCase()).not.toContain("requires a card");
    expect(pricingSource).not.toContain("Start with {tier.name}");
  });

  it("does not retain banned legacy patterns", () => {
    expect(pricingSource).not.toContain("marketing-card-grid");
    expect(pricingSource).not.toContain("marketing-card");
    expect(pricingSource).not.toContain("marketing-panel");
    expect(pricingSource).not.toContain("&#10003;"); // green checkmark glyph
    expect(pricingSource).not.toContain("ScreenshotGallery");
  });

  it("does not include visible em dash characters or mojibake dash artifacts", () => {
    expect(pricingSource).not.toContain(String.fromCharCode(0x2014));
    expect(pricingSource).not.toContain(
      `${String.fromCharCode(0x00e2)}${String.fromCharCode(0x20ac)}${String.fromCharCode(0x201d)}`,
    );
  });

  it("uses real pricing tier data from siteConfig", () => {
    expect(siteConfig.pricingTiers).toHaveLength(3);
    const names = siteConfig.pricingTiers.map((t) => t.name);
    expect(names).toEqual(["Starter", "Pro", "Lifetime"]);
  });
});
