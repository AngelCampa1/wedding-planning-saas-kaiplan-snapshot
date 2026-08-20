import { describe, expect, it } from "vitest";
import { publicSiteCopy } from "@kaiplan/knowledge/marketing";
import { kaiplanOffering } from "@kaiplan/knowledge";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import type { SiteConfig } from "@kaiplan/marketing";
import { siteConfig, screenshotGallery } from "../config/site";
import { PUBLIC_APP_ORIGIN } from "./app-links";
import {
  buildKaiplanHomepageData,
  resolveKaiplanCta,
  type KaiplanPageFamily,
} from "./homepage-cro";

function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    ...siteConfig,
    ...overrides,
    pricingTiers: overrides.pricingTiers ?? siteConfig.pricingTiers,
  };
}

describe("resolveKaiplanCta", () => {
  it("returns a pricing-anchor CTA for high-intent homepage visitors", () => {
    expect(resolveKaiplanCta("home", "bofu")).toEqual({
      buyerStage: "bofu",
      pageFamily: "home",
      text: "Start free trial",
      href: "#pricing",
      label: "Homepage pricing",
    });
  });

  it("sends guide readers to the wedding software pricing guide first", () => {
    expect(resolveKaiplanCta("guides", "tofu")).toEqual({
      buyerStage: "tofu",
      pageFamily: "guides",
      text: "See what paid planning software costs",
      href: "/resources/guides/wedding-planning-software-pricing-guide/",
      label: "Pricing guide",
    });
  });

  it("sends pricing-breakdown readers to the free-vs-paid comparison", () => {
    expect(resolveKaiplanCta("pricing-breakdowns", "mofu")).toEqual({
      buyerStage: "mofu",
      pageFamily: "pricing-breakdowns",
      text: "See what free tools actually cost",
      href: "/compare/pricing/free-vs-paid-wedding-apps/",
      label: "Free vs paid wedding apps",
    });
  });

  it("exposes every supported page family in the route map", () => {
    const families: KaiplanPageFamily[] = [
      "home",
      "guides",
      "listicles",
      "comparisons",
      "pricing-breakdowns",
      "alternatives",
    ];

    for (const family of families) {
      expect(resolveKaiplanCta(family, "tofu").pageFamily).toBe(family);
      expect(resolveKaiplanCta(family, "mofu").pageFamily).toBe(family);
      expect(resolveKaiplanCta(family, "bofu").pageFamily).toBe(family);
    }
  });

  it("uses the canonical the-knot alternative route instead of the legacy slug", () => {
    expect(resolveKaiplanCta("guides", "bofu")).toEqual({
      buyerStage: "bofu",
      pageFamily: "guides",
      text: "See the no-ad alternative",
      href: "/compare/alternatives/the-knot/",
      label: "The Knot alternative",
    });
    expect(resolveKaiplanCta("comparisons", "bofu").href).toBe(
      "/compare/alternatives/the-knot/",
    );
    expect(resolveKaiplanCta("pricing-breakdowns", "bofu").href).toBe(
      "/compare/alternatives/the-knot/",
    );
    expect(resolveKaiplanCta("alternatives", "bofu").href).toBe(
      "/compare/alternatives/the-knot/",
    );
  });
});

describe("buildKaiplanHomepageData", () => {
  it("frames the hero around paid planning software instead of a generic trial", () => {
    const homepage = buildKaiplanHomepageData(siteConfig);

    expect(homepage.hero.headline).toBe(
      "Plan the wedding in one connected workspace.",
    );
    expect(homepage.hero.subheadline).toContain(
      "couples and the people helping them plan",
    );
    expect(homepage.hero.trustSignal).toContain("No vendor ads");
    expect(homepage.hero.subheadline).toContain("Pro adds");
    expect(homepage.hero.subheadline).toContain("RSVP flow");
    expect(homepage.hero.subheadline).toContain("budget");
    expect(homepage.hero.primaryCta).toEqual({
      text: "Start planning",
      target: PUBLIC_APP_ORIGIN + "/signup",
    });
    expect(homepage.hero.secondaryCta).toEqual({
      text: "See how it works",
      target: "#how-it-works",
    });
    expect(homepage.hero.benefits).toEqual(publicSiteCopy.heroBenefits);
  });

  it("builds a why-pay section with three objection blocks before pricing", () => {
    const homepage = buildKaiplanHomepageData(siteConfig);

    expect(homepage.whyPay.heading).toBe("What Kaiplan solves");
    expect(homepage.whyPay.intro).toContain("one source of truth");
    expect(homepage.whyPay.blocks).toHaveLength(3);
    expect(homepage.whyPay.blocks[0]).toMatchObject({
      id: "vendor-bias",
      title:
        "The biggest wedding directories still make money when vendors buy visibility.",
      cta: {
        href: "/resources/guides/wedding-planning-without-vendor-ads/",
      },
    });
    expect(homepage.whyPay.blocks[1]).toMatchObject({
      id: "tool-fragmentation",
      cta: {
        href: "/resources/guides/why-couples-juggle-multiple-wedding-tools/",
      },
    });
    expect(homepage.whyPay.blocks[2]).toMatchObject({
      id: "pricing-fit",
      cta: {
        href: "/compare/pricing/free-vs-paid-wedding-apps/",
      },
    });
  });

  it("rewrites pricing selection into a trial-first account flow", () => {
    const homepage = buildKaiplanHomepageData(siteConfig);
    const tierTexts = homepage.pricing.tiers.map((tier) => ({
      text: tier.ctaText,
      target: tier.ctaTarget,
    }));

    expect(homepage.pricing.heading).toBe("Simple pricing for one wedding");
    expect(homepage.pricing.intro).toContain("full app trial");
    expect(homepage.pricing.helperText).toBe(
      publicSiteCopy.pricingTrialBannerText,
    );
    const helperText = homepage.pricing.helperText.toLowerCase();
    expect(helperText).toContain(`${TRIAL_DURATION_DAYS}-day`);
    expect(helperText).toContain("full app access");
    expect(helperText).toContain("choose a plan later");
    expect(helperText).not.toContain("launch");
    expect(helperText).not.toContain("promo");
    expect(homepage.pricing.socialProofText).toContain("planning core");
    expect(tierTexts).toEqual([
      {
        text: kaiplanOffering.plans.starter.ctaTextHomepage,
        target: `${PUBLIC_APP_ORIGIN}/signup`,
      },
      {
        text: kaiplanOffering.plans.pro.ctaTextHomepage,
        target: `${PUBLIC_APP_ORIGIN}/signup`,
      },
      {
        text: kaiplanOffering.plans.lifetime.ctaTextHomepage,
        target: `${PUBLIC_APP_ORIGIN}/signup`,
      },
    ]);
  });

  it("does not mutate the shared site pricing tiers when it rewrites homepage CTA copy", () => {
    const originalTierTexts =
      siteConfig.pricingTiers?.map((tier) => tier.ctaText) ?? [];

    const homepage = buildKaiplanHomepageData(siteConfig);

    expect(homepage.pricing.tiers.map((tier) => tier.ctaText)).not.toEqual(
      originalTierTexts,
    );
    expect(siteConfig.pricingTiers?.map((tier) => tier.ctaText)).toEqual(
      originalTierTexts,
    );
  });

  it("tightens the FAQ around paid intent, live signup, and plan selection", () => {
    const homepage = buildKaiplanHomepageData(siteConfig);

    expect(homepage.faq.heading).toBe("Wedding planning and pricing questions");
    expect(homepage.faq.bottomCtaHeading).toBe(
      "Simple pricing for one wedding",
    );
    expect(homepage.faq.bottomCtaText).toBe("Start planning");
    expect(homepage.faq.bottomCtaTarget).toBe(PUBLIC_APP_ORIGIN + "/signup");
    expect(homepage.faq.items).toEqual([...kaiplanOffering.homepageFaqs]);
    expect(homepage.faq.items[0]?.q).toBe(
      "Why would I pay for Kaiplan instead of staying on free wedding apps?",
    );
    expect(homepage.faq.items[0]?.a).toContain("vendor placements");
    expect(homepage.faq.items[1]?.a).toContain("create your account");

    const checklistFaq = homepage.faq.items.find((item) =>
      item.q.toLowerCase().includes("checklist"),
    );
    expect(checklistFaq).toBeDefined();
    expect(checklistFaq?.a).toContain("60+");
    expect(checklistFaq?.a).toContain("day-of");

    const exportFaq = homepage.faq.items.find((item) =>
      item.q.toLowerCase().includes("export"),
    );
    expect(exportFaq).toBeDefined();
    expect(exportFaq?.a).toContain("CSV");
    expect(exportFaq?.a).toContain("Settings");

    const archiveFaq = homepage.faq.items.find((item) =>
      item.q.toLowerCase().includes("after the wedding"),
    );
    expect(archiveFaq).toBeDefined();
    expect(archiveFaq?.a).toContain("archive");
    expect(archiveFaq?.a).toContain("Lifetime");
  });

  it("includes an AI roadmap FAQ entry that sets honest expectations about AI features", () => {
    const homepage = buildKaiplanHomepageData(siteConfig);

    const aiFaq = homepage.faq.items.find((item) => item.q.includes("AI"));
    expect(aiFaq).toBeDefined();
    expect(aiFaq?.q).toBe("Does Kaiplan use AI?");
    expect(aiFaq?.a).toContain("deterministic");
    expect(aiFaq?.a).toContain("vendor entered");
  });

  it("keeps every tier ctaTarget generic so signup can start with the trial", () => {
    const homepage = buildKaiplanHomepageData(siteConfig);

    for (const tier of homepage.pricing.tiers) {
      expect(tier.ctaTarget).toBe(`${PUBLIC_APP_ORIGIN}/signup`);
    }
  });

  it("falls back to the base product price when named plan tiers are missing", () => {
    const homepage = buildKaiplanHomepageData(
      makeConfig({
        pricingTiers: [
          {
            name: "Essentials",
            price: "$29/mo",
            features: ["Budget ledger"],
          },
        ],
      }),
    );

    expect(homepage.hero.trustSignal).toContain(siteConfig.product.price);
    expect(homepage.pricing.tiers).toEqual([
      {
        name: "Essentials",
        price: "$29/mo",
        features: ["Budget ledger"],
        ctaText: "Start with Essentials",
        ctaTarget: `${PUBLIC_APP_ORIGIN}/signup`,
      },
    ]);
  });

  it("returns an empty homepage pricing tier list when the site config has no tiers yet", () => {
    const homepage = buildKaiplanHomepageData({
      ...siteConfig,
      pricingTiers: undefined,
    });

    expect(homepage.pricing.tiers).toEqual([]);
    expect(homepage.hero.trustSignal).toContain(siteConfig.product.price);
    expect(homepage.stickyCta.subtitle).toContain(
      kaiplanOffering.copy.lifetimePriceLabel,
    );
  });

  it("returns a screenshotGallery with exactly 4 entries, each having src, alt, caption, and feature fields", () => {
    const homepage = buildKaiplanHomepageData({
      ...siteConfig,
      screenshotGallery,
    });

    expect(homepage.screenshotGallery.screenshots).toHaveLength(4);
    for (const shot of homepage.screenshotGallery.screenshots) {
      expect(shot).toHaveProperty("src");
      expect(shot).toHaveProperty("alt");
      expect(shot).toHaveProperty("caption");
      expect(shot).toHaveProperty("feature");
      expect(typeof shot.src).toBe("string");
      expect(typeof shot.alt).toBe("string");
      expect(typeof shot.caption).toBe("string");
      expect(typeof shot.feature).toBe("string");
    }
  });

  it("sets a heading and intro on the screenshotGallery section", () => {
    const homepage = buildKaiplanHomepageData({
      ...siteConfig,
      screenshotGallery,
    });

    expect(homepage.screenshotGallery.heading).toBeTruthy();
    expect(homepage.screenshotGallery.intro).toBeTruthy();
    expect(typeof homepage.screenshotGallery.heading).toBe("string");
    expect(typeof homepage.screenshotGallery.intro).toBe("string");
  });

  it("returns an empty screenshotGallery screenshots array when config has no screenshotGallery", () => {
    const { screenshotGallery: _removed, ...configWithout } =
      siteConfig as typeof siteConfig & { screenshotGallery?: unknown };
    const homepage = buildKaiplanHomepageData(configWithout);

    expect(homepage.screenshotGallery.screenshots).toEqual([]);
    expect(homepage.screenshotGallery.heading).toBeTruthy();
    expect(homepage.screenshotGallery.intro).toBeTruthy();
  });
});
