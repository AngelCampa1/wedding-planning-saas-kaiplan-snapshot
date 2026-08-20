import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featuresSource = readFileSync(
  fileURLToPath(new URL("./features.astro", import.meta.url)),
  "utf8",
);

describe("features page clarity alignment", () => {
  it("uses LandingLayout so the editorial masthead and colophon come for free", () => {
    expect(featuresSource).toContain("LandingLayout");
    expect(featuresSource).not.toContain("BaseLayout");
  });

  it("links the hero CTA to the app via buildAppSignupUrl", () => {
    expect(featuresSource).toContain("buildAppSignupUrl()");
    expect(featuresSource).toContain("Start planning");
  });

  it("renders the features eyebrow and connected-workspace hero copy", () => {
    expect(featuresSource).toMatch(/editorial-eyebrow[^>]*>\s*Features/);
    expect(featuresSource).toContain("Everything stays connected.");
    expect(featuresSource).toContain("couples and the people");
  });

  it("hangs a single h1 in the hero with editorial display L scale", () => {
    expect(featuresSource).toContain("editorial-display-l");
    // exactly one h1 element
    const h1Matches = featuresSource.match(/<h1\b/g) ?? [];
    expect(h1Matches.length).toBe(1);
  });

  it("declares six Roman-numeral chapters from kaiplanOffering and binds them to data-chapter", () => {
    // Chapters now come from kaiplanOffering.featureChapters. Assert the
    // source reads from the offering rather than asserting on numeral literals.
    expect(featuresSource).toContain("kaiplanOffering.featureChapters");
    expect(featuresSource).toContain("data-chapter={chapter.numeral}");
    // Six feature plate keys are still declared in order in the source.
    expect(featuresSource).toContain("featurePlateKeys");
  });

  it("renders editorial figures for each feature plate using astro:assets Image", () => {
    expect(featuresSource).toContain("editorial-figure");
    expect(featuresSource).toContain('from "astro:assets"');
    expect(featuresSource).toContain("screenshotPlates");
  });

  it("orders the plates in the canonical six-feature sequence", () => {
    const order = [
      "budget-ledger",
      "guest-list",
      "seating-chart",
      "vendor-tracker",
      "wedding-website",
      "milestone-checklist",
    ];
    let lastIndex = -1;
    for (const key of order) {
      const idx = featuresSource.indexOf(`"${key}"`);
      expect(
        idx,
        `expected "${key}" to appear in features.astro`,
      ).toBeGreaterThan(-1);
      expect(idx, `${key} appears out of order`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("eager-loads only the first feature plate; the rest are lazy", () => {
    // The chapter loop binds loading to a per-index figLazy var that
    // resolves to "eager" for index 0 and "lazy" for the rest. Assert on
    // the contract that produces that, not the rendered output.
    expect(featuresSource).toContain('index === 0 ? "eager" : "lazy"');
    expect(featuresSource).toContain("loading={figLazy}");
  });

  it("renders the typeset matrix with hairline editorial styling, not striped tables or check circles", () => {
    expect(featuresSource).toContain("editorial-matrix");
    // No legacy card grid / check circle patterns
    expect(featuresSource).not.toContain("marketing-card-grid");
    expect(featuresSource).not.toContain("marketing-card");
    expect(featuresSource).not.toContain("text-[var(--color-success)]");
    expect(featuresSource).not.toContain("&#10003;");
  });

  it("renders the matrix tier columns: Starter, Pro, Lifetime", () => {
    expect(featuresSource).toContain("Starter");
    expect(featuresSource).toContain("Pro");
    expect(featuresSource).toContain("Lifetime");
  });

  it("positions the trial as full app access before choosing a plan", () => {
    expect(featuresSource).toContain("publicSiteCopy");
    expect(featuresSource).toContain("pricingTrialBannerText");
    expect(featuresSource).not.toContain(
      "Lifetime is a one-time purchase, no trial",
    );
  });

  it("uses the editorial-link primitive for the closing CTA", () => {
    expect(featuresSource).toContain("editorial-link");
    expect(featuresSource).toContain("Start your free planning trial");
  });

  it("does not include visible em dash characters or mojibake dash artifacts", () => {
    expect(featuresSource).not.toContain(String.fromCharCode(0x2014));
    expect(featuresSource).not.toContain(
      `${String.fromCharCode(0x00e2)}${String.fromCharCode(0x20ac)}${String.fromCharCode(0x201d)}`,
    );
  });

  it("does not import or render the legacy SiteHeader/SiteFooter directly", () => {
    expect(featuresSource).not.toContain('SiteHeader slot="header"');
    expect(featuresSource).not.toContain('SiteFooter slot="footer"');
  });
});
