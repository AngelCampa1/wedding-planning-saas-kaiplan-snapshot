import type { CollectionEntry, CollectionKey } from "astro:content";

export function contentEntrySlug<C extends CollectionKey>(
  entry: CollectionEntry<C>,
): string {
  return entry.id.replace(/\.(md|mdx)$/i, "").replace(/\/index$/i, "");
}
