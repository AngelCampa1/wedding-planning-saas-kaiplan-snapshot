import { describe, expect, it } from "vitest";
import { BILLING_FEATURE_LABELS, BILLING_PLAN_LABELS } from "@kaiplan/shared";
import {
  __billingLabelsTestExports,
  FEATURE_LABELS,
  getFeaturePlanLabel,
} from "../../src/lib/billing-labels";

describe("FEATURE_LABELS", () => {
  it("vendors is a non-empty string", () => {
    expect(typeof FEATURE_LABELS.vendors).toBe("string");
    expect(FEATURE_LABELS.vendors.length).toBeGreaterThan(0);
  });

  it("extraPlanner is a non-empty string", () => {
    expect(typeof FEATURE_LABELS.extraPlanner).toBe("string");
    expect(FEATURE_LABELS.extraPlanner.length).toBeGreaterThan(0);
  });

  it("weddingWebsite is a non-empty string", () => {
    expect(typeof FEATURE_LABELS.weddingWebsite).toBe("string");
    expect(FEATURE_LABELS.weddingWebsite.length).toBeGreaterThan(0);
  });

  it("has exactly 3 keys", () => {
    expect(Object.keys(FEATURE_LABELS)).toHaveLength(3);
  });

  it("derives feature labels from shared billing labels", () => {
    expect(FEATURE_LABELS).toEqual(BILLING_FEATURE_LABELS);
  });
});

describe("getFeaturePlanLabel", () => {
  it("derives multi-plan feature access labels from shared billing metadata", () => {
    expect(getFeaturePlanLabel("vendors")).toBe(
      `${BILLING_PLAN_LABELS.pro} or ${BILLING_PLAN_LABELS.lifetime}`,
    );
    expect(getFeaturePlanLabel("extraPlanner")).toBe(
      `${BILLING_PLAN_LABELS.pro} or ${BILLING_PLAN_LABELS.lifetime}`,
    );
    expect(getFeaturePlanLabel("weddingWebsite")).toBe(
      `${BILLING_PLAN_LABELS.pro} or ${BILLING_PLAN_LABELS.lifetime}`,
    );
  });

  it("formats zero, one, two, and three plan label lists", () => {
    const { formatPlanLabelList } = __billingLabelsTestExports;

    expect(formatPlanLabelList([])).toBe("");
    expect(formatPlanLabelList([BILLING_PLAN_LABELS.pro])).toBe(
      BILLING_PLAN_LABELS.pro,
    );
    expect(
      formatPlanLabelList([
        BILLING_PLAN_LABELS.pro,
        BILLING_PLAN_LABELS.lifetime,
      ]),
    ).toBe(`${BILLING_PLAN_LABELS.pro} or ${BILLING_PLAN_LABELS.lifetime}`);
    expect(
      formatPlanLabelList([
        BILLING_PLAN_LABELS.starter,
        BILLING_PLAN_LABELS.pro,
        BILLING_PLAN_LABELS.lifetime,
      ]),
    ).toBe(
      `${BILLING_PLAN_LABELS.starter}, ${BILLING_PLAN_LABELS.pro} or ${BILLING_PLAN_LABELS.lifetime}`,
    );
  });
});
