import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { getContentRouteInventory } from "./content-route-inventory";
import { getResourcePillars } from "./resource-pillars";

const contentDir = resolve("src/content");
const pagesDir = resolve("src/pages");

const staticIndexableRoutes = new Set([
  "/",
  "/compare/",
  "/compare/alternatives/",
  "/compare/pricing/",
  "/compare/versus/",
  "/features/",
  "/free/",
  "/help/",
  "/pricing/",
  "/resources/",
  "/resources/best/",
  "/resources/guides/",
  "/templates/",
  "/privacy/",
  "/terms/",
]);

for (const pillar of getResourcePillars()) {
  staticIndexableRoutes.add(pillar.href);
}

function contentFiles(): string[] {
  const collections = readdirSync(contentDir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  );

  return collections.flatMap((collection) => {
    const collectionDir = join(contentDir, collection.name);
    return readdirSync(collectionDir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => join(collectionDir, file));
  });
}

function normalizePath(path: string): string {
  if (path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

describe("internal linking configuration", () => {
  it("uses a Resources megamenu with every required SEO section", () => {
    const resourcesItem = siteConfig.nav?.items.find(
      (item) => item.label === "Resources",
    );

    expect(resourcesItem?.href).toBe("/resources/");
    expect(
      resourcesItem?.megaMenu?.groups.map((group) => group.heading),
    ).toEqual(["Directories", "Planning Hubs", "Compare & Tools"]);
    expect(
      resourcesItem?.megaMenu?.groups.every((group) => group.links.length > 0),
    ).toBe(true);
  });

  it("keeps every Resources megamenu link pointed at a known indexable route", () => {
    const inventory = getContentRouteInventory(contentDir);
    const knownRoutes = new Set([
      ...Array.from(inventory.indexablePaths, normalizePath),
      ...staticIndexableRoutes,
    ]);
    const menuLinks =
      siteConfig.nav?.items
        .flatMap((item) => item.megaMenu?.groups ?? [])
        .flatMap((group) => group.links) ?? [];

    expect(menuLinks.length).toBeGreaterThan(12);

    const missing = menuLinks
      .map((link) => link.href)
      .filter((href) => !knownRoutes.has(normalizePath(href)));

    expect(missing).toEqual([]);
  });

  it("keeps Resources megamenu links on hub and directory routes only", () => {
    const menuLinks =
      siteConfig.nav?.items
        .find((item) => item.label === "Resources")
        ?.megaMenu?.groups.flatMap((group) => group.links) ?? [];
    const directDetailPrefixes = [
      "/resources/guides/",
      "/resources/best/",
      "/compare/alternatives/",
      "/compare/versus/",
      "/compare/pricing/",
      "/free/",
    ];
    const allowedDirectories = new Set([
      "/resources/guides/",
      "/resources/best/",
      "/compare/alternatives/",
      "/compare/versus/",
      "/compare/pricing/",
    ]);
    const directDetailLinks = menuLinks
      .map((link) => link.href)
      .filter((href) => !allowedDirectories.has(href))
      .filter((href) =>
        directDetailPrefixes.some((prefix) => href.startsWith(prefix)),
      );

    expect(directDetailLinks).toEqual([]);
  });

  it("makes the top-level Resources and Compare directories prerendered link hubs", () => {
    for (const page of ["resources/index.astro", "compare/index.astro"]) {
      const source = readFileSync(join(pagesDir, page), "utf8");
      expect(source).toContain("export const prerender = true");
    }
  });

  it("requires every frontmatter relatedPages href to resolve to an indexable route", () => {
    const inventory = getContentRouteInventory(contentDir);
    const knownRoutes = new Set([
      ...Array.from(inventory.allPaths, normalizePath),
      ...staticIndexableRoutes,
    ]);
    const failures: string[] = [];

    for (const filePath of contentFiles()) {
      const parsed = matter(readFileSync(filePath, "utf8"));
      const relatedPages = Array.isArray(parsed.data.relatedPages)
        ? parsed.data.relatedPages
        : [];

      for (const href of relatedPages) {
        if (typeof href !== "string") continue;
        if (!knownRoutes.has(normalizePath(href))) {
          failures.push(`${filePath}: ${href}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("does not keep concrete lead-magnet pages beside the dynamic slug route", () => {
    const freePagesDir = join(pagesDir, "free");
    const concretePages = readdirSync(freePagesDir).filter(
      (file) => !file.includes("[") && file.endsWith(".astro"),
    );

    expect(existsSync(join(freePagesDir, "[slug].astro"))).toBe(true);
    expect(concretePages).toEqual([]);
  });

  it("keeps dynamic lead-magnet content inside the email gate", () => {
    const source = readFileSync(join(pagesDir, "free", "[slug].astro"), "utf8");

    expect(source).toContain("splitContentAtGate(");
    expect(source).toContain("teaserHtml={teaser}");
    expect(source).toContain("gatedHtml={gated}");
    expect(source).not.toContain("<Content />");
    expect(source).not.toContain('Astro.slots.render("default")');
  });
});
