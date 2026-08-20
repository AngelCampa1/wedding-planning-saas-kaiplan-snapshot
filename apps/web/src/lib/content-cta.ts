import type { BuyerStage, SiteConfig } from "@kaiplan/marketing";
import type { DecisionCtaCardProps } from "@kaiplan/marketing/types";
import { publicSiteCopy } from "@kaiplan/knowledge/marketing";
import { kaiplanOffering } from "@kaiplan/knowledge";
import { buildAppSignupUrl } from "./app-links";
import { resolveKaiplanCta, type KaiplanPageFamily } from "./homepage-cro";

type ContentPageFamily = Exclude<KaiplanPageFamily, "home">;

interface BuildKaiplanContentCtaOptions {
  pageFamily: ContentPageFamily;
  buyerStage: BuyerStage;
  placement: string;
  currentPath?: string;
}

const PRIMARY_PRICING_CTA = {
  tofu: {
    text: "Go straight to plan pricing",
    target: "/#pricing",
  },
  mofu: {
    text: "Start free trial",
    target: "/#pricing",
  },
  bofu: {
    text: "Start planning with Kaiplan",
    target: buildAppSignupUrl(),
  },
} as const;

function buildBullets(): string[] {
  const starterPrice = kaiplanOffering.plans.starter.price;
  const lifetimeLabel = kaiplanOffering.copy.lifetimePriceLabel;

  return [
    `Starts at ${starterPrice}`,
    `Includes ${lifetimeLabel}`,
    publicSiteCopy.funnelBenefitBullets[1],
    publicSiteCopy.trustSignals.connectedPlanning,
  ];
}

function buildHeading(
  pageFamily: ContentPageFamily,
  buyerStage: BuyerStage,
): string {
  if (buyerStage === "tofu") {
    return "If this guide exposed the gap in your current planning stack, take the next step.";
  }

  if (pageFamily === "alternatives" && buyerStage === "bofu") {
    return "If you are done comparing, create your account and start the full app trial.";
  }

  return "If this comparison already ruled out the tools you do not want, start the trial and decide on billing later.";
}

function buildSubtext(
  config: Pick<SiteConfig, "name" | "product" | "pricingTiers">,
  buyerStage: BuyerStage,
): string {
  const starterPrice = kaiplanOffering.plans.starter.price;
  const lifetimeLabel = kaiplanOffering.copy.lifetimePriceLabel;

  if (buyerStage === "tofu") {
    return `${config.name} gives couples one paid planning workspace when spreadsheets and marketplace tools stop being enough. Start with the pricing path, or jump straight to plan pricing if you are already there.`;
  }

  if (buyerStage === "bofu") {
    return `${config.name} starts at ${starterPrice}, with ${lifetimeLabel} if you would rather pay once for the engagement instead of carrying another recurring tool.`;
  }

  return `${config.name} starts at ${starterPrice}, with ${lifetimeLabel}. If this page already narrowed the field, move from evaluation into a full app trial and choose billing later.`;
}

function buildPrimaryCta(
  pageFamily: ContentPageFamily,
  buyerStage: BuyerStage,
  currentPath?: string,
): DecisionCtaCardProps["primaryCta"] {
  if (buyerStage === "tofu") {
    const cta = resolveKaiplanCta(pageFamily, "tofu");
    if (cta.href === currentPath) {
      return PRIMARY_PRICING_CTA.tofu;
    }

    return {
      text: cta.text,
      target: cta.href,
    };
  }

  return PRIMARY_PRICING_CTA[buyerStage];
}

function buildSecondaryCta(
  pageFamily: ContentPageFamily,
  buyerStage: BuyerStage,
  currentPath?: string,
): DecisionCtaCardProps["secondaryCta"] {
  if (buyerStage === "tofu") {
    const primaryCta = resolveKaiplanCta(pageFamily, "tofu");

    if (primaryCta.href === currentPath) {
      const fallbackCta = resolveKaiplanCta(pageFamily, "bofu");
      return {
        text: fallbackCta.text,
        target: fallbackCta.href,
      };
    }

    return PRIMARY_PRICING_CTA.tofu;
  }

  const followUpStage = buyerStage === "mofu" ? "bofu" : "mofu";
  const cta = resolveKaiplanCta(pageFamily, followUpStage);

  return {
    text: cta.text,
    target: cta.href,
  };
}

export function buildKaiplanContentCta(
  config: Pick<SiteConfig, "name" | "product" | "pricingTiers">,
  options: BuildKaiplanContentCtaOptions,
): DecisionCtaCardProps {
  return {
    heading: buildHeading(options.pageFamily, options.buyerStage),
    subtext: buildSubtext(config, options.buyerStage),
    bullets: buildBullets(),
    primaryCta: buildPrimaryCta(
      options.pageFamily,
      options.buyerStage,
      options.currentPath,
    ),
    secondaryCta: buildSecondaryCta(
      options.pageFamily,
      options.buyerStage,
      options.currentPath,
    ),
    analytics: {
      pageFamily: options.pageFamily,
      buyerStage: options.buyerStage,
      placement: options.placement,
      intent:
        options.buyerStage === "tofu"
          ? "educate"
          : options.buyerStage === "mofu"
            ? "evaluate"
            : "convert",
    },
  };
}
