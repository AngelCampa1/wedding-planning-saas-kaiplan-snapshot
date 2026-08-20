import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { leadMagnetMetadata } from "@kaiplan/marketing-api";
import {
  marketingCompetitors,
  marketingCtas,
  kaiplanPricingFacts,
  publicPlanFeatures,
  publicSiteCopy,
  toMarketingFaqItems,
} from "@kaiplan/knowledge/marketing";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import { describe, expect, it } from "vitest";
import { PUBLIC_APP_ORIGIN } from "../lib/app-links";
import { siteConfig } from "./site";

const { plans: PLAN_PRICING } = kaiplanPricingFacts;

const configDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(configDir, "..", "..", "public");
const ogImagePath = join(
  publicDir,
  siteConfig.defaultOgImage.replace(/^\//, ""),
);
const leadMagnetsDir = join(publicDir, "lead-magnets");

interface LeadMagnetManifestEntry {
  slug: string;
  title: string;
  pdfPath: string;
  pdfSha256: string;
  byteSize: number;
  pageCount: number;
}

function countPdfPages(pdf: Buffer): number {
  const matches = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g);
  return matches?.length ?? 0;
}

describe("kaiplan site config", () => {
  it("consumes canonical marketing KB facts instead of local duplicates", () => {
    expect(siteConfig.competitors).toEqual(
      marketingCompetitors.map(({ slug, name, pricing, weakness }) => ({
        slug,
        name,
        pricing,
        weakness,
      })),
    );
    expect(siteConfig.funnel.tofu.ctaText).toBe(marketingCtas.tofu.text);
    expect(siteConfig.funnel.mofu.ctaTarget).toBe(marketingCtas.mofu.target);
    expect(siteConfig.faqs).toEqual(toMarketingFaqItems());
    expect(siteConfig.metaDescription).toBe(publicSiteCopy.metaDescription);
    expect(siteConfig.funnel.ctaSubtitle).toBe(publicSiteCopy.checkoutSubtitle);
    expect(siteConfig.heroBenefits).toEqual(publicSiteCopy.heroBenefits);
    expect(siteConfig.pricingConfig.trialBannerText).toBe(
      publicSiteCopy.pricingTrialBannerText,
    );
    expect(siteConfig.copy.homepage.proofBody).toBe(
      publicSiteCopy.homepageProofBody,
    );
    expect(siteConfig.copy.funnelCta.benefitBullets).toEqual(
      publicSiteCopy.funnelBenefitBullets,
    );
  });

  it("keeps the homepage metadata inside the SEO validator range", () => {
    expect(siteConfig.metaDescription.length).toBeGreaterThanOrEqual(150);
    expect(siteConfig.metaDescription.length).toBeLessThanOrEqual(160);
  });

  it("references a real default OpenGraph image", () => {
    expect(siteConfig.defaultOgImage).toBe("/og-default.png");
    expect(existsSync(ogImagePath)).toBe(true);
  });

  it("preserves the paid-by-couples positioning and plan ladder", () => {
    expect(siteConfig.product.trustSignals[0]?.text).toContain(
      "No vendor advertising",
    );
    expect(siteConfig.pricingTiers.map((tier) => tier.name)).toEqual([
      "Starter",
      "Pro",
      "Lifetime",
    ]);
  });

  it("uses standard shared pricing for all paid tiers", () => {
    const tiersByName = new Map(
      siteConfig.pricingTiers.map((tier) => [tier.name, tier]),
    );
    expect(tiersByName.get("Starter")).toMatchObject({
      price: PLAN_PRICING.starter.price,
      annualPriceOverride: PLAN_PRICING.starter.annualPrice,
    });
    expect(tiersByName.get("Pro")).toMatchObject({
      price: PLAN_PRICING.pro.price,
      annualPriceOverride: PLAN_PRICING.pro.annualPrice,
    });
    expect(tiersByName.get("Lifetime")).toMatchObject({
      price: PLAN_PRICING.lifetime.price,
    });
  });

  it("announces the free trial without removed offer copy", () => {
    const banner = siteConfig.pricingConfig.trialBannerText.toLowerCase();
    expect(banner).toContain(`${TRIAL_DURATION_DAYS}-day`);
    expect(banner).toContain("full app access");
    expect(banner).toContain("choose a plan later");
    expect(banner).not.toContain("card required");
    expect(banner).not.toContain("automatic charge");
    expect(banner).not.toContain("launch");
    expect(banner).not.toContain("promo");
  });

  it("leads Starter and Pro feature lists with the shared full-app trial", () => {
    const tiersByName = new Map(
      siteConfig.pricingTiers.map((tier) => [tier.name, tier]),
    );
    expect(tiersByName.get("Starter")?.features[0]).toBe(
      `Full-app ${TRIAL_DURATION_DAYS}-day free trial`,
    );
    expect(tiersByName.get("Starter")?.features).toEqual(
      publicPlanFeatures.starter,
    );
    expect(tiersByName.get("Pro")?.features[0]).toBe(
      `Full-app ${TRIAL_DURATION_DAYS}-day free trial`,
    );
    expect(tiersByName.get("Pro")?.features).toEqual(publicPlanFeatures.pro);
    const lifetimeFeatures = tiersByName.get("Lifetime")?.features ?? [];
    expect(lifetimeFeatures).toEqual(publicPlanFeatures.lifetime);
    expect(lifetimeFeatures.some((feature) => /trial/i.test(feature))).toBe(
      false,
    );
  });

  it("attributes the 74% budget stat to Zola First Look 2025, not NerdWallet", () => {
    const stat74 = siteConfig.socialProof.find((item) => item.value === "74%");
    expect(stat74).toBeDefined();
    expect(stat74?.label).toContain("Zola");
    expect(stat74?.label).not.toContain("NerdWallet");
  });

  it("includes wedding milestone checklist as a feature in Starter and Pro tiers", () => {
    const tiersByName = new Map(
      siteConfig.pricingTiers.map((tier) => [tier.name, tier]),
    );
    const starterFeatures = tiersByName.get("Starter")?.features ?? [];
    const proFeatures = tiersByName.get("Pro")?.features ?? [];
    expect(starterFeatures.some((f) => /checklist/i.test(f))).toBe(true);
    expect(proFeatures.some((f) => /checklist/i.test(f))).toBe(true);
  });

  it("includes checklist in heroBenefits", () => {
    expect(siteConfig.heroBenefits?.some((b) => /checklist/i.test(b))).toBe(
      true,
    );
  });

  it("Pro tier features describe role-based access instead of the old planner count copy", () => {
    const tiersByName = new Map(
      siteConfig.pricingTiers.map((tier) => [tier.name, tier]),
    );
    const proFeatures = tiersByName.get("Pro")?.features ?? [];
    expect(
      proFeatures.some(
        (f) => /role-based/i.test(f) || /owner.*editor.*viewer/i.test(f),
      ),
    ).toBe(true);
    expect(proFeatures.some((f) => /2 planners/i.test(f))).toBe(false);
  });

  it("Lifetime tier features mention archive after the wedding", () => {
    const tiersByName = new Map(
      siteConfig.pricingTiers.map((tier) => [tier.name, tier]),
    );
    const lifetimeFeatures = tiersByName.get("Lifetime")?.features ?? [];
    expect(lifetimeFeatures.some((f) => /archive/i.test(f))).toBe(true);
  });

  it("keeps the pricing CTA and wedding planning survey structure intact", () => {
    expect(siteConfig.funnel.bofu.ctaText).toBe("Start planning");
    expect(siteConfig.funnel.bofu.ctaTarget).toBe(
      `${PUBLIC_APP_ORIGIN}/signup`,
    );
    expect(siteConfig.copy.funnelCta?.benefitBullets).toContain(
      `${PLAN_PRICING.starter.price}, or ${PLAN_PRICING.lifetime.price.replace(" once", " lifetime")}`,
    );
    expect(siteConfig.survey.questions.map((question) => question.id)).toEqual([
      "planner",
      "current_tool",
      "pain",
    ]);
  });

  it("nav contains expected top-level items including sign in", () => {
    const navLabels = siteConfig.nav.items.map((item) => item.label);
    expect(navLabels).toContain("Features");
    expect(navLabels).toContain("Resources");
    expect(navLabels).toContain("Pricing");
    expect(navLabels).toContain("Compare");
    expect(navLabels).toContain("Sign in");
    expect(navLabels).not.toContain("Help");
    expect(navLabels).not.toContain("How it works");
    expect(siteConfig.nav.items).toContainEqual({
      label: "Sign in",
      href: `${PUBLIC_APP_ORIGIN}/login`,
    });
    expect(
      siteConfig.footer.linkGroups
        .flatMap((group) => group.links)
        .some(
          (link) => link.label === "Product Help" && link.href === "/help/",
        ),
    ).toBe(true);
  });

  it("offers only lead magnets with content, manifest entries, and Sequencer metadata", () => {
    const manifest = JSON.parse(
      readFileSync(join(leadMagnetsDir, "manifest.json"), "utf8"),
    ) as { entries: LeadMagnetManifestEntry[] };
    const manifestBySlug = new Map(
      manifest.entries.map((entry) => [entry.slug, entry]),
    );

    const contentSlugs = readdirSync(
      join(configDir, "..", "content", "lead-magnets"),
    )
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, ""))
      .sort();
    const promotedSlugs = (siteConfig.leadMagnetOptions ?? [])
      .map((option) => option.slug)
      .sort();
    const metadataSlugs = Object.keys(leadMagnetMetadata).sort();

    expect(siteConfig.leadMagnetOptions).toHaveLength(16);
    expect(promotedSlugs).toEqual(contentSlugs);
    expect(promotedSlugs).toEqual(metadataSlugs);
    const primarySlug = siteConfig.leadMagnet?.slug;
    expect(primarySlug).toBe("budget-template");
    expect(promotedSlugs).toContain(primarySlug);

    for (const option of siteConfig.leadMagnetOptions ?? []) {
      expect(option.slug).toBeTruthy();
      const manifestEntry = manifestBySlug.get(option.slug!);
      expect(manifestEntry).toBeDefined();
      expect(option.title).toBe(manifestEntry!.title);
      expect(option.title).toBe(leadMagnetMetadata[option.slug!]?.title);
      expect(leadMagnetMetadata[option.slug!]?.nurtureSequenceId).toBeTruthy();
      expect(manifestEntry!.pdfPath).toBe(`/lead-magnets/${option.slug}.pdf`);
      expect(manifestEntry!.byteSize).toBeGreaterThan(100_000);
      expect(manifestEntry!.pageCount).toBeGreaterThanOrEqual(4);
      expect(manifestEntry!.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
      const contentPath = join(
        configDir,
        "..",
        "content",
        "lead-magnets",
        `${option.slug}.md`,
      );
      const markdown = readFileSync(contentPath, "utf8");
      expect(markdown.trim().length).toBeGreaterThan(500);

      const pdfPath = join(
        publicDir,
        manifestEntry!.pdfPath.replace(/^\//, ""),
      );
      if (existsSync(pdfPath)) {
        const pdf = readFileSync(pdfPath);
        expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
        expect(pdf.byteLength).toBe(manifestEntry!.byteSize);
        expect(countPdfPages(pdf)).toBe(manifestEntry!.pageCount);
        expect(createHash("sha256").update(pdf).digest("hex")).toBe(
          manifestEntry!.pdfSha256,
        );
      }
    }
  });
});
