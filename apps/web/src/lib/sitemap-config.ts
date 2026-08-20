import { resolve } from "path";
import {
  getContentRouteInventory,
  getSitemapCustomPageUrls,
} from "./content-route-inventory";
import { getPublishedMarketingPageUrls } from "./published-marketing-route-inventory";
import { getResourcePillars } from "./resource-pillars";

export interface SitemapConfigOptions {
  customPages: string[];
  lastmodDates: Record<string, string>;
  filter: (page: string) => boolean;
}

const STATIC_PAGE_LASTMOD_DATES: Record<string, string> = {
  "/": "2026-04-16",
  "/about/": "2026-04-16",
  "/compare/": "2026-04-16",
  "/features/": "2026-04-16",
  "/help/": "2026-04-16",
  "/pricing/": "2026-04-16",
  "/pricing.txt": "2026-05-12",
  "/privacy/": "2026-04-16",
  "/resources/": "2026-04-16",
  "/resources/guest-list-rsvp-seating/": "2026-05-01",
  "/resources/timeline-checklist/": "2026-05-01",
  "/resources/wedding-budget/": "2026-05-01",
  "/resources/wedding-costs/": "2026-05-01",
  "/resources/wedding-planning-tools/": "2026-05-01",
  "/resources/wedding-vendors/": "2026-05-01",
  "/resources/wedding-websites-registry/": "2026-05-01",
  "/templates/": "2026-04-16",
  "/terms/": "2026-04-16",
};

function buildLastmodDates(contentInventory: {
  updatedAtByPath: Map<string, string>;
}): Record<string, string> {
  return {
    ...STATIC_PAGE_LASTMOD_DATES,
    ...Object.fromEntries(contentInventory.updatedAtByPath),
  };
}

export function buildSitemapConfigOptions(
  site: string,
  pagesDir: string = resolve("src/pages"),
  contentDir: string = resolve("src/content"),
): SitemapConfigOptions {
  const blockedPages = new Set(["/llms.txt", "/llms-full.txt"]);
  const blockedPrefixes = ["/api/", "/w/"];
  const contentInventory = getContentRouteInventory(contentDir);
  const blockedContentPages = contentInventory.noindexPaths;

  return {
    customPages: Array.from(
      new Set([
        ...getPublishedMarketingPageUrls(site, pagesDir),
        new URL("/pricing.txt", site).toString(),
        ...getResourcePillars().map((pillar) =>
          new URL(pillar.href, site).toString(),
        ),
        ...getSitemapCustomPageUrls(site, contentDir, 10, contentInventory),
      ]),
    ),
    lastmodDates: buildLastmodDates(contentInventory),
    filter: (page: string) => {
      const path = new URL(page).pathname;
      return (
        !blockedPages.has(path) &&
        !blockedContentPages.has(path) &&
        !blockedPrefixes.some((prefix) => path.startsWith(prefix))
      );
    },
  };
}
