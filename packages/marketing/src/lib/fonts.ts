interface FontConfig {
  heading: string;
  body: string;
  mono?: string;
}

/**
 * Default fonts used when no `fonts` prop is provided to base-layout.
 * Matches the previously hardcoded fallback URL — kept here so the layout
 * always calls `buildGoogleFontsUrl` rather than maintaining a separate string.
 */
export const DEFAULT_FONTS: FontConfig = {
  heading: "Instrument Serif",
  body: "Geist",
  mono: "Geist Mono",
};

/**
 * Heading families that ship a true italic that the editorial system relies
 * on (e.g. mixing roman + italic in display headlines). When the configured
 * heading font is one of these, the Google Fonts URL must request the italic
 * axis as well as the roman so the italic glyphs are available without a
 * synthetic slant fallback.
 */
const HEADING_FAMILIES_WITH_ITALIC = new Set<string>([
  "Instrument Serif",
  "Fraunces",
]);

/**
 * Body families that ship a wider weight range than the default 400-700
 * Google Fonts request. Geist is the editorial system's body face and is
 * used at weights 300-700 (light captions, regular body, semibold buttons).
 */
const BODY_FAMILIES_WIDE_WEIGHT = new Set<string>(["Geist"]);

/**
 * Builds a CSS string that overrides the --font-heading, --font-body, and
 * --font-mono custom properties on :root to match the site's font config.
 *
 * Without this, globals.css hardcodes default font names in the CSS variables
 * while Google Fonts loads the site-specific fonts — causing a mismatch.
 */
export function buildFontCssOverrides(fonts: FontConfig): string {
  const mono = fonts.mono ?? DEFAULT_FONTS.mono;
  return `:root {
  --font-heading: "${fonts.heading}", system-ui, sans-serif;
  --font-body: "${fonts.body}", system-ui, sans-serif;
  --font-mono: "${mono}", ui-monospace, monospace;
}`;
}

/**
 * Builds a Google Fonts CSS URL from a font configuration.
 *
 * Accepts font family names as-is (e.g. "Space Grotesk", "IBM Plex Sans").
 * Spaces are replaced with `+` for the URL. Always appends `display=swap`.
 */
export function buildGoogleFontsUrl(fonts: FontConfig): string {
  const families: string[] = [];

  const encode = (name: string) => name.replace(/ /g, "+");

  if (HEADING_FAMILIES_WITH_ITALIC.has(fonts.heading)) {
    families.push(
      `family=${encode(fonts.heading)}:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700`,
    );
  } else {
    families.push(`family=${encode(fonts.heading)}:wght@400;500;600;700`);
  }

  if (BODY_FAMILIES_WIDE_WEIGHT.has(fonts.body)) {
    families.push(
      `family=${encode(fonts.body)}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400`,
    );
  } else {
    families.push(
      `family=${encode(fonts.body)}:ital,wght@0,400;0,500;0,600;1,400`,
    );
  }

  if (fonts.mono) {
    families.push(`family=${encode(fonts.mono)}:wght@400;500;700`);
  }

  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}
