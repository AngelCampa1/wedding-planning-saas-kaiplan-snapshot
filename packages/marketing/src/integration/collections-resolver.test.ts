/**
 * Integration: collections.ts + related-page-resolver.ts
 *
 * mapToContentItems calls deriveTitleFromHref internally. These tests exercise
 * the combined pipeline, including edge-case hrefs that the individual unit
 * tests don't cover.
 */
import { describe, it, expect } from "vitest";
import { mapToContentItems, sortByUpdatedAtDesc } from "../lib/collections";
import { deriveTitleFromHref } from "../lib/related-page-resolver";
import type { BuyerStage } from "../types";

function makeEntry(
  slug: string,
  relatedPages?: string[],
  overrides: Partial<{
    buyerStage: BuyerStage;
    publishedAt: string;
    updatedAt: string;
  }> = {},
) {
  return {
    slug,
    data: {
      title: `Title of ${slug}`,
      description: `Desc of ${slug}`,
      buyerStage: (overrides.buyerStage ?? "tofu") as BuyerStage,
      publishedAt: overrides.publishedAt ?? "2026-01-01",
      updatedAt: overrides.updatedAt ?? "2026-02-01",
      ...(relatedPages !== undefined && { relatedPages }),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// deriveTitleFromHref edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveTitleFromHref — edge cases", () => {
  it("derives a human-readable title from a nested path", () => {
    expect(deriveTitleFromHref("/alternatives/some-tool")).toBe("some tool");
  });

  it("replaces all hyphens with spaces in the last segment", () => {
    expect(deriveTitleFromHref("/comparisons/foo-bar-vs-baz")).toBe(
      "foo bar vs baz",
    );
  });

  it("returns the href itself when there are no path segments (empty string)", () => {
    // Edge case: empty string href → segments = [] → returns href ("").
    // This can produce ContentItems with empty-string titles.
    expect(deriveTitleFromHref("")).toBe("");
  });

  it("returns the href itself when href is only slashes", () => {
    // "/" → segments = [] after filter → returns "/"
    expect(deriveTitleFromHref("/")).toBe("/");
  });

  it("handles single-segment paths correctly", () => {
    expect(deriveTitleFromHref("/guides")).toBe("guides");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapToContentItems — relatedPages title derivation
// ─────────────────────────────────────────────────────────────────────────────

describe("mapToContentItems + deriveTitleFromHref cross-module integration", () => {
  it("derives correct titles for valid relatedPages hrefs", () => {
    const entries = [
      makeEntry("my-article", [
        "/alternatives/some-tool",
        "/comparisons/a-vs-b",
      ]),
    ];
    const items = mapToContentItems(entries, (e) => `/articles/${e.slug}`);

    expect(items[0]!.relatedPages).toHaveLength(2);
    expect(items[0]!.relatedPages[0]!).toEqual({
      href: "/alternatives/some-tool/",
      title: "some tool",
    });
    expect(items[0]!.relatedPages[1]!).toEqual({
      href: "/comparisons/a-vs-b/",
      title: "a vs b",
    });
  });

  it("produces an empty title when relatedPages contains an empty-string href", () => {
    // Edge case: "" in relatedPages → deriveTitleFromHref("") returns ""
    // This is a silent data-quality issue — the ContentItem gets title: ""
    const entries = [makeEntry("article", [""])];
    const items = mapToContentItems(entries, (e) => `/articles/${e.slug}`);

    expect(items[0]!.relatedPages).toHaveLength(1);
    expect(items[0]!.relatedPages[0]!).toEqual({ href: "", title: "" });
  });

  it("produces title '/' when relatedPages contains a bare slash href", () => {
    const entries = [makeEntry("article", ["/"])];
    const items = mapToContentItems(entries, (e) => `/articles/${e.slug}`);

    expect(items[0]!.relatedPages[0]!).toEqual({ href: "/", title: "/" });
  });

  it("defaults relatedPages to [] when data.relatedPages is undefined", () => {
    const entries = [makeEntry("article")]; // no relatedPages
    const items = mapToContentItems(entries, (e) => `/articles/${e.slug}`);

    expect(items[0]!.relatedPages).toEqual([]);
  });

  it("handles multiple entries with mixed relatedPages correctly", () => {
    const entries = [
      makeEntry("a", ["/guides/intro"]),
      makeEntry("b", ["/pricing/tool-x", "/comparisons/x-vs-y"]),
      makeEntry("c"), // no relatedPages
    ];
    const items = mapToContentItems(entries, (e) => `/${e.slug}`);

    expect(items[0]!.relatedPages[0]!).toEqual({
      href: "/guides/intro/",
      title: "intro",
    });
    expect(items[1]!.relatedPages).toHaveLength(2);
    expect(items[2]!.relatedPages).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sortByUpdatedAtDesc → mapToContentItems pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe("sortByUpdatedAtDesc + mapToContentItems pipeline", () => {
  it("sort order is preserved through mapToContentItems", () => {
    const entries = [
      makeEntry("old", [], { updatedAt: "2026-01-01" }),
      makeEntry("newest", [], { updatedAt: "2026-03-01" }),
      makeEntry("middle", [], { updatedAt: "2026-02-01" }),
    ];

    const sorted = sortByUpdatedAtDesc(entries);
    const items = mapToContentItems(sorted, (e) => `/${e.slug}`);

    expect(items[0]!.href).toBe("/newest/");
    expect(items[1]!.href).toBe("/middle/");
    expect(items[2]!.href).toBe("/old/");
  });

  it("relatedPages are derived correctly after sorting", () => {
    const entries = [
      makeEntry("a", ["/foo-bar"], { updatedAt: "2026-01-01" }),
      makeEntry("b", ["/baz-qux"], { updatedAt: "2026-03-01" }),
    ];

    const sorted = sortByUpdatedAtDesc(entries);
    const items = mapToContentItems(sorted, (e) => `/${e.slug}`);

    // After sort: b comes first, then a
    expect(items[0]!.relatedPages[0]!).toEqual({
      href: "/baz-qux/",
      title: "baz qux",
    });
    expect(items[1]!.relatedPages[0]!).toEqual({
      href: "/foo-bar/",
      title: "foo bar",
    });
  });
});
