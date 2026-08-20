import { resolve } from "path";
import { getContentRouteInventory } from "./content-route-inventory";

/**
 * Reads all content collection markdown files and returns a Set of URL paths
 * for pages that have `noindex: true` in their frontmatter.
 *
 * @param contentDir - Absolute path to the content directory (defaults to
 *   `src/content` relative to the process cwd, which is the site root during
 *   `astro build`).
 */
export function getNoindexPaths(
  contentDir: string = resolve("src/content"),
): Set<string> {
  return getContentRouteInventory(contentDir).noindexPaths;
}
