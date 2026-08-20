import { describe, it, expect } from "vitest";
import {
  relativeLuminance,
  contrastRatio,
  meetsAA,
  meetsAAA,
} from "./contrast.js";
import {
  darkModeVariant,
  generateScale,
  generateThemeCSS,
} from "./generate-theme-css.js";

// ── Unit tests for contrast utilities ────────────────────────────────────────

describe("relativeLuminance", () => {
  it("returns 0 for black", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 4);
  });

  it("returns 1 for white", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 4);
  });

  it("handles 3-digit hex shorthand", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 4);
    expect(relativeLuminance("#000")).toBeCloseTo(0, 4);
  });

  it("returns ~0.2126 for pure red (#ff0000)", () => {
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.2126, 3);
  });

  it("returns ~0.7152 for pure green (#00ff00)", () => {
    expect(relativeLuminance("#00ff00")).toBeCloseTo(0.7152, 3);
  });

  it("returns ~0.0722 for pure blue (#0000ff)", () => {
    expect(relativeLuminance("#0000ff")).toBeCloseTo(0.0722, 3);
  });

  it("handles mid-gray correctly", () => {
    // #808080 → sRGB 0.502, linear ~0.216
    const lum = relativeLuminance("#808080");
    expect(lum).toBeGreaterThan(0.2);
    expect(lum).toBeLessThan(0.25);
  });
});

describe("contrastRatio", () => {
  it("returns 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("returns 21:1 for white on black (order independent)", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });

  it("returns 1:1 for same color", () => {
    expect(contrastRatio("#abcdef", "#abcdef")).toBeCloseTo(1, 1);
  });

  it("returns expected ratio for known pair", () => {
    // White on mid-gray: luminance white=1, gray~0.216
    // ratio = (1+0.05)/(0.216+0.05) ≈ 3.95
    const ratio = contrastRatio("#ffffff", "#808080");
    expect(ratio).toBeGreaterThan(3.9);
    expect(ratio).toBeLessThan(4.1);
  });
});

describe("meetsAA", () => {
  it("returns true for black on white (normal text)", () => {
    expect(meetsAA("#000000", "#ffffff")).toBe(true);
  });

  it("returns false for low-contrast pair (normal text)", () => {
    // Light gray on white
    expect(meetsAA("#cccccc", "#ffffff")).toBe(false);
  });

  it("uses 3:1 threshold for large text", () => {
    // Find a pair that passes 3:1 but fails 4.5:1
    // #767676 on white ≈ 4.54:1 — passes both
    // #959595 on white ≈ 2.85:1 — fails both
    // #888888 on white ≈ 3.54:1 — passes large, fails normal
    expect(meetsAA("#888888", "#ffffff", true)).toBe(true);
    expect(meetsAA("#888888", "#ffffff", false)).toBe(false);
  });
});

describe("meetsAAA", () => {
  it("returns true for black on white (normal text)", () => {
    expect(meetsAAA("#000000", "#ffffff")).toBe(true);
  });

  it("returns false for a pair that meets AA but not AAA", () => {
    // #767676 on white ≈ 4.54:1 — passes AA (4.5:1) but fails AAA (7:1)
    expect(meetsAA("#767676", "#ffffff")).toBe(true);
    expect(meetsAAA("#767676", "#ffffff")).toBe(false);
  });

  it("uses 4.5:1 threshold for large text", () => {
    // #767676 on white ≈ 4.54:1 — passes AAA large (4.5:1)
    expect(meetsAAA("#767676", "#ffffff", true)).toBe(true);
    expect(meetsAAA("#767676", "#ffffff", false)).toBe(false);
  });
});

// ── Dark mode contrast audit across all 22 sites ─────────────────────────────

/**
 * Site theme definitions for all 22 sites.
 * Sites with tinted surfaces include custom text/muted values.
 *
 * SYNC WARNING: These values are copied from each site's src/config/site.ts.
 * If a site's primary/accent/surface/text/muted colors change, update here too.
 *
 * To verify sync, run from repo root:
 *   grep -E 'primary:|accent:|surface:|text:|muted:' sites/{site}/src/config/site.ts
 * and compare against the SITES array below.
 */
interface SiteTheme {
  name: string;
  primary: string;
  accent: string;
  surface?: string;
  text?: string;
  muted?: string;
}

const SITES: SiteTheme[] = [
  { name: "a11yproof", primary: "#4f46e5", accent: "#10b981" },
  { name: "birvix", primary: "#0284c7", accent: "#f97316" },
  { name: "boardstack", primary: "#0d9488", accent: "#f59e0b" },
  { name: "caeluslaw", primary: "#1e3a5f", accent: "#c49a2a" },
  { name: "crewroute", primary: "#1e40af", accent: "#f59e0b" },
  {
    name: "floriva",
    primary: "#4f6d57",
    accent: "#c17b84",
    surface: "#fdf8f3",
    text: "#2d2a27",
    muted: "#9a9088",
  },
  { name: "grantpipe", primary: "#065f46", accent: "#e07a5f" },
  {
    name: "horiva",
    primary: "#6B2D8B",
    accent: "#C4622D",
    surface: "#FDF8F4",
    text: "#1C1117",
    muted: "#7A6E72",
  },
  {
    name: "kaiplan",
    primary: "#B0432A",
    accent: "#3A4A2C",
    surface: "#F5F1EA",
    text: "#171311",
    muted: "#3D3530",
  },
  { name: "marginlock", primary: "#059669", accent: "#f59e0b" },
  {
    name: "mutra",
    primary: "#7c3aed",
    accent: "#f472b6",
    surface: "#fdf4ff",
    text: "#1a0a2e",
    muted: "#6b7280",
  },
  {
    name: "ondara",
    primary: "#6b4faa",
    accent: "#d4a847",
    surface: "#faf8f5",
    text: "#1c1917",
    muted: "#8b7355",
  },
  { name: "orderdock", primary: "#0f4c81", accent: "#10b981" },
  { name: "pebbledesk", primary: "#4f46e5", accent: "#f59e0b" },
  { name: "phiguard", primary: "#1e3a8a", accent: "#10b981" },
  { name: "reachally", primary: "#4f46e5", accent: "#10b981" },
  { name: "restrictedbooks", primary: "#355e3b", accent: "#d4622d" },
  { name: "sweepops", primary: "#0891b2", accent: "#f97316" },
  {
    name: "thalvi",
    primary: "#B8725A",
    accent: "#6B8F71",
    surface: "#FAF7F2",
    text: "#1E1814",
    muted: "#8A7F7A",
  },
  {
    name: "threvi",
    primary: "#D4725E",
    accent: "#5BA8A0",
    surface: "#FBF8F5",
    text: "#2D2016",
    muted: "#9C8A7A",
  },
  { name: "truliv", primary: "#C93B2A", accent: "#0ea5e9" },
  { name: "validea", primary: "#6d28d9", accent: "#06b6d4" },
];

// Default dark mode colors (from Tailwind slate palette used by the theme system)
const DEFAULT_DARK_SURFACE = "#0f172a";
const DEFAULT_DARK_SECONDARY = "#1e293b";
const DEFAULT_DARK_TEXT = "#f1f5f9";
const DEFAULT_DARK_MUTED = "#94a3b8";

const MIN_RATIO = 4.5;

type PairDef = {
  label: string;
  fg: string;
  bg: string;
  minRatio: number;
};

function buildPairsForSite(site: SiteTheme): PairDef[] {
  const darkPrimary = darkModeVariant(site.primary);
  const darkAccent = darkModeVariant(site.accent);
  const accentScale = generateScale(site.accent);

  // For tinted-surface sites, the dark surface is computed from the tint.
  // The theme system uses generateDarkNeutralScale which maps step 50 → L=12.
  // For the audit we use the default dark colors since no site overrides theme.dark.
  const darkSurface = DEFAULT_DARK_SURFACE;
  const darkSecondary = DEFAULT_DARK_SECONDARY;
  const darkText = DEFAULT_DARK_TEXT;
  const darkMuted = DEFAULT_DARK_MUTED;

  return [
    {
      label: "body text on surface",
      fg: darkText,
      bg: darkSurface,
      minRatio: MIN_RATIO,
    },
    {
      label: "muted on surface",
      fg: darkMuted,
      bg: darkSurface,
      minRatio: MIN_RATIO,
    },
    {
      label: "primary on surface",
      fg: darkPrimary,
      bg: darkSurface,
      minRatio: MIN_RATIO,
    },
    {
      label: "accent on surface",
      fg: darkAccent,
      bg: darkSurface,
      minRatio: MIN_RATIO,
    },
    {
      label: "primary on secondary",
      fg: darkPrimary,
      bg: darkSecondary,
      minRatio: MIN_RATIO,
    },
    {
      label: "muted on secondary",
      fg: darkMuted,
      bg: darkSecondary,
      minRatio: MIN_RATIO,
    },
    {
      label: "button text on accent",
      fg: accentScale[950],
      bg: accentScale[500],
      minRatio: MIN_RATIO,
    },
  ];
}

describe("dark mode contrast audit", () => {
  const testCases: Array<{
    siteName: string;
    label: string;
    fg: string;
    bg: string;
    minRatio: number;
  }> = [];

  for (const site of SITES) {
    const pairs = buildPairsForSite(site);
    for (const pair of pairs) {
      testCases.push({
        siteName: site.name,
        label: pair.label,
        fg: pair.fg,
        bg: pair.bg,
        minRatio: pair.minRatio,
      });
    }
  }

  it.each(testCases)(
    "[$siteName] $label: fg=$fg bg=$bg must meet $minRatio:1",
    ({ siteName, label, fg, bg, minRatio }) => {
      const ratio = contrastRatio(fg, bg);
      expect(
        ratio,
        `[${siteName}] ${label}: ${ratio.toFixed(2)}:1 < ${minRatio}:1 required`,
      ).toBeGreaterThanOrEqual(minRatio);
    },
  );
});

describe("Horiva generated theme CSS", () => {
  const horivaTheme = {
    primary: "#6B2D8B",
    accent: "#C4622D",
    surface: "#FDF8F4",
    text: "#1C1117",
    muted: "#7A6E72",
    fonts: { heading: "Fraunces", body: "DM Sans" },
  } as const;

  it("does not emit a generated dark-mode block", () => {
    const css = generateThemeCSS(horivaTheme);

    expect(css).not.toContain("@media (prefers-color-scheme: dark)");
    expect(css).not.toContain(":root.dark");
    expect(css).not.toContain("--site-surface-dark:");
  });
});
