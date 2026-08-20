import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { truncateMetaDescription } from "@kaiplan/marketing";
import {
  COLLECTION_ROUTE_MAP,
  getContentRouteInventory,
} from "./content-route-inventory";

const CONTENT_DIR = resolve("src/content");
const SITE_CONFIG_PATH = resolve("src/config/site.ts");
const HIGH_VALUE_PAGE_META = [
  {
    path: resolve("src/pages/features.astro"),
    description:
      "Explore the connected Kaiplan workspace for wedding budget, guests, RSVP, seating, vendors, website, and checklist planning without vendor ads.",
  },
  {
    path: resolve("src/pages/resources/index.astro"),
    description:
      "Read wedding planning guides, pricing breakdowns, comparisons, and free tools for couples making budget and vendor decisions without affiliate bias.",
  },
  {
    path: resolve("src/pages/compare/index.astro"),
    description:
      "Compare wedding planning software, pricing, vendor ads, budget tools, guest management, and websites before choosing the platform for your wedding.",
  },
];
const BANNED_PATTERNS = [
  "NerdWallet / Microsoft 365",
  "https://www.microsoft.com/en-us/microsoft-365-life-hacks/budgeting/hidden-wedding-costs-and-how-to-budget-for-them",
  "74% of newlyweds exceeded their wedding budget",
  "74% of couples exceed their wedding budget",
];
const EXPECTED_STAT =
  'stat: "74% of newly married couples went over their originally expected budget."';
const EXPECTED_SOURCE = 'source: "Zola First Look Report 2025"';
const EXPECTED_SOURCE_URL =
  'sourceUrl: "https://www.zola.com/expert-advice/the-first-look-report-2025"';
const EXPECTED_SITE_COPY = [
  "74% of newly married couples go over their originally expected budget",
  "Zola First Look 2025",
];
const META_DESCRIPTION_MIN_LENGTH = 70;
const META_DESCRIPTION_MAX_LENGTH = 160;
const STATIC_PAGE_META = [
  {
    path: resolve("src/pages/privacy.astro"),
    description:
      "Learn what Kaiplan collects, how wedding planning data is used, which processors support the app, and how to request data removal.",
  },
  {
    path: resolve("src/pages/terms.astro"),
    description:
      "Read the terms for using Kaiplan, including account rules, billing, lifetime access, acceptable use, liability limits, and contact details.",
  },
];

function collectContentFiles() {
  const filePaths: string[] = [];

  for (const { dir } of COLLECTION_ROUTE_MAP) {
    const dirPath = join(CONTENT_DIR, dir);
    let markdownEntries: string[];

    try {
      markdownEntries = readdirSync(dirPath).filter((file) =>
        file.endsWith(".md"),
      );
    } catch {
      continue;
    }

    for (const entry of markdownEntries) {
      filePaths.push(join(dirPath, entry));
    }
  }

  return filePaths;
}

describe("seo content audit", () => {
  it("keeps indexable content routes unique and dated", () => {
    const inventory = getContentRouteInventory(CONTENT_DIR);
    const totalContentCount = Array.from(
      inventory.totalCountsByCollection.values(),
    ).reduce((sum, count) => sum + count, 0);

    expect(inventory.allPaths.size).toBe(totalContentCount);
    expect(inventory.updatedAtByPath.size).toBe(inventory.indexablePaths.size);
  });

  it("keeps indexable content titles and meta descriptions extractable", () => {
    const failures: string[] = [];

    for (const filePath of collectContentFiles()) {
      const { data } = matter(readFileSync(filePath, "utf8"));
      if (data.noindex === true) continue;

      const title = typeof data.title === "string" ? data.title : "";
      const description =
        typeof data.description === "string" ? data.description : "";
      const preservesAuthoredMetadata = data.preserveMetaTagCopy === true;
      const renderedDescription = preservesAuthoredMetadata
        ? description
        : truncateMetaDescription(description);

      if (title.length < 20 || title.length > 90) {
        failures.push(`title length ${title.length} :: ${filePath}`);
      }
      if (
        renderedDescription.length < META_DESCRIPTION_MIN_LENGTH ||
        renderedDescription.length > META_DESCRIPTION_MAX_LENGTH
      ) {
        failures.push(
          `description length ${renderedDescription.length} :: ${filePath}`,
        );
      }
      if (preservesAuthoredMetadata && description.length > 160) {
        failures.push(`preserved description too long :: ${filePath}`);
      }
      if (title.includes("...") || renderedDescription.includes("...")) {
        failures.push(`truncated metadata :: ${filePath}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("requires citable statistics to include source attribution", () => {
    const failures: string[] = [];

    for (const filePath of collectContentFiles()) {
      const raw = readFileSync(filePath, "utf8");
      const statBlocks =
        raw.match(
          /-\s+stat:\s*["'][\s\S]*?(?=\n\s*-\s+stat:|\n[a-zA-Z][\w-]*:|\n---|$)/g,
        ) ?? [];

      for (const block of statBlocks) {
        const hasSource = /^\s+source:\s*["'][^"']+["']\s*$/m.test(block);
        const hasSourceUrl =
          /^\s+sourceUrl:\s*["']https?:\/\/[^"']+["']\s*$/m.test(block) ||
          /source:\s*["']([^"']*(Kaiplan|Estimated|Industry|internal|public materials|WeddingWire|The Knot|Trustpilot|Reddit|NY Post|Zola|workflow analysis|pricing model analysis|Congressional|Crunchbase|Minted|EIN Presswire|Kazerouni|press releases|Kande|Brides|Wedding statistics)[^"']*)["']/i.test(
            block,
          );

        if (!hasSource || !hasSourceUrl) {
          failures.push(`weak statistic source :: ${filePath} :: ${block}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("removes legacy budget-stat citations and wording from the content corpus", () => {
    const failures: string[] = [];

    for (const filePath of [...collectContentFiles(), SITE_CONFIG_PATH]) {
      const raw = readFileSync(filePath, "utf8");

      for (const pattern of BANNED_PATTERNS) {
        if (raw.includes(pattern)) {
          failures.push(`${pattern} :: ${filePath}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("requires the 74% budget-overrun claim to keep the Zola source and source URL", () => {
    const failures: string[] = [];

    for (const filePath of collectContentFiles()) {
      const raw = readFileSync(filePath, "utf8");
      if (!raw.includes(EXPECTED_STAT)) {
        continue;
      }

      if (!raw.includes(EXPECTED_SOURCE)) {
        failures.push(`missing Zola source :: ${filePath}`);
      }

      if (!raw.includes(EXPECTED_SOURCE_URL)) {
        failures.push(`missing Zola sourceUrl :: ${filePath}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps shared site copy aligned with the approved 74% wording and source label", () => {
    const raw = readFileSync(SITE_CONFIG_PATH, "utf8");

    for (const pattern of EXPECTED_SITE_COPY) {
      expect(raw).toContain(pattern);
    }
  });

  it("keeps high-value hub meta descriptions substantial and untruncated", () => {
    for (const page of HIGH_VALUE_PAGE_META) {
      const raw = readFileSync(page.path, "utf8");
      expect(raw).toContain(`description="${page.description}"`);
      expect(page.description.length).toBeGreaterThanOrEqual(130);
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(page.description).not.toContain("...");
      expect(page.description).not.toContain("…");
    }
  });

  it("keeps static legal page meta descriptions substantial", () => {
    for (const page of STATIC_PAGE_META) {
      const raw = readFileSync(page.path, "utf8");
      expect(raw).toContain(`description={\`${page.description}\`}`);
      expect(page.description.length).toBeGreaterThanOrEqual(120);
      expect(page.description.length).toBeLessThanOrEqual(160);
    }
  });
});
