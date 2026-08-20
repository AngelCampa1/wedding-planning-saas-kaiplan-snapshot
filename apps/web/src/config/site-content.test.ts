import { describe, expect, it } from "vitest";
import { hubFaqs } from "./hub-faqs";
import { personas } from "./personas";

describe("hubFaqs", () => {
  it("exposes the expected marketing FAQ groups", () => {
    expect(Object.keys(hubFaqs)).toEqual([
      "/compare",
      "/compare/alternatives",
      "/compare/versus",
      "/compare/pricing",
      "/resources",
      "/resources/best",
      "/resources/guides",
    ]);
    expect(hubFaqs["/compare"]).toHaveLength(4);
    expect(hubFaqs["/resources/guides"][0]).toEqual({
      q: "What wedding planning guide topics are covered?",
      a: expect.stringContaining("guides cover building a realistic wedding budget"),
    });
  });
});

describe("personas", () => {
  it("exports the expected customer personas", () => {
    expect(personas).toHaveLength(4);
    expect(personas.map((persona) => persona.slug)).toEqual([
      "frustrated-planner",
      "anti-subscription-couple",
      "spreadsheet-builder",
      "research-first-buyer",
    ]);
  });
});
