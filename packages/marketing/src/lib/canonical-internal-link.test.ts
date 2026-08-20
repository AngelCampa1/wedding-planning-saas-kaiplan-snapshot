import { describe, expect, it } from "vitest";
import { canonicalizeInternalHref } from "./meta";

describe("canonicalizeInternalHref", () => {
  it("adds trailing slashes to internal route links", () => {
    expect(canonicalizeInternalHref("/pricing")).toBe("/pricing/");
    expect(canonicalizeInternalHref("https://kaiplan.app/pricing")).toBe(
      "https://kaiplan.app/pricing/",
    );
    expect(canonicalizeInternalHref("https://kaiplan.app")).toBe(
      "https://kaiplan.app/",
    );
    expect(canonicalizeInternalHref("https://kaiplan.app?utm=1")).toBe(
      "https://kaiplan.app/?utm=1",
    );
    expect(canonicalizeInternalHref("https://kaiplan.app#plans")).toBe(
      "https://kaiplan.app/#plans",
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
    expect(canonicalizeInternalHref("/api")).toBe("/api");
    expect(canonicalizeInternalHref("/api/signup")).toBe("/api/signup");
    expect(canonicalizeInternalHref("/")).toBe("/");
  });

  it("canonicalizes dotted route slugs while leaving real files alone", () => {
    expect(canonicalizeInternalHref("/blog/post-v2.0")).toBe(
      "/blog/post-v2.0/",
    );
    expect(canonicalizeInternalHref("/rss.xml")).toBe("/rss.xml");
  });
});
