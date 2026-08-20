import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const helpSource = readFileSync(
  fileURLToPath(new URL("./help.astro", import.meta.url)),
  "utf8",
);

describe("help page (help.astro) — Wave 3 Manual", () => {
  it("uses LandingLayout for masthead/colophon parity with the homepage", () => {
    expect(helpSource).toContain("LandingLayout");
    // The legacy SiteHeader/SiteFooter direct mount is gone — the
    // editorial masthead lives inside LandingLayout.
    expect(helpSource).not.toContain('slot="header"');
    expect(helpSource).not.toContain('slot="footer"');
  });

  it("opens with an editorial hero — eyebrow, italic display headline, lede, single CTA", () => {
    expect(helpSource).toContain("THE MANUAL");
    expect(helpSource).toContain("editorial-display-l");
    expect(helpSource).toContain("editorial-italic");
    expect(helpSource).toContain("plain English");
    expect(helpSource).toContain("editorial-lede");
    expect(helpSource).toContain("Open the app");
    expect(helpSource).toContain("buildAppSignupUrl");
  });

  it("renders the seven-chapter Roman-numeral structure", () => {
    // Numerals come from the chapter data array and thread into
    // data-chapter via interpolation. Assert the raw numerals exist as
    // entries in the array, plus the data-chapter binding is wired.
    for (const numeral of ["I", "II", "III", "IV", "V", "VI", "VII"]) {
      expect(helpSource).toContain(`numeral: "${numeral}"`);
    }
    expect(helpSource).toContain("data-chapter={chapter.numeral}");
    // Each chapter is an .editorial-chapter section with a display-M
    // italic heading.
    expect(helpSource).toContain("editorial-chapter");
    expect(helpSource).toContain("editorial-display-m");
  });

  it("uses the editorial Q&A pattern with details/summary, not card grids", () => {
    expect(helpSource).toContain("editorial-qa");
    expect(helpSource).toContain("<details");
    expect(helpSource).toContain("<summary");
    // Banned legacy patterns.
    expect(helpSource).not.toContain("marketing-card");
    expect(helpSource).not.toContain("marketing-panel");
    expect(helpSource).not.toContain("marketing-overline");
    expect(helpSource).not.toContain("marketing-title");
    expect(helpSource).not.toContain("md:grid-cols-2");
  });

  it("renders the jump-to TOC with editorial-link anchors to chapter ids", () => {
    expect(helpSource).toContain("Jump to:");
    // Every chapter has a slugged id (declared in the chapter data array)
    // that the TOC links to via interpolated href={`#${link.id}`}.
    for (const id of [
      "getting-started",
      "spreadsheets",
      "guests",
      "budget",
      "seating",
      "website",
      "billing",
    ]) {
      expect(helpSource).toContain(`id: "${id}"`);
    }
    // The TOC interpolates each id into an href — assert the template
    // is wired and the .editorial-link primitive is used.
    expect(helpSource).toContain("href={`#${link.id}`}");
    expect(helpSource).toContain("editorial-link");
  });

  it("includes the closing colophon-style help-email line", () => {
    expect(helpSource).toContain("siteConfig.contactEmail");
    // The apostrophe is rendered as &rsquo; for typography parity with the
    // homepage colophon — match either curly-entity or straight form.
    expect(helpSource).toMatch(/Couldn(?:&rsquo;|')t find your answer/);
  });

  it("gives every Q&A entry a deep-linkable id slugged from the question", () => {
    // Each chapter Q&A array threads through a slugify helper, and the
    // generated <details> tag must carry the id attribute so the page
    // can be deep-linked from #getting-started-... anchors.
    expect(helpSource).toMatch(/<details[^>]*\bid=/);
    expect(helpSource).toContain("slugify");
  });

  it("preserves the seven existing help topics so existing answers do not regress", () => {
    expect(helpSource).toContain("Getting started");
    expect(helpSource).toContain("Moving from a spreadsheet");
    expect(helpSource).toContain("Managing guests and RSVPs");
    expect(helpSource).toContain("Budget and vendors");
    expect(helpSource).toContain("Seating chart basics");
    expect(helpSource).toContain("Wedding website and invite links");
    expect(helpSource).toContain("Billing, exports, and account safety");
  });
});
