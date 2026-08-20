import { readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import matter from "gray-matter";

type CollectionRouteConfig = {
  dir: string;
  prefix: string;
  getSlug?: (frontmatter: Record<string, unknown>, filename: string) => string;
  paginatedBasePath?: string;
};

export const COLLECTION_ROUTE_MAP: CollectionRouteConfig[] = [
  {
    dir: "alternatives",
    prefix: "/compare/alternatives/",
    paginatedBasePath: "/compare/alternatives/",
    getSlug: (frontmatter, file) => {
      const competitor = frontmatter.competitor;
      if (
        typeof competitor === "object" &&
        competitor !== null &&
        "slug" in competitor &&
        typeof competitor.slug === "string"
      ) {
        return competitor.slug;
      }

      return file.replace(/\.md$/, "");
    },
  },
  {
    dir: "comparisons",
    prefix: "/compare/versus/",
    paginatedBasePath: "/compare/versus/",
  },
  {
    dir: "pricing-breakdowns",
    prefix: "/compare/pricing/",
    paginatedBasePath: "/compare/pricing/",
  },
  {
    dir: "listicles",
    prefix: "/resources/best/",
    paginatedBasePath: "/resources/best/",
  },
  {
    dir: "guides",
    prefix: "/resources/guides/",
    paginatedBasePath: "/resources/guides/",
  },
  { dir: "lead-magnets", prefix: "/free/" },
];

export interface ContentRouteInventory {
  allPaths: Set<string>;
  indexablePaths: Set<string>;
  noindexPaths: Set<string>;
  updatedAtByPath: Map<string, string>;
  totalCountsByCollection: Map<string, number>;
  indexableCountsByCollection: Map<string, number>;
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  if (!/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(raw)) {
    return null;
  }

  try {
    return matter(raw).data;
  } catch {
    return null;
  }
}

function getUpdatedAt(frontmatter: Record<string, unknown>): string | null {
  const updatedAt = frontmatter.updatedAt;
  if (updatedAt instanceof Date) {
    return updatedAt.toISOString().slice(0, 10);
  }

  return typeof updatedAt === "string" ? updatedAt : null;
}

export function getContentRouteInventory(
  contentDir: string = resolve("src/content"),
): ContentRouteInventory {
  const allPaths = new Set<string>();
  const indexablePaths = new Set<string>();
  const noindexPaths = new Set<string>();
  const updatedAtByPath = new Map<string, string>();
  const totalCountsByCollection = new Map<string, number>();
  const indexableCountsByCollection = new Map<string, number>();

  for (const { dir, prefix, getSlug } of COLLECTION_ROUTE_MAP) {
    const dirPath = join(contentDir, dir);
    let files: string[];

    try {
      files = readdirSync(dirPath).filter((file) => file.endsWith(".md"));
    } catch {
      continue;
    }

    for (const file of files) {
      const raw = readFileSync(join(dirPath, file), "utf-8");
      const frontmatter = parseFrontmatter(raw);
      if (frontmatter === null) continue;

      const slug = getSlug
        ? getSlug(frontmatter, file)
        : file.replace(/\.md$/, "");
      const path = `${prefix}${slug}/`;
      allPaths.add(path);
      totalCountsByCollection.set(
        dir,
        (totalCountsByCollection.get(dir) ?? 0) + 1,
      );

      if (frontmatter.noindex === true) {
        noindexPaths.add(path);
        continue;
      }

      indexablePaths.add(path);
      const updatedAt = getUpdatedAt(frontmatter);
      if (updatedAt) {
        updatedAtByPath.set(path, updatedAt);
      }
      indexableCountsByCollection.set(
        dir,
        (indexableCountsByCollection.get(dir) ?? 0) + 1,
      );
    }
  }

  return {
    allPaths,
    indexablePaths,
    noindexPaths,
    updatedAtByPath,
    totalCountsByCollection,
    indexableCountsByCollection,
  };
}

export function getIndexableContentPageUrls(
  site: string,
  contentDir?: string,
  inventory: ContentRouteInventory = getContentRouteInventory(contentDir),
): string[] {
  return Array.from(inventory.indexablePaths, (path) =>
    new URL(path, site).toString(),
  );
}

export function getPaginatedHubPageUrls(
  site: string,
  contentDir?: string,
  pageSize = 10,
  inventory: ContentRouteInventory = getContentRouteInventory(contentDir),
): string[] {
  const urls: string[] = [];

  for (const { dir, paginatedBasePath } of COLLECTION_ROUTE_MAP) {
    if (!paginatedBasePath) continue;

    const pageCount = Math.ceil(
      (inventory.indexableCountsByCollection.get(dir) ?? 0) / pageSize,
    );

    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
      urls.push(new URL(`${paginatedBasePath}${pageNumber}/`, site).toString());
    }
  }

  return urls;
}

export function getSitemapCustomPageUrls(
  site: string,
  contentDir?: string,
  pageSize = 10,
  inventory: ContentRouteInventory = getContentRouteInventory(contentDir),
): string[] {
  return Array.from(
    new Set([
      ...getIndexableContentPageUrls(site, contentDir, inventory),
      ...getPaginatedHubPageUrls(site, contentDir, pageSize, inventory),
    ]),
  );
}
