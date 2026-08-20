import { describe, expect, it, vi } from "vitest";

vi.mock("astro:content", () => {
  return {
    defineCollection: (config: unknown) => config,
  };
});

import { collections } from "./content.config";

describe("content config", () => {
  it("registers the expected content collections", () => {
    expect(Object.keys(collections)).toEqual([
      "alternatives",
      "comparisons",
      "pricing-breakdowns",
      "listicles",
      "guides",
      "lead-magnets",
    ]);
  });
});
