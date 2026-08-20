import { describe, expect, it } from "vitest";
import {
  buildPathWithPlan,
  buildPlanSearch,
  isBillingInterval,
  isCheckoutStatus,
  isPaidBillingPlan,
  readPlanSearch,
} from "../../src/lib/plan-handoff";

describe("plan-handoff helpers", () => {
  it("normalizes plan search values", () => {
    expect(readPlanSearch(undefined)).toEqual({});
    expect(readPlanSearch({ plan: "starter" })).toEqual({
      plan: "starter",
    });
    expect(readPlanSearch({ plan: "pro", checkout: "cancel" })).toEqual({
      plan: "pro",
      checkout: "cancel",
    });
    expect(readPlanSearch({ plan: "free" })).toEqual({});
    expect(readPlanSearch({ plan: "anything-else" })).toEqual({});
    expect(readPlanSearch({ checkout: "later" })).toEqual({});
  });

  it("normalizes interval in plan search values", () => {
    expect(readPlanSearch({ plan: "starter", interval: "year" })).toEqual({
      plan: "starter",
      interval: "year",
    });
    expect(readPlanSearch({ plan: "pro", interval: "month" })).toEqual({
      plan: "pro",
      interval: "month",
    });
    expect(readPlanSearch({ plan: "starter", interval: "quarterly" })).toEqual({
      plan: "starter",
    });
    expect(readPlanSearch({ interval: "year" })).toEqual({
      interval: "year",
    });
  });

  it("builds search objects and paths for preserved plans", () => {
    expect(buildPlanSearch("pro")).toEqual({ plan: "pro" });
    expect(buildPlanSearch(undefined)).toBeUndefined();
    expect(buildPathWithPlan("/settings", "lifetime")).toBe(
      "/settings?plan=lifetime",
    );
    expect(buildPathWithPlan("/dashboard", undefined)).toBe("/dashboard");
  });

  it("includes interval in buildPlanSearch when provided", () => {
    expect(buildPlanSearch("pro", "year")).toEqual({
      plan: "pro",
      interval: "year",
    });
    expect(buildPlanSearch("starter", "month")).toEqual({
      plan: "starter",
      interval: "month",
    });
    expect(buildPlanSearch("lifetime", "year")).toEqual({
      plan: "lifetime",
      interval: "year",
    });
    expect(buildPlanSearch(undefined, "year")).toBeUndefined();
  });

  it("includes interval in buildPathWithPlan when provided", () => {
    expect(buildPathWithPlan("/onboarding", "pro", "year")).toBe(
      "/onboarding?plan=pro&interval=year",
    );
    expect(buildPathWithPlan("/onboarding", "starter", "month")).toBe(
      "/onboarding?plan=starter&interval=month",
    );
    expect(buildPathWithPlan("/onboarding", "pro")).toBe(
      "/onboarding?plan=pro",
    );
  });

  it("identifies paid plans", () => {
    expect(isPaidBillingPlan("starter")).toBe(true);
    expect(isPaidBillingPlan("free")).toBe(false);
    expect(isPaidBillingPlan(null)).toBe(false);
  });

  it("identifies supported checkout statuses", () => {
    expect(isCheckoutStatus("success")).toBe(true);
    expect(isCheckoutStatus("cancel")).toBe(true);
    expect(isCheckoutStatus("pending")).toBe(false);
    expect(isCheckoutStatus(null)).toBe(false);
  });

  it("identifies valid billing intervals", () => {
    expect(isBillingInterval("month")).toBe(true);
    expect(isBillingInterval("year")).toBe(true);
    expect(isBillingInterval("quarterly")).toBe(false);
    expect(isBillingInterval(null)).toBe(false);
    expect(isBillingInterval(undefined)).toBe(false);
  });
});
