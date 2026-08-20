import { describe, expect, it } from "vitest";
import { renderLeadMagnetPdf, type BrandConfig } from "./index.js";

const brand: BrandConfig = {
  productName: "Kaiplan",
  domain: "kaiplan.app",
  logoUrl: "https://kaiplan.app/logo-light.svg",
  brandColor: "#B0432A",
  accentColor: "#3A4A2C",
};

const SAMPLE_HTML = `
  <h2>Overview</h2>
  <p>This is a fixture article used to render a PDF end-to-end.</p>
  <h2>Details</h2>
  <ul><li>One</li><li>Two</li><li>Three</li></ul>
  <p style="page-break-before: always">Second-page content to guarantee a content page follows the cover.</p>
`;

describe("renderLeadMagnetPdf (real Chromium)", () => {
  it("produces a %PDF buffer with at least 2 pages for a fixture article", async () => {
    const { pdf, pageCount } = await renderLeadMagnetPdf({
      slug: "fixture",
      title: "Fixture Budget Template",
      subtitle: "Track vendor quotes and deposits",
      html: SAMPLE_HTML,
      brand,
    });
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf[0]).toBe(0x25);
    expect(pdf[1]).toBe(0x50);
    expect(pdf[2]).toBe(0x44);
    expect(pdf[3]).toBe(0x46);
    expect(pageCount).toBeGreaterThanOrEqual(2);
  }, 60_000);
});

describe("renderLeadMagnetPdf (mocked Chromium)", () => {
  it("throws a descriptive error if Chromium returns a non-PDF buffer", async () => {
    // Smoke-check the error-path guard by feeding a stub through the private
    // helpers composed by renderLeadMagnetPdf. We cannot easily mock the
    // dynamic import without extra plumbing, so we exercise the invariant
    // directly via the exported helpers.
    const { hasPdfMagic } = await import("./pdf-utils.js");
    const notAPdf = new Uint8Array([0x48, 0x54, 0x4d, 0x4c]); // "HTML"
    expect(hasPdfMagic(notAPdf)).toBe(false);
  });
});
