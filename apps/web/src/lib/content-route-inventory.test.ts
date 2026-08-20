import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import {
  getContentRouteInventory,
  getIndexableContentPageUrls,
  getPaginatedHubPageUrls,
  getSitemapCustomPageUrls,
} from "./content-route-inventory";

function writeFile(dir: string, name: string, content: string): void {
  writeFileSync(join(dir, name), content, "utf-8");
}

function makeFrontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `---\n${lines}\n---\n\nBody content here.`;
}

describe("getContentRouteInventory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "content-route-inventory-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("collects indexable paths across every public content family", () => {
    const alternativesDir = join(tmpDir, "alternatives");
    mkdirSync(alternativesDir);
    writeFile(
      alternativesDir,
      "the-knot-alternative.md",
      `---\ncompetitor:\n  slug: "the-knot"\n---\n\nBody.`,
    );

    const comparisonsDir = join(tmpDir, "comparisons");
    mkdirSync(comparisonsDir);
    writeFile(comparisonsDir, "the-knot-vs-zola.md", makeFrontmatter({}));

    const pricingDir = join(tmpDir, "pricing-breakdowns");
    mkdirSync(pricingDir);
    writeFile(pricingDir, "zola-pricing.md", makeFrontmatter({}));

    const listiclesDir = join(tmpDir, "listicles");
    mkdirSync(listiclesDir);
    writeFile(listiclesDir, "best-wedding-apps.md", makeFrontmatter({}));

    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    writeFile(guidesDir, "wedding-budget-guide.md", makeFrontmatter({}));

    const leadMagnetsDir = join(tmpDir, "lead-magnets");
    mkdirSync(leadMagnetsDir);
    writeFile(leadMagnetsDir, "budget-template.md", makeFrontmatter({}));

    const inventory = getContentRouteInventory(tmpDir);

    expect(inventory.indexablePaths).toEqual(
      new Set([
        "/compare/alternatives/the-knot/",
        "/compare/versus/the-knot-vs-zola/",
        "/compare/pricing/zola-pricing/",
        "/resources/best/best-wedding-apps/",
        "/resources/guides/wedding-budget-guide/",
        "/free/budget-template/",
      ]),
    );
    expect(inventory.noindexPaths.size).toBe(0);
    expect(inventory.totalCountsByCollection).toEqual(
      new Map([
        ["alternatives", 1],
        ["comparisons", 1],
        ["pricing-breakdowns", 1],
        ["listicles", 1],
        ["guides", 1],
        ["lead-magnets", 1],
      ]),
    );
    expect(inventory.indexableCountsByCollection).toEqual(
      new Map([
        ["alternatives", 1],
        ["comparisons", 1],
        ["pricing-breakdowns", 1],
        ["listicles", 1],
        ["guides", 1],
        ["lead-magnets", 1],
      ]),
    );
  });

  it("separates noindex paths from indexable ones", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    writeFile(
      guidesDir,
      "public-guide.md",
      makeFrontmatter({ title: '"Public guide"' }),
    );
    writeFile(
      guidesDir,
      "hidden-guide.md",
      makeFrontmatter({ noindex: "true" }),
    );

    const inventory = getContentRouteInventory(tmpDir);

    expect(inventory.allPaths).toEqual(
      new Set([
        "/resources/guides/public-guide/",
        "/resources/guides/hidden-guide/",
      ]),
    );
    expect(inventory.indexablePaths).toEqual(
      new Set(["/resources/guides/public-guide/"]),
    );
    expect(inventory.noindexPaths).toEqual(
      new Set(["/resources/guides/hidden-guide/"]),
    );
    expect(inventory.totalCountsByCollection).toEqual(new Map([["guides", 2]]));
    expect(inventory.indexableCountsByCollection).toEqual(
      new Map([["guides", 1]]),
    );
  });

  it("tracks updatedAt dates for indexable content only", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    writeFile(
      guidesDir,
      "public-guide.md",
      makeFrontmatter({
        title: '"Public guide"',
        updatedAt: '"2026-04-16"',
      }),
    );
    writeFile(
      guidesDir,
      "hidden-guide.md",
      makeFrontmatter({
        noindex: "true",
        updatedAt: '"2026-04-17"',
      }),
    );

    const inventory = getContentRouteInventory(tmpDir);

    expect(inventory.updatedAtByPath).toEqual(
      new Map([["/resources/guides/public-guide/", "2026-04-16"]]),
    );
  });

  it("formats a Date-typed updatedAt field from YAML as YYYY-MM-DD", () => {
    // gray-matter parses bare YAML dates (e.g. `2026-03-10`) as JS Date objects.
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    // Write the date without quotes so gray-matter parses it as a Date.
    writeFile(
      guidesDir,
      "date-typed.md",
      `---\ntitle: "Date typed"\nupdatedAt: 2026-03-10\n---\n\nBody.`,
    );

    const inventory = getContentRouteInventory(tmpDir);

    expect(inventory.updatedAtByPath).toEqual(
      new Map([["/resources/guides/date-typed/", "2026-03-10"]]),
    );
  });

  it("ignores markdown that uses four hyphens instead of a real frontmatter delimiter", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    writeFile(
      guidesDir,
      "bad-delimiter.md",
      `----\ntitle: "Bad delimiter"\n----\n\nBody.`,
    );

    const inventory = getContentRouteInventory(tmpDir);

    expect(inventory.allPaths).toEqual(new Set());
  });

  it("continues inventory when a file is missing its closing frontmatter delimiter", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    writeFile(
      guidesDir,
      "valid-guide.md",
      makeFrontmatter({ title: '"Valid guide"' }),
    );
    writeFile(
      guidesDir,
      "missing-close.md",
      `---\ntitle: "Missing close"\n\nBody.`,
    );

    const inventory = getContentRouteInventory(tmpDir);

    expect(inventory.allPaths).toEqual(
      new Set(["/resources/guides/valid-guide/"]),
    );
  });

  it("continues inventory when one file has malformed YAML", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    writeFile(
      guidesDir,
      "valid-guide.md",
      makeFrontmatter({ title: '"Valid guide"' }),
    );
    writeFile(
      guidesDir,
      "bad-yaml.md",
      `---\ntitle: "Bad\ntags: [one, two\n---\n\nBody.`,
    );

    const inventory = getContentRouteInventory(tmpDir);

    expect(inventory.allPaths).toEqual(
      new Set(["/resources/guides/valid-guide/"]),
    );
  });
});

describe("compare route inventory", () => {
  it("does not keep concrete compare pages that overlap generated content routes", () => {
    const repoRoot = resolve();
    const overlappingRoutes = [
      "apps/web/src/pages/compare/alternatives/the-knot.astro",
      "apps/web/src/pages/compare/versus/the-knot-vs-zola.astro",
      "apps/web/src/pages/compare/pricing/free-vs-paid-wedding-apps.astro",
    ];

    for (const route of overlappingRoutes) {
      expect(existsSync(join(repoRoot, route))).toBe(false);
    }
  });
});

describe("getIndexableContentPageUrls", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "content-route-urls-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("builds absolute urls for sitemap custom pages", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    writeFile(guidesDir, "wedding-budget-guide.md", makeFrontmatter({}));

    expect(getIndexableContentPageUrls("https://kaiplan.app", tmpDir)).toEqual([
      "https://kaiplan.app/resources/guides/wedding-budget-guide/",
    ]);
  });
});

describe("getPaginatedHubPageUrls", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "content-route-pagination-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("builds page-2-plus urls for paginated hub routes", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    for (let index = 1; index <= 21; index += 1) {
      writeFile(guidesDir, `guide-${index}.md`, makeFrontmatter({}));
    }

    expect(getPaginatedHubPageUrls("https://kaiplan.app", tmpDir)).toEqual([
      "https://kaiplan.app/resources/guides/2/",
      "https://kaiplan.app/resources/guides/3/",
    ]);
  });

  it("does not count noindex entries toward hub pagination", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    for (let index = 1; index <= 10; index += 1) {
      writeFile(guidesDir, `guide-${index}.md`, makeFrontmatter({}));
    }
    writeFile(
      guidesDir,
      "hidden-guide.md",
      makeFrontmatter({ noindex: "true" }),
    );

    expect(getPaginatedHubPageUrls("https://kaiplan.app", tmpDir)).toEqual([]);
  });
});

describe("getSitemapCustomPageUrls", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "content-route-sitemap-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("combines indexable content urls with paginated hub urls", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    for (let index = 1; index <= 11; index += 1) {
      writeFile(guidesDir, `guide-${index}.md`, makeFrontmatter({}));
    }
    writeFile(
      guidesDir,
      "hidden-guide.md",
      makeFrontmatter({ noindex: "true" }),
    );

    const urls = getSitemapCustomPageUrls("https://kaiplan.app", tmpDir);

    expect(urls).toContain("https://kaiplan.app/resources/guides/guide-1/");
    expect(urls).toContain("https://kaiplan.app/resources/guides/guide-11/");
    expect(urls).toContain("https://kaiplan.app/resources/guides/2/");
    expect(urls).not.toContain(
      "https://kaiplan.app/resources/guides/hidden-guide/",
    );
  });
});
