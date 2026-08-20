import { describe, expect, it } from "vitest";
import {
  buildFooterTemplate,
  buildLeadMagnetHtml,
  escapeHtml,
  type BrandConfig,
} from "./html-shell.js";

const brand: BrandConfig = {
  productName: "Kaiplan",
  domain: "kaiplan.app",
  logoUrl: "https://kaiplan.app/logo-light.svg",
  brandColor: "#B0432A",
  accentColor: "#3A4A2C",
};

describe("escapeHtml", () => {
  it("escapes the five XML-significant characters", () => {
    expect(escapeHtml(`<a href="x&y">'o'</a>`)).toBe(
      "&lt;a href=&quot;x&amp;y&quot;&gt;&#39;o&#39;&lt;/a&gt;",
    );
  });

  it("returns the same string when no escapable chars are present", () => {
    expect(escapeHtml("Kaiplan")).toBe("Kaiplan");
  });
});

describe("buildLeadMagnetHtml", () => {
  it("embeds brand colors inline on the cover element", () => {
    const html = buildLeadMagnetHtml({
      title: "Budget",
      subtitle: "Track deposits",
      html: "<p>hello</p>",
      brand,
    });
    expect(html).toContain('style="background:#B0432A"');
    expect(html).toContain("background:#3A4A2C");
  });

  it("injects the content fragment verbatim inside the main element", () => {
    const html = buildLeadMagnetHtml({
      title: "t",
      html: "<h2>Section</h2><p>body</p>",
      brand,
    });
    expect(html).toContain('<main class="content">');
    expect(html).toContain("<h2>Section</h2><p>body</p>");
  });

  it("renders the cover footer with product + domain", () => {
    const html = buildLeadMagnetHtml({
      title: "t",
      html: "",
      brand,
    });
    expect(html).toContain("Prepared by Kaiplan &middot; kaiplan.app");
  });

  it("omits the logo img when logoUrl is not provided", () => {
    const html = buildLeadMagnetHtml({
      title: "t",
      html: "",
      brand: { ...brand, logoUrl: undefined },
    });
    expect(html).not.toContain('<img class="cover-logo"');
  });

  it("includes the logo img when logoUrl is provided", () => {
    const html = buildLeadMagnetHtml({ title: "t", html: "", brand });
    expect(html).toContain('src="https://kaiplan.app/logo-light.svg"');
  });

  it("escapes the title, subtitle, and product name", () => {
    const html = buildLeadMagnetHtml({
      title: "<x>",
      subtitle: "a & b",
      html: "<p>c</p>",
      brand: { ...brand, productName: "K<>" },
    });
    expect(html).toContain("&lt;x&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).toContain("K&lt;&gt;");
  });

  it("omits the subtitle block when not provided", () => {
    const html = buildLeadMagnetHtml({ title: "t", html: "", brand });
    expect(html).not.toContain('<p class="cover-subtitle">');
  });

  it("declares a letter @page size and imports Fraunces + DM Sans", () => {
    const html = buildLeadMagnetHtml({ title: "t", html: "", brand });
    expect(html).toContain("@page { size: letter;");
    expect(html).toContain("Fraunces");
    expect(html).toContain("DM+Sans");
  });
});

describe("buildFooterTemplate", () => {
  it("includes pageNumber + totalPages spans used by Chromium", () => {
    const tpl = buildFooterTemplate(brand);
    expect(tpl).toContain('class="pageNumber"');
    expect(tpl).toContain('class="totalPages"');
  });

  it("escapes the product and domain fields", () => {
    const tpl = buildFooterTemplate({
      ...brand,
      productName: "K&K",
      domain: "a<b>",
    });
    expect(tpl).toContain("K&amp;K");
    expect(tpl).toContain("a&lt;b&gt;");
  });
});
