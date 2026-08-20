import type {
  BuyerStage,
  FaqItem,
  PricingTier,
  SiteConfig,
} from "@kaiplan/marketing";
import { publicSiteCopy } from "@kaiplan/knowledge/marketing";
import { kaiplanOffering } from "@kaiplan/knowledge";
import { buildAppSignupUrl } from "./app-links";
import {
  buildScreenshotGalleryProps,
  type ScreenshotGalleryProps,
} from "./screenshot-gallery";
import type { ScreenshotEntry } from "../config/site";

export type KaiplanPageFamily =
  | "home"
  | "guides"
  | "listicles"
  | "comparisons"
  | "pricing-breakdowns"
  | "alternatives";

interface KaiplanCtaDefinition {
  text: string;
  href: string;
  label: string;
}

export interface ResolvedKaiplanCta extends KaiplanCtaDefinition {
  buyerStage: BuyerStage;
  pageFamily: KaiplanPageFamily;
}

export interface HomepageCta {
  text: string;
  target: string;
}

export interface HomepageObjectionBlock {
  id: "vendor-bias" | "tool-fragmentation" | "pricing-fit";
  title: string;
  body: string;
  payoff: string;
  cta: ResolvedKaiplanCta;
}

interface HomepageHero {
  headline: string;
  subheadline: string;
  trustSignal: string;
  benefits: string[];
  primaryCta: HomepageCta;
  secondaryCta: HomepageCta;
}

interface HomepageWhyPaySection {
  heading: string;
  intro: string;
  blocks: HomepageObjectionBlock[];
}

interface HomepagePricingSection {
  heading: string;
  intro: string;
  helperText: string;
  socialProofText: string;
  tiers: HomepagePricingTier[];
}

interface HomepagePricingTier extends PricingTier {
  ctaTarget: string;
}

interface HomepageFaqSection {
  heading: string;
  items: FaqItem[];
  bottomCtaHeading: string;
  bottomCtaText: string;
  bottomCtaTarget: string;
}

export interface KaiplanHomepageData {
  hero: HomepageHero;
  whyPay: HomepageWhyPaySection;
  screenshotGallery: ScreenshotGalleryProps;
  pricing: HomepagePricingSection;
  faq: HomepageFaqSection;
  stickyCta: HomepageCta & { subtitle: string };
}

const CTA_MATRIX = {
  home: {
    tofu: {
      text: "See why couples switch",
      href: "#why-pay",
      label: "Homepage why pay section",
    },
    mofu: {
      text: "Start free trial",
      href: "#pricing",
      label: "Homepage pricing",
    },
    bofu: {
      text: "Start free trial",
      href: "#pricing",
      label: "Homepage pricing",
    },
  },
  guides: {
    tofu: {
      text: "See what paid planning software costs",
      href: "/resources/guides/wedding-planning-software-pricing-guide/",
      label: "Pricing guide",
    },
    mofu: {
      text: "Compare free and paid planning tools",
      href: "/compare/pricing/free-vs-paid-wedding-apps/",
      label: "Free vs paid wedding apps",
    },
    bofu: {
      text: "See the no-ad alternative",
      href: "/compare/alternatives/the-knot/",
      label: "The Knot alternative",
    },
  },
  listicles: {
    tofu: {
      text: "See ad-free tools first",
      href: "/resources/best/best-ad-free-wedding-planning-tools/",
      label: "Ad-free tool list",
    },
    mofu: {
      text: "See ad-free paid planning tools",
      href: "/resources/best/best-ad-free-wedding-planning-tools/",
      label: "Ad-free tool list",
    },
    bofu: {
      text: "See the paid alternative",
      href: "/compare/alternatives/the-knot/",
      label: "The Knot alternative",
    },
  },
  comparisons: {
    tofu: {
      text: "See why couples outgrow stacked tools",
      href: "/resources/guides/why-couples-juggle-multiple-wedding-tools/",
      label: "Tool fragmentation guide",
    },
    mofu: {
      text: "Compare paid planning models",
      href: "/compare/versus/one-time-fee-vs-subscription-wedding-apps/",
      label: "One-time vs subscription comparison",
    },
    bofu: {
      text: "See the paid alternative",
      href: "/compare/alternatives/the-knot/",
      label: "The Knot alternative",
    },
  },
  "pricing-breakdowns": {
    tofu: {
      text: "Understand wedding software pricing",
      href: "/resources/guides/wedding-planning-software-pricing-guide/",
      label: "Pricing guide",
    },
    mofu: {
      text: "See what free tools actually cost",
      href: "/compare/pricing/free-vs-paid-wedding-apps/",
      label: "Free vs paid wedding apps",
    },
    bofu: {
      text: "See the paid alternative",
      href: "/compare/alternatives/the-knot/",
      label: "The Knot alternative",
    },
  },
  alternatives: {
    tofu: {
      text: "Learn why free platforms feel biased",
      href: "/resources/guides/wedding-planning-without-vendor-ads/",
      label: "Vendor ad guide",
    },
    mofu: {
      text: "See what free tools actually cost",
      href: "/compare/pricing/free-vs-paid-wedding-apps/",
      label: "Free vs paid wedding apps",
    },
    bofu: {
      text: "See the no-ad alternative",
      href: "/compare/alternatives/the-knot/",
      label: "The Knot alternative",
    },
  },
} satisfies Record<KaiplanPageFamily, Record<BuyerStage, KaiplanCtaDefinition>>;

type OfferingPlanKey = keyof typeof kaiplanOffering.plans;

function resolveHomepageCtaText(tierName: string): string {
  const key = tierName.toLowerCase() as OfferingPlanKey;
  const plan = kaiplanOffering.plans[key];
  if (plan) {
    return plan.ctaTextHomepage;
  }
  return `Start with ${tierName}`;
}

function buildHomepageTierCtas(
  pricingTiers: PricingTier[] | undefined,
): HomepagePricingTier[] {
  return (pricingTiers ?? []).map((tier) => ({
    ...tier,
    ctaText: resolveHomepageCtaText(tier.name),
    ctaTarget: buildAppSignupUrl(),
  }));
}

function buildHomepageFaqs(): FaqItem[] {
  return [...kaiplanOffering.homepageFaqs];
}

export function resolveKaiplanCta(
  pageFamily: KaiplanPageFamily,
  buyerStage: BuyerStage,
): ResolvedKaiplanCta {
  return {
    pageFamily,
    buyerStage,
    ...CTA_MATRIX[pageFamily][buyerStage],
  };
}

export function buildKaiplanHomepageData(
  config: Pick<
    SiteConfig,
    "name" | "domain" | "product" | "pricingTiers" | "survey"
  > & { screenshotGallery?: ScreenshotEntry[] },
): KaiplanHomepageData {
  const starterPrice = kaiplanOffering.plans.starter.price;
  const lifetimeLabel = kaiplanOffering.copy.lifetimePriceLabel;

  return {
    hero: {
      headline: "Plan the wedding in one connected workspace.",
      subheadline:
        "Kaiplan brings budget, guests, vendors, seating, and checklist planning into one calm place for couples and the people helping them plan. Pro adds your wedding website and RSVP flow.",
      trustSignal: `Paid by couples. No vendor ads or paid placements. Starts at ${starterPrice}, with ${lifetimeLabel} if you would rather pay once.`,
      benefits: [...publicSiteCopy.heroBenefits],
      primaryCta: {
        text: "Start planning",
        target: buildAppSignupUrl(),
      },
      secondaryCta: {
        text: "See how it works",
        target: "#how-it-works",
      },
    },
    whyPay: {
      heading: "What Kaiplan solves",
      intro:
        "Wedding planning gets hard when every decision changes three other lists. Kaiplan gives couples and helpers one source of truth for the work that keeps moving.",
      blocks: [
        {
          id: "vendor-bias",
          title:
            "The biggest wedding directories still make money when vendors buy visibility.",
          body: "That is why marketplace tools keep nudging you toward directories, badges, and promoted listings. The planning layer exists alongside the ad business instead of replacing it.",
          payoff:
            "A paid planning workspace can stay focused on helping you evaluate quotes and make decisions instead of monetizing vendor attention.",
          cta: resolveKaiplanCta("alternatives", "tofu"),
        },
        {
          id: "tool-fragmentation",
          title:
            "The free stack usually means a planner, a spreadsheet, and a separate guest workflow.",
          body: "That stack works at first, then quotes change, guest count shifts, and the seating plan drifts away from the budget. You spend the effort reconciling tools instead of planning the wedding.",
          payoff:
            "One connected workspace costs less than weeks spent reconciling quotes, guest counts, and seating changes.",
          cta: resolveKaiplanCta("comparisons", "tofu"),
        },
        {
          id: "pricing-fit",
          title:
            "A wedding is a finite planning project, so the pricing should fit that reality.",
          body: "Some couples want a lower monthly entry point. Others would rather pay once and never think about renewals during the engagement.",
          payoff:
            "Pick a monthly plan or pay once for lifetime access. Buy the pricing model that fits the engagement.",
          cta: resolveKaiplanCta("pricing-breakdowns", "mofu"),
        },
      ],
    },
    screenshotGallery: buildScreenshotGalleryProps(
      config.screenshotGallery ?? [],
    ),
    pricing: {
      heading: "Simple pricing for one wedding",
      intro:
        "Start with the full app trial, then decide whether monthly, annual, or Lifetime fits the engagement.",
      helperText: publicSiteCopy.pricingTrialBannerText,
      socialProofText:
        "Every plan starts from the same planning core: budget, guest list, seating, and checklist in one connected workspace.",
      tiers: buildHomepageTierCtas(config.pricingTiers),
    },
    faq: {
      heading: "Wedding planning and pricing questions",
      items: buildHomepageFaqs(),
      bottomCtaHeading: "Simple pricing for one wedding",
      bottomCtaText: "Start planning",
      bottomCtaTarget: buildAppSignupUrl(),
    },
    stickyCta: {
      text: "Start planning",
      target: buildAppSignupUrl(),
      subtitle: `${starterPrice} monthly or ${lifetimeLabel}`,
    },
  };
}
