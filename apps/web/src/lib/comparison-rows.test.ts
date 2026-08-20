import { describe, it, expect } from "vitest";
import {
  buildAlternativeRows,
  buildComparisonRows,
  ALTERNATIVE_ONBOARDING_COPY,
  ALTERNATIVE_CONTRACT_COPY,
  ALTERNATIVE_FOCUS_COPY,
  COMPARISON_SETUP_COPY,
} from "./comparison-rows";
import { kaiplanPricingFacts } from "@kaiplan/knowledge/marketing";

describe("buildAlternativeRows", () => {
  it("returns exactly 5 rows", () => {
    const rows = buildAlternativeRows("Zola", "$299/mo", "from $20/mo");
    expect(rows).toHaveLength(5);
  });

  it("first row is the Price row with competitor pricing then kaiplan pricing", () => {
    const rows = buildAlternativeRows("Zola", "$299/mo", "from $20/mo");
    expect(rows[0]).toEqual({
      feature: "Price",
      values: ["$299/mo", "from $20/mo"],
    });
  });

  it("second row is the Product row with competitor name then Kaiplan", () => {
    const rows = buildAlternativeRows("Zola", "$299/mo", "from $20/mo");
    expect(rows[1]).toEqual({
      feature: "Product",
      values: ["Zola", "Kaiplan"],
    });
  });

  it("third row is the Onboarding row using ALTERNATIVE_ONBOARDING_COPY constants", () => {
    const rows = buildAlternativeRows("Zola", "$299/mo", "from $20/mo");
    expect(rows[2]).toEqual({
      feature: "Onboarding",
      values: [
        ALTERNATIVE_ONBOARDING_COPY.competitor,
        ALTERNATIVE_ONBOARDING_COPY.kaiplan,
      ],
    });
  });

  it("fourth row is the Contract row using ALTERNATIVE_CONTRACT_COPY constants", () => {
    const rows = buildAlternativeRows("Zola", "$299/mo", "from $20/mo");
    expect(rows[3]).toEqual({
      feature: "Contract",
      values: [
        ALTERNATIVE_CONTRACT_COPY.competitor,
        ALTERNATIVE_CONTRACT_COPY.kaiplan,
      ],
    });
  });

  it("fifth row is the Focus row using ALTERNATIVE_FOCUS_COPY constants", () => {
    const rows = buildAlternativeRows("Zola", "$299/mo", "from $20/mo");
    expect(rows[4]).toEqual({
      feature: "Focus",
      values: [
        ALTERNATIVE_FOCUS_COPY.competitor,
        ALTERNATIVE_FOCUS_COPY.kaiplan,
      ],
    });
  });

  it("each row has a feature string and a values array", () => {
    const rows = buildAlternativeRows("The Knot", "$199/mo", "from $20/mo");
    for (const row of rows) {
      expect(typeof row.feature).toBe("string");
      expect(Array.isArray(row.values)).toBe(true);
      for (const cell of row.values) {
        expect(typeof cell).toBe("string");
      }
    }
  });

  it("competitor name appears in the Product row values", () => {
    const rows = buildAlternativeRows("Honeybook", "$250/mo", "from $20/mo");
    expect(rows[1].values).toContain("Honeybook");
  });

  it("Kaiplan appears in the Product row values", () => {
    const rows = buildAlternativeRows("Zola", "$299/mo", "from $20/mo");
    expect(rows[1].values).toContain("Kaiplan");
  });
});

describe("buildComparisonRows", () => {
  it("returns exactly 3 rows", () => {
    const rows = buildComparisonRows(
      "Zola",
      "$299/mo",
      "The Knot",
      "$199/mo",
      "from $20/mo",
    );
    expect(rows).toHaveLength(3);
  });

  it("each row has exactly 3 values (one per tool)", () => {
    const rows = buildComparisonRows(
      "Zola",
      "$299/mo",
      "The Knot",
      "$199/mo",
      "from $20/mo",
    );
    for (const row of rows) {
      expect(row.values).toHaveLength(3);
    }
  });

  it("first row is the Price row with all three pricing strings in order", () => {
    const rows = buildComparisonRows(
      "Zola",
      "$299/mo",
      "The Knot",
      "$199/mo",
      "from $20/mo",
    );
    expect(rows[0]).toEqual({
      feature: "Price",
      values: ["$299/mo", "$199/mo", "from $20/mo"],
    });
  });

  it("second row is the Product row with competitor A, competitor B, and Kaiplan names", () => {
    const rows = buildComparisonRows(
      "Zola",
      "$299/mo",
      "The Knot",
      "$199/mo",
      "from $20/mo",
    );
    expect(rows[1]).toEqual({
      feature: "Product",
      values: ["Zola", "The Knot", "Kaiplan"],
    });
  });

  it("third row is the Setup row using COMPARISON_SETUP_COPY constants", () => {
    const rows = buildComparisonRows(
      "Zola",
      "$299/mo",
      "The Knot",
      "$199/mo",
      "from $20/mo",
    );
    expect(rows[2]).toEqual({
      feature: "Setup",
      values: [
        COMPARISON_SETUP_COPY.competitorA,
        COMPARISON_SETUP_COPY.competitorB,
        COMPARISON_SETUP_COPY.kaiplan,
      ],
    });
  });

  it("competitor A name appears in the Product row values", () => {
    const rows = buildComparisonRows(
      "Honeybook",
      "$250/mo",
      "Dubsado",
      "$200/mo",
      "from $20/mo",
    );
    expect(rows[1].values).toContain("Honeybook");
  });

  it("competitor B name appears in the Product row values", () => {
    const rows = buildComparisonRows(
      "Honeybook",
      "$250/mo",
      "Dubsado",
      "$200/mo",
      "from $20/mo",
    );
    expect(rows[1].values).toContain("Dubsado");
  });

  it("each row has a feature string and a values array of strings", () => {
    const rows = buildComparisonRows(
      "Zola",
      "$299/mo",
      "The Knot",
      "$199/mo",
      "from $20/mo",
    );
    for (const row of rows) {
      expect(typeof row.feature).toBe("string");
      expect(Array.isArray(row.values)).toBe(true);
      for (const cell of row.values) {
        expect(typeof cell).toBe("string");
      }
    }
  });
});

describe("exported copy constants", () => {
  it("ALTERNATIVE_ONBOARDING_COPY has competitor and kaiplan keys", () => {
    expect(ALTERNATIVE_ONBOARDING_COPY.competitor).toBe(
      "Vendor-first experience",
    );
    expect(ALTERNATIVE_ONBOARDING_COPY.kaiplan).toBe("Ready in minutes");
  });

  it("ALTERNATIVE_CONTRACT_COPY has competitor and kaiplan keys", () => {
    const { plans } = kaiplanPricingFacts;
    expect(ALTERNATIVE_CONTRACT_COPY.competitor).toBe("Annual contract");
    expect(ALTERNATIVE_CONTRACT_COPY.kaiplan).toBe(
      `From ${plans.starter.price} or ${plans.lifetime.price}`,
    );
  });

  it("ALTERNATIVE_FOCUS_COPY has competitor and kaiplan keys", () => {
    expect(ALTERNATIVE_FOCUS_COPY.competitor).toBe("Ad-supported platform");
    expect(ALTERNATIVE_FOCUS_COPY.kaiplan).toBe("Built for couples");
  });

  it("COMPARISON_SETUP_COPY has competitorA, competitorB, and kaiplan keys", () => {
    expect(COMPARISON_SETUP_COPY.competitorA).toBe("Complex setup");
    expect(COMPARISON_SETUP_COPY.competitorB).toBe("Moderate setup");
    expect(COMPARISON_SETUP_COPY.kaiplan).toBe("Ready in minutes");
  });
});
