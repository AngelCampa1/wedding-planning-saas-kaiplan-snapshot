import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("editorial layout source regressions", () => {
  it("does not load the Ventora feedback widget on marketing pages", () => {
    const baseLayoutSource = readSource("./base-layout.astro");

    expect(baseLayoutSource).toContain("enableScrollReveal");
    expect(baseLayoutSource).not.toContain("widgets.ventoralabs.com");
    expect(baseLayoutSource).not.toContain('data-product="kaiplan"');
    expect(baseLayoutSource).not.toContain('data-widget="feedback-button"');
    expect(baseLayoutSource).toContain(
      "{enableScrollReveal && <script is:inline set:html={scrollRevealScript} />}",
    );
  });

  it("removes footer email capture from long-form editorial layouts", () => {
    const articleLayoutSource = readSource("./article-layout.astro");
    const comparisonLayoutSource = readSource("./comparison-layout.astro");
    const contentLayoutSource = readSource("./content-layout.astro");
    const listicleLayoutSource = readSource("./listicle-layout.astro");
    const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");

    for (const source of [
      articleLayoutSource,
      comparisonLayoutSource,
      contentLayoutSource,
      listicleLayoutSource,
      pricingLayoutSource,
    ]) {
      expect(source).toContain("enableScrollReveal={false}");
      expect(source).toContain('captureVariant="none"');
    }
  });

  it("uses darker shared label treatments for TOC scan text", () => {
    const tocSource = readSource("../components/table-of-contents.astro");

    expect(tocSource).toContain("text-[var(--color-accent-800)]");
    // The editorial colophon (Wave 2) replaces the old footer scan text
    // entirely. Colors are bound via editorial CSS variables (--ink,
    // --ink-soft) instead of the old accent-800/neutral-800 utilities.
  });

  it("flattens repeated blur-heavy shared chrome surfaces", () => {
    const headerSource = readSource("../components/site-header.astro");
    const stickyMobileCtaSource = readSource(
      "../components/sticky-mobile-cta.astro",
    );

    expect(headerSource).not.toContain("backdrop-blur-sm");
    expect(headerSource).not.toContain("backdrop-blur-xl");
    expect(headerSource).not.toContain("backdrop-filter: blur(10px)");
    expect(stickyMobileCtaSource).not.toContain("backdrop-blur-lg");
  });

  it("uses a button-driven mobile nav with collapsed deep-link groups", () => {
    const headerSource = readSource("../components/site-header.astro");

    // Wave 2 renames the trigger/overlay hooks under the editorial-*
    // namespace, while deep-link groups use native details/summary so they
    // stay collapsed until the user chooses to browse them.
    expect(headerSource).toContain("data-editorial-nav-trigger");
    expect(headerSource).toContain("data-editorial-nav-overlay");
    expect(headerSource).toContain(
      'class="editorial-mobile-nav-overlay__group"',
    );
    expect(headerSource).toContain("<summary>");
  });

  it("supports stacked comparison cells for editorial tables on small screens", () => {
    const comparisonTableSource = readSource(
      "../components/comparison-table.astro",
    );

    expect(comparisonTableSource).toContain(
      "data-column-label={headers[i + 1]}",
    );
    expect(comparisonTableSource).toContain("@media (max-width: 40rem)");
  });

  it("anchors the refreshed editorial framing on shared marketing panels", () => {
    const articleLayoutSource = readSource("./article-layout.astro");
    const comparisonLayoutSource = readSource("./comparison-layout.astro");
    const listicleLayoutSource = readSource("./listicle-layout.astro");
    const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");

    for (const source of [
      articleLayoutSource,
      comparisonLayoutSource,
      listicleLayoutSource,
      pricingLayoutSource,
    ]) {
      expect(source).toContain("marketing-panel");
      expect(source).toContain("marketing-overline");
    }
  });

  it("keeps long-form sidebars sticky on large screens", () => {
    const articleLayoutSource = readSource("./article-layout.astro");
    const contentLayoutSource = readSource("./content-layout.astro");
    const comparisonLayoutSource = readSource("./comparison-layout.astro");
    const listicleLayoutSource = readSource("./listicle-layout.astro");

    for (const source of [
      articleLayoutSource,
      contentLayoutSource,
      comparisonLayoutSource,
      listicleLayoutSource,
    ]) {
      expect(source).toContain("lg:sticky");
      expect(source).toContain("lg:top-28");
    }
  });
});
