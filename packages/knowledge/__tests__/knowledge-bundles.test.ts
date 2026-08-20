import { describe, expect, it } from "vitest";
import {
  billingCopy,
  findUnsafeKnowledgeStrings,
  getAllKnowledgeBundles,
  kaiplanOffering,
  kaiplanPricingFacts,
  leadMagnetKnowledge,
  marketingCaptureDefaults,
  marketingCompetitors,
  marketingCtas,
  marketingEmailCopy,
  marketingKnowledgeBundle,
  marketingProductFacts,
  nurtureSequences,
  productIdentity,
  publicFeatureLabels,
  publicPlanFeatures,
  publicPlanLabels,
  publicSiteCopy,
  unsubscribeCopy,
  toMarketingFaqItems,
} from "../src";
import { appHelpKnowledgeBundle } from "../src/bundles";
import { getHelpControl, getHelpTopic, getTourDefinition } from "../src/app";
import {
  PRICING_TIERS,
  PLAN_PRICING,
  TRIAL_DURATION_DAYS,
} from "@kaiplan/shared";

function collectEntries(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectEntries(item));
  }

  if (value && typeof value === "object") {
    const entry = value as Record<string, unknown>;
    const nested = Object.values(entry).flatMap((item) => collectEntries(item));
    return typeof entry.id === "string" && "source" in entry
      ? [entry, ...nested]
      : nested;
  }

  return [];
}

describe("knowledge bundles", () => {
  it("exports separate marketing and app-help bundles", () => {
    expect(marketingKnowledgeBundle.domain).toBe("marketing");
    expect(marketingKnowledgeBundle.consumers).toContain(
      "marketing-automation",
    );
    expect(appHelpKnowledgeBundle.domain).toBe("app");
    expect(appHelpKnowledgeBundle.consumers).toContain("app-support");
  });

  it("keeps canonical knowledge public-safe", () => {
    const unsafe = getAllKnowledgeBundles().flatMap((bundle) =>
      findUnsafeKnowledgeStrings(bundle),
    );

    expect(unsafe).toEqual([]);
  });

  it("keeps reusable public consumer exports public-safe", () => {
    const publicConsumerExports = {
      billingCopy,
      kaiplanPricingFacts,
      leadMagnetKnowledge,
      marketingCaptureDefaults,
      marketingCompetitors,
      marketingCtas,
      marketingEmailCopy,
      marketingProductFacts,
      nurtureSequences,
      productIdentity,
      publicFeatureLabels,
      publicPlanFeatures,
      publicPlanLabels,
      publicSiteCopy,
      unsubscribeCopy,
    };

    expect(findUnsafeKnowledgeStrings(publicConsumerExports)).toEqual([]);
  });

  it("rejects secret-like, internal, private-data, and corrupted strings", () => {
    const unsafeStrings = [
      ["RESEND", "API", "KEY"].join("_"),
      ["api", "keys"].join(" "),
      ["bearer", "token"].join(" "),
      ["private", "keys"].join(" "),
      "password=secret",
      ["auth", "token"].join(" "),
      ["auth", "tokens"].join(" "),
      ["invite", "tokens"].join(" "),
      ["guest", "email"].join(" "),
      ["guest", "emails"].join(" "),
      ["guest's", "email"].join(" "),
      ["customer", "email", "address"].join(" "),
      ["payment", "IDs"].join(" "),
      ["vendor", "contact", "info"].join(" "),
      ["packages", "internal-doc.md"].join("/"),
      ["internal", "strategy"].join(" "),
      ["angel.campa", "kaiplan.app"].join("@"),
      "Sending\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a6",
      "I\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u201e\u00a2m just starting",
      "Broken replacement \uFFFD character",
    ];

    expect(findUnsafeKnowledgeStrings(unsafeStrings)).toEqual(unsafeStrings);
  });

  it("keeps authenticated app guidance off the root public export", async () => {
    const rootExports = await import("../src");

    expect(rootExports).not.toHaveProperty("appHelpKnowledgeBundle");
    expect(rootExports).not.toHaveProperty("helpControls");
    expect(rootExports).not.toHaveProperty("helpTopics");
    expect(rootExports).not.toHaveProperty("tourDefinitions");
    expect(rootExports).not.toHaveProperty("appHelpSurfaces");
    expect(rootExports).not.toHaveProperty("getHelpControl");
    expect(rootExports).not.toHaveProperty("getHelpTopic");
    expect(rootExports).not.toHaveProperty("getTourDefinition");
  });

  it("keeps knowledge entry metadata structurally consistent", () => {
    const entries = getAllKnowledgeBundles().flatMap((bundle) =>
      collectEntries(bundle),
    );
    const ids = entries.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.source).toBe("canonical-kb");
      expect(entry.domain).toMatch(/^(marketing|app)$/);
      expect(entry.audience).toMatch(/^(public|authenticated)$/);
      expect(entry.id).toMatch(new RegExp(`^${entry.domain}\\.`));
      expect(Array.isArray(entry.consumers)).toBe(true);
      expect(entry.consumers).not.toHaveLength(0);

      if (entry.audience === "public") {
        expect(entry.consumers).not.toContain("app-help");
        expect(entry.consumers).not.toContain("app-ui");
        expect(entry.consumers).not.toContain("app-support");
      }

      if (entry.audience === "authenticated") {
        expect(entry.consumers).not.toContain("marketing-pages");
        expect(entry.consumers).not.toContain("marketing-email");
        expect(entry.consumers).not.toContain("marketing-automation");
      }
    }
  });

  it("keeps public signup CTAs consistent with full-app trial access", () => {
    const publicCtaText = [
      marketingKnowledgeBundle.ctas.publicSignup.text,
      marketingKnowledgeBundle.ctas.publicSignup.message ?? "",
    ].join(" ");

    expect(publicCtaText.toLowerCase()).toContain("free trial");
    expect(publicCtaText.toLowerCase()).toContain("choose a plan later");
    expect(publicCtaText.toLowerCase()).not.toContain("checkout");
    expect(marketingKnowledgeBundle.planFeatures.starter[0]).toContain(
      `Full-app ${TRIAL_DURATION_DAYS}-day free trial`,
    );
    expect(marketingKnowledgeBundle.planFeatures.pro[0]).toContain(
      `Full-app ${TRIAL_DURATION_DAYS}-day free trial`,
    );
  });

  it("exposes canonical pricing, competitors, and app guidance", () => {
    expect(marketingKnowledgeBundle.pricing.plans.starter.price).toBe(
      PLAN_PRICING.starter.price,
    );
    expect(marketingKnowledgeBundle.competitors).toHaveLength(10);
    expect(appHelpKnowledgeBundle.helpControls.length).toBeGreaterThan(20);
    expect(appHelpKnowledgeBundle.helpTopics.length).toBeGreaterThan(5);
  });

  it("provides lookup and adapter helpers from canonical data", () => {
    expect(getHelpControl("guests-import")?.body).toContain("CSV");
    expect(getHelpTopic("website")?.route).toBe("/website");
    expect(getTourDefinition("dashboard")?.steps.length).toBeGreaterThan(5);
    expect(getHelpControl("missing")).toBeNull();
    expect(getHelpTopic("missing")).toBeNull();
    expect(getTourDefinition("missing")).toBeNull();
    expect(toMarketingFaqItems()[0]).toMatchObject({
      q: "What is Kaiplan?",
    });
  });

  it("canonizes public brand, lead magnets, capture, email, and pricing copy", () => {
    expect(productIdentity).toMatchObject({
      name: "Kaiplan",
      domain: "kaiplan.app",
      contactEmail: "hello@kaiplan.app",
    });
    expect(leadMagnetKnowledge).toHaveLength(16);
    expect(leadMagnetKnowledge[0]).toMatchObject({
      slug: "budget-template",
      publicPath: "/free/budget-template",
      nurtureSequenceId: "kaiplan-lead-magnet-nurture",
    });
    expect(marketingCaptureDefaults.emailLabel).toBe("Email address");
    expect(marketingCaptureDefaults.placeholder).toBe("your@email.com");
    expect(marketingCaptureDefaults.footerPlaceholder).toBe("your@inbox.com");
    expect(marketingEmailCopy.confirmation.primaryCtaLabel).toBe(
      "Take the 30-second survey",
    );
    expect(marketingEmailCopy.confirmation.positionPrefix).toBe(
      "Your signup position is",
    );
    expect(unsubscribeCopy.linkLabel).toBe("Unsubscribe");
    expect(publicPlanLabels.starter).toBe("Starter");
    expect(publicPlanFeatures.pro).toContain("Vendor contact tracker");
    expect(publicSiteCopy.pricingTrialBannerText).toContain("full app access");
    expect(publicSiteCopy.pricingTrialBannerText.toLowerCase()).toContain(
      "choose a plan later",
    );
    expect(publicSiteCopy.pricingTrialBannerText.toLowerCase()).not.toContain(
      "launch",
    );
    expect(publicSiteCopy.pricingTrialBannerText.toLowerCase()).not.toContain(
      "card required",
    );
    expect(publicSiteCopy.funnelBenefitBullets).toContain(
      "No vendor ads or paid placements",
    );
    expect(Object.keys(kaiplanPricingFacts)).toEqual([
      "plans",
      "lifetimePriceLabel",
    ]);
    expect(kaiplanPricingFacts.lifetimePriceLabel).toBe("$100 lifetime");
    expect(kaiplanPricingFacts.plans.starter).not.toHaveProperty(
      "originalPrice",
    );
    expect(kaiplanPricingFacts.plans.pro).not.toHaveProperty(
      "originalAnnualPrice",
    );
    expect(JSON.stringify(kaiplanPricingFacts).toLowerCase()).not.toContain(
      "launch",
    );
  });

  it("requires every public lead magnet to use the shared Sequencer nurture sequence", () => {
    for (const leadMagnet of leadMagnetKnowledge) {
      expect(leadMagnet.id).toBe(`marketing.lead-magnet.${leadMagnet.slug}`);
      expect(leadMagnet.audience).toBe("public");
      expect(leadMagnet.consumers).toContain("marketing-pages");
      expect(leadMagnet.title).not.toHaveLength(0);
      expect(leadMagnet.description).not.toHaveLength(0);
      expect(leadMagnet.publicPath).toBe(`/free/${leadMagnet.slug}`);
      expect(leadMagnet.nurtureSequenceId).toBe("kaiplan-lead-magnet-nurture");
    }
  });

  it("includes reusable public-safe email copy in the marketing bundle", () => {
    expect(marketingKnowledgeBundle.leadMagnets).toBe(leadMagnetKnowledge);
    expect(marketingKnowledgeBundle.captureDefaults).toBe(
      marketingCaptureDefaults,
    );
    expect(marketingKnowledgeBundle.emailCopy).toBe(marketingEmailCopy);
    expect(marketingKnowledgeBundle.unsubscribeCopy).toBe(unsubscribeCopy);
  });
});

describe("kaiplanOffering", () => {
  it("has a plan entry for every PricingTier", () => {
    for (const tier of PRICING_TIERS) {
      expect(kaiplanOffering.plans).toHaveProperty(tier);
    }
  });

  it("every plan has required copy fields", () => {
    for (const [, plan] of Object.entries(kaiplanOffering.plans)) {
      expect(typeof plan.bestFor).toBe("string");
      expect(typeof plan.description).toBe("string");
      expect(typeof plan.shortDescription).toBe("string");
      expect(typeof plan.ctaTextMarketing).toBe("string");
      expect(typeof plan.ctaTextHomepage).toBe("string");
      expect(typeof plan.ctaTextApp).toBe("string");
      expect(Array.isArray(plan.features)).toBe(true);
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });

  it("has a featureMatrix with all expected feature IDs", () => {
    const ids = kaiplanOffering.featureMatrix.map((row) => row.id);
    expect(kaiplanOffering.featureMatrix).toHaveLength(9);
    expect(ids).toContain("budget-ledger");
    expect(ids).toContain("vendor-tracker");
    expect(ids).toContain("billing");
    const vendorRow = kaiplanOffering.featureMatrix.find(
      (r) => r.id === "vendor-tracker",
    );
    expect(vendorRow?.availability.starter).toBeNull();
    expect(vendorRow?.availability.pro).toBe("Included");
    const roleRow = kaiplanOffering.featureMatrix.find(
      (r) => r.id === "role-access",
    );
    expect(roleRow?.availability.starter).toBeNull();
    const websiteRow = kaiplanOffering.featureMatrix.find(
      (r) => r.id === "wedding-website",
    );
    expect(websiteRow?.availability.starter).toBeNull();
  });

  it("has featureChapters for all 6 features", () => {
    const keys = Object.keys(kaiplanOffering.featureChapters);
    expect(keys).toHaveLength(6);
    expect(keys).toContain("budget-ledger");
    expect(keys).toContain("vendor-tracker");
    expect(keys).toContain("wedding-website");
    for (const [, chapter] of Object.entries(kaiplanOffering.featureChapters)) {
      expect(typeof chapter.eyebrow).toBe("string");
      expect(typeof chapter.numeral).toBe("string");
      expect(typeof chapter.title).toBe("string");
      expect(typeof chapter.body).toBe("string");
      expect(chapter.whatItDoes.length).toBeGreaterThan(0);
    }
  });

  it("has 6 planFaqs and 8 homepageFaqs", () => {
    expect(kaiplanOffering.planFaqs).toHaveLength(6);
    expect(kaiplanOffering.homepageFaqs).toHaveLength(8);
  });

  it("offering copy fields derive from shared pricing", () => {
    expect(kaiplanOffering.plans.starter.price).toBe(
      PLAN_PRICING.starter.price,
    );
    expect(kaiplanOffering.plans.lifetime.pricingModel).toBe("one-time");
    expect(kaiplanOffering.plans.starter.highlighted).toBe(false);
    expect(kaiplanOffering.plans.pro.highlighted).toBe(true);
    expect(kaiplanOffering.plans.lifetime.monthlyPriceCents).toBeUndefined();
    expect(typeof kaiplanOffering.plans.lifetime.oneTimePriceCents).toBe(
      "number",
    );
    expect(kaiplanOffering.plans.starter.monthlyPriceCents).toBeGreaterThan(0);
  });

  it("offering is public-safe (no secrets or internal paths)", () => {
    const unsafe = findUnsafeKnowledgeStrings(kaiplanOffering);
    expect(unsafe).toEqual([]);
  });

  it("marketingKnowledgeBundle includes offering", () => {
    expect(marketingKnowledgeBundle).toHaveProperty("offering");
  });
});
