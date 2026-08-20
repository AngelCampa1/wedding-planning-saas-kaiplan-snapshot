import { describe, expect, it } from "vitest";
import * as pricingModule from "../src/pricing";
import { PLAN_PRICING, getPlanPricing } from "../src/pricing";

describe("PLAN_PRICING plan prices", () => {
  it("exports standard monthly and annual plan prices", () => {
    expect(PLAN_PRICING.starter).toMatchObject({
      plan: "starter",
      name: "Starter",
      price: "$20/mo",
      annualPrice: "$200/yr",
      monthlyPriceCents: 2000,
      annualPriceCents: 20000,
      pricingModel: "subscription",
    });
    expect(PLAN_PRICING.pro).toMatchObject({
      plan: "pro",
      name: "Pro",
      price: "$35/mo",
      annualPrice: "$350/yr",
      monthlyPriceCents: 3500,
      annualPriceCents: 35000,
      pricingModel: "subscription",
    });
  });

  it("exports standard lifetime pricing", () => {
    expect(getPlanPricing("lifetime")).toMatchObject({
      plan: "lifetime",
      name: "Lifetime",
      price: "$100 once",
      annualPrice: undefined,
      oneTimePriceCents: 10000,
      pricingModel: "one-time",
    });
  });

  it("does not export removed offer constants", () => {
    expect(Object.keys(pricingModule)).toEqual([
      "PLAN_PRICING",
      "getPlanPricing",
    ]);
  });
});

describe("getPlanPricing", () => {
  it("returns the starter plan", () => {
    expect(getPlanPricing("starter")).toMatchObject({
      plan: "starter",
      name: "Starter",
    });
  });
});
