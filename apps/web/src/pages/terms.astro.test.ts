import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const termsSource = readFileSync(
  fileURLToPath(new URL("./terms.astro", import.meta.url)),
  "utf8",
);

describe("terms page (Wave 5 — editorial legal document)", () => {
  it("uses LandingLayout so the editorial masthead and colophon are included", () => {
    expect(termsSource).toContain("LandingLayout");
    expect(termsSource).not.toContain("BaseLayout");
  });

  it("renders the TERMS eyebrow as an editorial-eyebrow", () => {
    expect(termsSource).toContain("editorial-eyebrow");
    expect(termsSource).toContain("TERMS");
  });

  it("renders the display-M italic headline", () => {
    expect(termsSource).toContain("editorial-display-m");
    expect(termsSource).toContain("editorial-italic");
    expect(termsSource).toContain("The terms of the arrangement.");
  });

  it("renders hairline editorial-rule elements between sections", () => {
    const ruleCount = (termsSource.match(/editorial-rule/g) ?? []).length;
    // At least 5 sections + 1 trailing rule = 6 minimum
    expect(ruleCount).toBeGreaterThanOrEqual(6);
  });

  it("renders section headings with hanging Roman numerals (I. through VI.)", () => {
    for (const numeral of ["I.", "II.", "III.", "IV.", "V.", "VI."]) {
      expect(termsSource).toContain(numeral);
    }
    expect(termsSource).not.toContain("VII.");
  });

  it("preserves all legal text verbatim", () => {
    expect(termsSource).toContain("Accounts and billing");
    expect(termsSource).toContain("Cancellations and refunds");
    expect(termsSource).toContain("Content on this site");
    expect(termsSource).toContain("Limitation of liability");
    expect(termsSource).toContain("month-to-month subscriptions");
    expect(termsSource).toContain("renew automatically until canceled");
    expect(termsSource).toContain("billing portal");
    expect(termsSource).toContain("generally non-refundable");
    expect(termsSource).toContain("Lifetime is");
    expect(termsSource).toContain("one-time purchase");
    expect(termsSource).toContain("abuse, fraud, or misuse");
    expect(termsSource).toContain("not liable");
  });

  it("uses editorial-link for email links", () => {
    expect(termsSource).toContain("editorial-link");
    expect(termsSource).toContain("siteConfig.contactEmail");
  });

  it("does not use marketing-card, marketing-panel, or accordion patterns", () => {
    expect(termsSource).not.toContain("marketing-card");
    expect(termsSource).not.toContain("marketing-panel");
    expect(termsSource).not.toContain("<details");
    expect(termsSource).not.toContain("<summary");
  });

  it("does not import or render legacy SiteHeader/SiteFooter directly", () => {
    expect(termsSource).not.toContain('SiteHeader slot="header"');
    expect(termsSource).not.toContain('SiteFooter slot="footer"');
  });
});
