import { describe, it, expect } from "vitest";
import {
  buildGoogleFontsUrl,
  buildFontCssOverrides,
  DEFAULT_FONTS,
} from "./fonts";

describe("buildGoogleFontsUrl", () => {
  it("builds URL with heading and body fonts", () => {
    const url = buildGoogleFontsUrl({
      heading: "Space Grotesk",
      body: "IBM Plex Sans",
    });

    expect(url).toBe(
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap",
    );
  });

  it("requests italic axes for heading fonts that ship a real italic", () => {
    const url = buildGoogleFontsUrl({
      heading: "Instrument Serif",
      body: "Geist",
    });

    expect(url).toContain(
      "family=Instrument+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700",
    );
  });

  it("requests the wide weight range for Geist body", () => {
    const url = buildGoogleFontsUrl({
      heading: "Instrument Serif",
      body: "Geist",
    });

    expect(url).toContain(
      "family=Geist:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400",
    );
  });

  it("falls back to roman-only weights for non-italic heading families", () => {
    const url = buildGoogleFontsUrl({
      heading: "Space Grotesk",
      body: "Geist",
    });

    expect(url).toContain("family=Space+Grotesk:wght@400;500;600;700");
    expect(url).not.toContain("family=Space+Grotesk:ital");
  });

  it("falls back to standard body weights for non-Geist body families", () => {
    const url = buildGoogleFontsUrl({
      heading: "Instrument Serif",
      body: "IBM Plex Sans",
    });

    expect(url).toContain(
      "family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400",
    );
    expect(url).not.toContain("0,300");
  });

  it("includes mono font when provided", () => {
    const url = buildGoogleFontsUrl({
      heading: "Space Grotesk",
      body: "IBM Plex Sans",
      mono: "IBM Plex Mono",
    });

    expect(url).toContain("family=IBM+Plex+Mono:wght@400;500;700");
    expect(url.endsWith("&display=swap")).toBe(true);
  });

  it("omits mono font when not provided", () => {
    const url = buildGoogleFontsUrl({
      heading: "Inter",
      body: "Open Sans",
    });

    expect(url).not.toContain("Mono");
    expect(url).toContain("family=Inter:");
    expect(url).toContain("family=Open+Sans:");
  });

  it("always appends display=swap", () => {
    const url = buildGoogleFontsUrl({
      heading: "Roboto",
      body: "Roboto",
    });

    expect(url).toContain("display=swap");
    expect(url.endsWith("&display=swap")).toBe(true);
  });

  it("replaces spaces with + in font names", () => {
    const url = buildGoogleFontsUrl({
      heading: "Fira Code Light",
      body: "Source Sans Pro",
    });

    expect(url).toContain("Fira+Code+Light");
    expect(url).toContain("Source+Sans+Pro");
    expect(url).not.toContain("Fira Code Light");
    expect(url).not.toContain("Source Sans Pro");
  });

  it("handles single-word font names without spaces", () => {
    const url = buildGoogleFontsUrl({
      heading: "Inter",
      body: "Roboto",
      mono: "Inconsolata",
    });

    expect(url).toContain("family=Inter:");
    expect(url).toContain("family=Roboto:");
    expect(url).toContain("family=Inconsolata:");
  });

  it("returns a valid URL that starts with the Google Fonts base", () => {
    const url = buildGoogleFontsUrl({
      heading: "Montserrat",
      body: "Lato",
    });

    expect(url).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
  });
});

describe("DEFAULT_FONTS", () => {
  it("is exported and contains the expected default font families", () => {
    expect(DEFAULT_FONTS).toEqual({
      heading: "Instrument Serif",
      body: "Geist",
      mono: "Geist Mono",
    });
  });

  it("produces a valid Google Fonts URL when passed to buildGoogleFontsUrl", () => {
    const url = buildGoogleFontsUrl(DEFAULT_FONTS);
    expect(url).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/);
    expect(url).toContain("Instrument+Serif");
    expect(url).toContain("Geist");
    expect(url).toContain("Geist+Mono");
    expect(url).toContain("display=swap");
  });

  it("matches the editorial system font URL", () => {
    const url = buildGoogleFontsUrl(DEFAULT_FONTS);
    expect(url).toBe(
      "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Geist:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Geist+Mono:wght@400;500;700&display=swap",
    );
  });
});

describe("buildFontCssOverrides", () => {
  it("returns CSS that sets --font-heading and --font-body on :root", () => {
    const css = buildFontCssOverrides({
      heading: "Plus Jakarta Sans",
      body: "Inter",
    });

    expect(css).toContain(":root");
    expect(css).toContain(
      '--font-heading: "Plus Jakarta Sans", system-ui, sans-serif',
    );
    expect(css).toContain('--font-body: "Inter", system-ui, sans-serif');
  });

  it("sets --font-mono when mono is provided", () => {
    const css = buildFontCssOverrides({
      heading: "Inter",
      body: "Inter",
      mono: "JetBrains Mono",
    });

    expect(css).toContain(
      '--font-mono: "JetBrains Mono", ui-monospace, monospace',
    );
  });

  it("sets --font-mono to default fallback when mono is omitted", () => {
    const css = buildFontCssOverrides({
      heading: "Inter",
      body: "Inter",
    });

    expect(css).toContain('--font-mono: "Geist Mono", ui-monospace, monospace');
  });

  it("produces valid CSS with default fonts", () => {
    const css = buildFontCssOverrides(DEFAULT_FONTS);

    expect(css).toContain('--font-heading: "Instrument Serif"');
    expect(css).toContain('--font-body: "Geist"');
    expect(css).toContain('--font-mono: "Geist Mono"');
  });

  it("produces exact expected output for full snapshot", () => {
    const css = buildFontCssOverrides({
      heading: "Plus Jakarta Sans",
      body: "Inter",
      mono: "JetBrains Mono",
    });

    expect(css).toBe(`:root {
  --font-heading: "Plus Jakarta Sans", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}`);
  });
});
