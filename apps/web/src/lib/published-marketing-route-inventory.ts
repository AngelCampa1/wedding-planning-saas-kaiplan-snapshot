import { readdirSync, readFileSync } from "fs";
import { join, relative, resolve, sep } from "path";

const ASTRO_PAGE_EXTENSION = ".astro";
const EXCLUDED_PAGE_BASENAMES = new Set(["404.astro", "500.astro"]);
const EXCLUDED_TOP_LEVEL_SEGMENTS = new Set(["api"]);
const EXCLUDED_ROUTE_PATTERNS = [/\.test\.astro$/i, /^w\/.+/i];

export interface PublishedMarketingRouteInventory {
  allPaths: Set<string>;
  indexablePaths: Set<string>;
  noindexPaths: Set<string>;
}

function walkPages(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkPages(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function shouldIgnorePage(relativePath: string): boolean {
  const normalizedPath = relativePath.split(sep).join("/");
  const segments = normalizedPath.split("/");
  const basename = segments.at(-1);

  if (!basename?.endsWith(ASTRO_PAGE_EXTENSION)) {
    return true;
  }

  if (EXCLUDED_PAGE_BASENAMES.has(basename)) {
    return true;
  }

  if (segments.some((segment) => segment.includes("["))) {
    return true;
  }

  if (EXCLUDED_TOP_LEVEL_SEGMENTS.has(segments[0] ?? "")) {
    return true;
  }

  return EXCLUDED_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(normalizedPath),
  );
}

function toRoutePath(relativePath: string): string {
  const normalizedPath = relativePath.split(sep).join("/");
  const withoutExtension = normalizedPath.replace(/\.astro$/i, "");

  if (withoutExtension === "index") {
    return "/";
  }

  if (withoutExtension.endsWith("/index")) {
    return `/${withoutExtension.replace(/\/index$/i, "")}/`;
  }

  return `/${withoutExtension}/`;
}

function pageIsNoindex(filePath: string): boolean {
  const source = readFileSync(filePath, "utf-8");
  return /\bnoindex\s*=\s*\{?\s*true\b/i.test(source);
}

export function getPublishedMarketingRouteInventory(
  pagesDir: string = resolve("src/pages"),
): PublishedMarketingRouteInventory {
  const allPaths = new Set<string>();
  const indexablePaths = new Set<string>();
  const noindexPaths = new Set<string>();

  for (const filePath of walkPages(pagesDir)) {
    const relativePath = relative(pagesDir, filePath);
    if (shouldIgnorePage(relativePath)) {
      continue;
    }

    const routePath = toRoutePath(relativePath);
    allPaths.add(routePath);

    if (pageIsNoindex(filePath)) {
      noindexPaths.add(routePath);
      continue;
    }

    indexablePaths.add(routePath);
  }

  return {
    allPaths,
    indexablePaths,
    noindexPaths,
  };
}

export function getPublishedMarketingPageUrls(
  site: string,
  pagesDir?: string,
  inventory: PublishedMarketingRouteInventory = getPublishedMarketingRouteInventory(
    pagesDir,
  ),
): string[] {
  return Array.from(inventory.indexablePaths, (path) =>
    new URL(path, site).toString(),
  );
}
