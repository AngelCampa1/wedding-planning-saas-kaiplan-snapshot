import { describe, expect, it } from "vitest";
import { publicSiteCopy } from "@kaiplan/knowledge/marketing";
import { kaiplanOffering } from "@kaiplan/knowledge";
import { siteConfig } from "../config/site";
import { PUBLIC_APP_ORIGIN } from "./app-links";
import { buildKaiplanContentCta } from "./content-cta";

describe("buildKaiplanContentCta", () => {
  it("routes tofu guide readers to a pricing-education page first and keeps plan pricing as the secondary step", () => {
    const cta = buildKaiplanContentCta(siteConfig, {
      pageFamily: "guides",
      buyerStage: "tofu",
      placement: "mid-article",
    });

    expect(cta.heading).toBe(
      "If this guide exposed the gap in your current planning stack, take the next step.",
    );
    expect(cta.primaryCta).toEqual({
      text: "See what paid planning software costs",
      target: "/resources/guides/wedding-planning-software-pricing-guide/",
    });
    expect(cta.secondaryCta).toEqual({
      text: "Go straight to plan pricing",
      target: "/#pricing",
    });
    expect(cta.analytics).toEqual({
      pageFamily: "guides",
      buyerStage: "tofu",
      placement: "mid-article",
      intent: "educate",
    });
  });

  it("pushes mofu comparison readers toward the full app trial first", () => {
    const cta = buildKaiplanContentCta(siteConfig, {
      pageFamily: "comparisons",
      buyerStage: "mofu",
      placement: "post-table",
    });

    expect(cta.heading).toBe(
      "If this comparison already ruled out the tools you do not want, start the trial and decide on billing later.",
    );
    expect(cta.primaryCta).toEqual({
      text: "Start free trial",
      target: "/#pricing",
    });
    expect(cta.secondaryCta).toEqual({
      text: "See the paid alternative",
      target: "/compare/alternatives/the-knot/",
    });
    expect(cta.analytics).toEqual({
      pageFamily: "comparisons",
      buyerStage: "mofu",
      placement: "post-table",
      intent: "evaluate",
    });
  });

  it("treats bofu alternatives pages as direct signup surfaces", () => {
    const cta = buildKaiplanContentCta(siteConfig, {
      pageFamily: "alternatives",
      buyerStage: "bofu",
      placement: "post-table",
    });

    expect(cta.heading).toBe(
      "If you are done comparing, create your account and start the full app trial.",
    );
    expect(cta.primaryCta).toEqual({
      text: "Start planning with Kaiplan",
      target: `${PUBLIC_APP_ORIGIN}/signup`,
    });
    expect(cta.secondaryCta).toEqual({
      text: "See what free tools actually cost",
      target: "/compare/pricing/free-vs-paid-wedding-apps/",
    });
    expect(cta.analytics).toEqual({
      pageFamily: "alternatives",
      buyerStage: "bofu",
      placement: "post-table",
      intent: "convert",
    });
  });

  it("always uses the canonical offering price regardless of config tier overrides", () => {
    const cta = buildKaiplanContentCta(
      {
        ...siteConfig,
        pricingTiers: [
          {
            name: "Essentials",
            price: "$29/mo",
            features: ["Budget ledger"],
          },
        ],
      },
      {
        pageFamily: "pricing-breakdowns",
        buyerStage: "mofu",
        placement: "post-summary",
      },
    );

    expect(cta.bullets).toContain(
      `Starts at ${kaiplanOffering.plans.starter.price}`,
    );
    expect(cta.bullets).toContain(
      `Includes ${kaiplanOffering.copy.lifetimePriceLabel}`,
    );
    expect(cta.bullets).toContain(
      publicSiteCopy.trustSignals.connectedPlanning,
    );
    expect(cta.bullets).toContain(publicSiteCopy.funnelBenefitBullets[1]);
  });

  it("avoids self-linking when the current guide is already the pricing-education destination", () => {
    const cta = buildKaiplanContentCta(siteConfig, {
      pageFamily: "guides",
      buyerStage: "tofu",
      placement: "mid-article",
      currentPath: "/resources/guides/wedding-planning-software-pricing-guide/",
    });

    expect(cta.primaryCta).toEqual({
      text: "Go straight to plan pricing",
      target: "/#pricing",
    });
    expect(cta.secondaryCta).toEqual({
      text: "See the no-ad alternative",
      target: "/compare/alternatives/the-knot/",
    });
  });
});
