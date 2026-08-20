import { describe, expect, it } from "vitest";

import {
  findPricingIntentTierFromSearch,
  getPricingIntentTierFromHref,
} from "./pricing-intent";

const tiers = [{ name: "Starter" }, { name: "Center" }, { name: "Enterprise" }];

describe("pricing-intent", () => {
  describe("getPricingIntentTierFromHref", () => {
    it("returns the plan query param when present", () => {
      expect(getPricingIntentTierFromHref("/?plan=center#pricing")).toBe(
        "center",
      );
    });

    it("returns undefined when the plan query param is whitespace", () => {
      expect(
        getPricingIntentTierFromHref("/?plan=%20%20#pricing"),
      ).toBeUndefined();
    });

    it("returns undefined when the href has no plan query param", () => {
      expect(getPricingIntentTierFromHref("/#pricing")).toBeUndefined();
    });

    it("supports absolute urls", () => {
      expect(
        getPricingIntentTierFromHref(
          "https://pebbledesk.app/?plan=enterprise#pricing",
        ),
      ).toBe("enterprise");
    });
  });

  describe("findPricingIntentTierFromSearch", () => {
    it("matches tier names case-insensitively from the search string", () => {
      expect(findPricingIntentTierFromSearch("?plan=center", tiers)).toBe(
        "Center",
      );
    });

    it("matches tier names when the search string omits the leading question mark", () => {
      expect(findPricingIntentTierFromSearch("plan=center", tiers)).toBe(
        "Center",
      );
    });

    it("returns undefined when the plan query param is whitespace", () => {
      expect(findPricingIntentTierFromSearch("?plan=%20%20", tiers)).toBeUndefined();
    });

    it("returns undefined when the plan param does not match any tier", () => {
      expect(
        findPricingIntentTierFromSearch("?plan=unknown", tiers),
      ).toBeUndefined();
    });

    it("returns undefined when the search string has no plan param", () => {
      expect(findPricingIntentTierFromSearch("", tiers)).toBeUndefined();
    });
  });
});
