import { describe, expect, it } from "vitest";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import {
  LIFETIME_PLAN_HINT,
  TRIAL_PLAN_HINT,
} from "../../src/lib/billing-copy";

describe("billing-copy", () => {
  it("mentions the shared full-app trial without launch promo copy", () => {
    expect(TRIAL_PLAN_HINT.toLowerCase()).toContain(
      `${TRIAL_DURATION_DAYS}-day`,
    );
    expect(TRIAL_PLAN_HINT.toLowerCase()).toContain("full app access");
    expect(TRIAL_PLAN_HINT.toLowerCase()).toContain("choose a plan later");
    expect(TRIAL_PLAN_HINT.toLowerCase()).not.toContain("launch");
    expect(TRIAL_PLAN_HINT.toLowerCase()).not.toContain("promo");
  });

  it("omits trial and launch copy from the lifetime-only hint", () => {
    expect(LIFETIME_PLAN_HINT.toLowerCase()).not.toContain("trial");
    expect(LIFETIME_PLAN_HINT.toLowerCase()).not.toContain("launch");
    expect(LIFETIME_PLAN_HINT.toLowerCase()).toContain("pay once");
    expect(LIFETIME_PLAN_HINT.toLowerCase()).toContain("no recurring charges");
  });
});
