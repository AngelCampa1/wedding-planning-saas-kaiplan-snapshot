import { describe, expect, it } from "vitest";
import {
  canonicalizeInternalHref,
  rehypeCanonicalInternalLinks,
} from "./rehype-canonical-internal-links";

describe("canonicalizeInternalHref", () => {
  it("adds trailing slashes to internal route links", () => {
    expect(canonicalizeInternalHref("/pricing")).toBe("/pricing/");
    expect(canonicalizeInternalHref("https://kaiplan.app/pricing")).toBe(
      "https://kaiplan.app/pricing/",
    );
    expect(canonicalizeInternalHref("/resources/guides/test?utm=1")).toBe(
      "/resources/guides/test/?utm=1",
    );
    expect(canonicalizeInternalHref("/compare/#alternatives")).toBe(
      "/compare/#alternatives",
    );
  });

  it("leaves external links, files, api paths, and root unchanged", () => {
    expect(canonicalizeInternalHref("https://example.com/pricing")).toBe(
      "https://example.com/pricing",
    );
    expect(canonicalizeInternalHref("//example.com/pricing")).toBe(
      "//example.com/pricing",
    );
    expect(canonicalizeInternalHref("/rss.xml")).toBe("/rss.xml");
    expect(canonicalizeInternalHref("/api/signup")).toBe("/api/signup");
    expect(canonicalizeInternalHref("/")).toBe("/");
  });
});

describe("rehypeCanonicalInternalLinks", () => {
  it("canonicalizes anchor and area hrefs in a HAST tree", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "a",
          properties: { href: "/pricing" },
          children: [],
        },
        {
          type: "element",
          tagName: "area",
          properties: { href: "/resources/guides/checklist#top" },
          children: [],
        },
        {
          type: "element",
          tagName: "a",
          properties: { href: "/downloads/checklist.pdf" },
          children: [],
        },
      ],
    };

    rehypeCanonicalInternalLinks()(tree);

    expect(tree.children[0]!.properties.href).toBe("/pricing/");
    expect(tree.children[1]!.properties.href).toBe(
      "/resources/guides/checklist/#top",
    );
    expect(tree.children[2]!.properties.href).toBe("/downloads/checklist.pdf");
  });

  it("ignores non-link elements and link nodes without string hrefs", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "text",
        },
        {
          type: "element",
          tagName: "strong",
          properties: { href: "/pricing" },
        },
        {
          type: "element",
          tagName: "a",
          properties: { href: undefined },
        },
        {
          type: "element",
          tagName: "area",
          properties: { href: 42 },
        },
      ],
    };

    rehypeCanonicalInternalLinks()(tree);

    const children = tree.children as Array<{
      properties?: Record<string, unknown>;
    }>;

    expect(children[1]!.properties?.href).toBe("/pricing");
    expect(children[2]!.properties?.href).toBeUndefined();
    expect(children[3]!.properties?.href).toBe(42);
  });
});
