import { describe, it, expect } from "vitest";
import {
  filterByStage,
  filterByTag,
  paginateItems,
  BUYER_STAGE_FILTER,
  DATE_SORT_OPTIONS,
} from "./content-filters";
import type { ContentItem } from "@kaiplan/marketing";
import type { BuyerStage } from "@kaiplan/marketing";

function makeItem(
  overrides: Partial<ContentItem> & { buyerStage: BuyerStage },
): ContentItem {
  return {
    title: "Test Title",
    description: "Test description",
    href: "/test",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    relatedPages: [],
    ...overrides,
  };
}

describe("filterByStage", () => {
  it("returns only items matching the given stage", () => {
    const items: ContentItem[] = [
      makeItem({ buyerStage: "tofu", href: "/a" }),
      makeItem({ buyerStage: "mofu", href: "/b" }),
      makeItem({ buyerStage: "bofu", href: "/c" }),
      makeItem({ buyerStage: "tofu", href: "/d" }),
    ];
    const result = filterByStage(items, "tofu");
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.buyerStage === "tofu")).toBe(true);
  });

  it("returns empty array when no items match", () => {
    const items: ContentItem[] = [
      makeItem({ buyerStage: "tofu", href: "/a" }),
      makeItem({ buyerStage: "mofu", href: "/b" }),
    ];
    expect(filterByStage(items, "bofu")).toHaveLength(0);
  });

  it("returns all items when all match the stage", () => {
    const items: ContentItem[] = [
      makeItem({ buyerStage: "bofu", href: "/a" }),
      makeItem({ buyerStage: "bofu", href: "/b" }),
    ];
    expect(filterByStage(items, "bofu")).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(filterByStage([], "tofu")).toHaveLength(0);
  });

  it("filters mofu correctly", () => {
    const items: ContentItem[] = [
      makeItem({ buyerStage: "tofu", href: "/a" }),
      makeItem({ buyerStage: "mofu", href: "/b" }),
      makeItem({ buyerStage: "bofu", href: "/c" }),
    ];
    const result = filterByStage(items, "mofu");
    expect(result).toHaveLength(1);
    expect(result[0].href).toBe("/b");
  });
});

describe("filterByTag", () => {
  it("returns items whose metadata.tags contains the tag", () => {
    const items: ContentItem[] = [
      makeItem({
        buyerStage: "tofu",
        href: "/a",
        metadata: { tags: "wedding,budget" },
      }),
      makeItem({
        buyerStage: "tofu",
        href: "/b",
        metadata: { tags: "venue,checklist" },
      }),
      makeItem({
        buyerStage: "mofu",
        href: "/c",
        metadata: { tags: "budget,tools" },
      }),
    ];
    const result = filterByTag(items, "budget");
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.href)).toEqual(["/a", "/c"]);
  });

  it("returns empty array when no items have the tag", () => {
    const items: ContentItem[] = [
      makeItem({
        buyerStage: "tofu",
        href: "/a",
        metadata: { tags: "wedding" },
      }),
    ];
    expect(filterByTag(items, "venue")).toHaveLength(0);
  });

  it("returns empty array when items have no metadata", () => {
    const items: ContentItem[] = [makeItem({ buyerStage: "tofu", href: "/a" })];
    expect(filterByTag(items, "wedding")).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(filterByTag([], "wedding")).toHaveLength(0);
  });

  it("is case-sensitive by default", () => {
    const items: ContentItem[] = [
      makeItem({
        buyerStage: "tofu",
        href: "/a",
        metadata: { tags: "Wedding" },
      }),
    ];
    expect(filterByTag(items, "wedding")).toHaveLength(0);
    expect(filterByTag(items, "Wedding")).toHaveLength(1);
  });

  it("handles items with no tags key in metadata", () => {
    const items: ContentItem[] = [
      makeItem({
        buyerStage: "tofu",
        href: "/a",
        metadata: { category: "guide" },
      }),
    ];
    expect(filterByTag(items, "wedding")).toHaveLength(0);
  });
});

describe("paginateItems", () => {
  const items = Array.from({ length: 10 }, (_, i) =>
    makeItem({ buyerStage: "tofu", href: `/item-${i}` }),
  );

  it("returns correct items for page 1", () => {
    const result = paginateItems(items, 1, 3);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].href).toBe("/item-0");
  });

  it("returns correct items for page 2", () => {
    const result = paginateItems(items, 2, 3);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].href).toBe("/item-3");
  });

  it("returns remaining items on last page", () => {
    const result = paginateItems(items, 4, 3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].href).toBe("/item-9");
  });

  it("computes correct totalPages", () => {
    expect(paginateItems(items, 1, 3).totalPages).toBe(4);
    expect(paginateItems(items, 1, 5).totalPages).toBe(2);
    expect(paginateItems(items, 1, 10).totalPages).toBe(1);
  });

  it("returns 1 totalPage for empty array", () => {
    const result = paginateItems([], 1, 10);
    expect(result.items).toHaveLength(0);
    expect(result.totalPages).toBe(1);
  });

  it("works with generic type (strings)", () => {
    const strItems = ["a", "b", "c", "d", "e"];
    const result = paginateItems(strItems, 2, 2);
    expect(result.items).toEqual(["c", "d"]);
    expect(result.totalPages).toBe(3);
  });

  it("returns all items when pageSize exceeds total", () => {
    const result = paginateItems(items, 1, 100);
    expect(result.items).toHaveLength(10);
    expect(result.totalPages).toBe(1);
  });
});

describe("BUYER_STAGE_FILTER", () => {
  it("has id buyerStage", () => {
    expect(BUYER_STAGE_FILTER.id).toBe("buyerStage");
  });

  it("has label Stage", () => {
    expect(BUYER_STAGE_FILTER.label).toBe("Stage");
  });

  it("has three options: tofu, mofu, bofu", () => {
    const values = BUYER_STAGE_FILTER.options.map((o) => o.value);
    expect(values).toContain("tofu");
    expect(values).toContain("mofu");
    expect(values).toContain("bofu");
    expect(BUYER_STAGE_FILTER.options).toHaveLength(3);
  });

  it("option labels are human-readable", () => {
    const labels = BUYER_STAGE_FILTER.options.map((o) => o.label);
    expect(labels).toContain("Awareness");
    expect(labels).toContain("Consideration");
    expect(labels).toContain("Decision");
  });
});

describe("DATE_SORT_OPTIONS", () => {
  it("has three sort options", () => {
    expect(DATE_SORT_OPTIONS).toHaveLength(3);
  });

  it("includes newest, oldest, and az options", () => {
    const values = DATE_SORT_OPTIONS.map((o) => o.value);
    expect(values).toContain("newest");
    expect(values).toContain("oldest");
    expect(values).toContain("az");
  });

  it("all options have labels", () => {
    DATE_SORT_OPTIONS.forEach((o) => {
      expect(typeof o.label).toBe("string");
      expect(o.label.length).toBeGreaterThan(0);
    });
  });
});

