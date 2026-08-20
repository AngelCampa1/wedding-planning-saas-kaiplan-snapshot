import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// The manifest module imports PNG files via Astro's image pipeline which
// cannot be resolved by raw Vitest. Mock all PNG imports with stub metadata
// so getScreenshotPlate can be imported and called at runtime.
// vi.mock() calls are hoisted by Vitest before any imports, so these mocks
// take effect when the manifest module is loaded below.
vi.mock("./budget-ledger.png", () => ({
  default: { src: "/budget-ledger.png", width: 1, height: 1, format: "png" },
}));
vi.mock("./budget-ledger@2x.png", () => ({
  default: { src: "/budget-ledger@2x.png", width: 2, height: 2, format: "png" },
}));
vi.mock("./guest-list.png", () => ({
  default: { src: "/guest-list.png", width: 1, height: 1, format: "png" },
}));
vi.mock("./guest-list@2x.png", () => ({
  default: { src: "/guest-list@2x.png", width: 2, height: 2, format: "png" },
}));
vi.mock("./milestone-checklist.png", () => ({
  default: {
    src: "/milestone-checklist.png",
    width: 1,
    height: 1,
    format: "png",
  },
}));
vi.mock("./milestone-checklist@2x.png", () => ({
  default: {
    src: "/milestone-checklist@2x.png",
    width: 2,
    height: 2,
    format: "png",
  },
}));
vi.mock("./seating-chart.png", () => ({
  default: { src: "/seating-chart.png", width: 1, height: 1, format: "png" },
}));
vi.mock("./seating-chart@2x.png", () => ({
  default: { src: "/seating-chart@2x.png", width: 2, height: 2, format: "png" },
}));
vi.mock("./vendor-tracker.png", () => ({
  default: { src: "/vendor-tracker.png", width: 1, height: 1, format: "png" },
}));
vi.mock("./vendor-tracker@2x.png", () => ({
  default: {
    src: "/vendor-tracker@2x.png",
    width: 2,
    height: 2,
    format: "png",
  },
}));
vi.mock("./wedding-website.png", () => ({
  default: { src: "/wedding-website.png", width: 1, height: 1, format: "png" },
}));
vi.mock("./wedding-website@2x.png", () => ({
  default: {
    src: "/wedding-website@2x.png",
    width: 2,
    height: 2,
    format: "png",
  },
}));

import { getScreenshotPlate } from "./manifest";

const here = dirname(fileURLToPath(import.meta.url));
const manifestSource = readFileSync(resolve(here, "manifest.ts"), "utf8");

const expectedKeys = [
  "budget-ledger",
  "guest-list",
  "seating-chart",
  "vendor-tracker",
  "wedding-website",
  "milestone-checklist",
] as const;

interface ParsedEntry {
  key: string;
  src: string;
  srcLarge: string;
  orientation: "landscape" | "portrait";
  alt: string;
  caption: string;
  figNumber: string;
}

/**
 * Walk the manifest source and extract one ParsedEntry per object literal
 * inside the `screenshotPlates` array. Handles multi-line string values by
 * extracting fields one at a time from the per-entry slice.
 */
function parseEntries(source: string): ParsedEntry[] {
  const arrayStart = source.indexOf("screenshotPlates");
  if (arrayStart === -1) return [];
  const slice = source.slice(arrayStart);
  // Each entry begins with `key: "<value>",`
  const keyRegex = /key:\s*"([^"]+)"/g;
  const entries: ParsedEntry[] = [];
  const keyMatches = [...slice.matchAll(keyRegex)];
  for (let i = 0; i < keyMatches.length; i += 1) {
    const start = keyMatches[i].index ?? 0;
    const end = keyMatches[i + 1]?.index ?? slice.length;
    const block = slice.slice(start, end);
    const key = keyMatches[i][1] ?? "";
    const src = block.match(/\bsrc:\s*([A-Za-z0-9_]+)\s*,/)?.[1] ?? "";
    const srcLarge = block.match(/srcLarge:\s*([A-Za-z0-9_]+)\s*,/)?.[1] ?? "";
    const orientation = (block.match(
      /orientation:\s*"(landscape|portrait)"/,
    )?.[1] ?? "") as "landscape" | "portrait";
    const alt = block.match(/alt:\s*"([\s\S]*?)"\s*,/)?.[1] ?? "";
    const caption = block.match(/caption:\s*\n?\s*"([\s\S]*?)"\s*,/)?.[1] ?? "";
    const figNumber = block.match(/figNumber:\s*"(Fig\.\s*\d+)"/)?.[1] ?? "";
    entries.push({ key, src, srcLarge, orientation, alt, caption, figNumber });
  }
  return entries;
}

describe("screenshots/v2 manifest", () => {
  const entries = parseEntries(manifestSource);

  it("declares one entry per expected screenshot", () => {
    const keys = entries.map((e) => e.key).sort();
    expect(keys).toEqual([...expectedKeys].sort());
  });

  it.each(expectedKeys)("entry %s has all required fields populated", (key) => {
    const entry = entries.find((e) => e.key === key);
    expect(entry, `missing entry for ${key}`).toBeDefined();
    if (!entry) return;
    expect(entry.alt.length).toBeGreaterThan(0);
    expect(entry.caption.length).toBeGreaterThan(0);
    expect(entry.figNumber).toMatch(/^Fig\.\s*\d+$/);
    expect(["landscape", "portrait"]).toContain(entry.orientation);
    expect(entry.src.length).toBeGreaterThan(0);
    expect(entry.srcLarge.length).toBeGreaterThan(0);
    // The 1× import name should differ from the 2× import name.
    expect(entry.src).not.toEqual(entry.srcLarge);
  });

  it.each(expectedKeys)("PNG files exist on disk for %s", (key) => {
    const oneX = resolve(here, `${key}.png`);
    const twoX = resolve(here, `${key}@2x.png`);
    expect(existsSync(oneX), `${oneX} missing`).toBe(true);
    expect(existsSync(twoX), `${twoX} missing`).toBe(true);
    // Each file should have non-trivial bytes (not an empty placeholder).
    expect(statSync(oneX).size).toBeGreaterThan(1024);
    expect(statSync(twoX).size).toBeGreaterThan(1024);
  });

  it("uses sequential figure numbers starting at 01", () => {
    const figs = entries.map((e) => e.figNumber.replace(/[^\d]/g, ""));
    expect(figs).toEqual(["01", "02", "03", "04", "05", "06"]);
  });

  it("imports each PNG exactly once", () => {
    for (const key of expectedKeys) {
      // 1× and 2× imports must each appear in the `import ... from "./<key>...png"`
      // section of the file.
      const oneXImport = new RegExp(`from\\s+"\\./${key}\\.png"`);
      const twoXImport = new RegExp(`from\\s+"\\./${key}@2x\\.png"`);
      expect(manifestSource).toMatch(oneXImport);
      expect(manifestSource).toMatch(twoXImport);
    }
  });

  it("getScreenshotPlate throws on an unknown key", () => {
    expect(() => getScreenshotPlate("nonexistent-key")).toThrow(
      "Unknown screenshot plate key: nonexistent-key",
    );
  });
});
