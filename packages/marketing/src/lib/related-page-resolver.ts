export type ContentMapEntry = {
  title: string;
  description: string;
  canonicalHref?: string;
};
export type ContentMap = Map<string, ContentMapEntry>;

export type ResolvedPageLink = {
  title: string;
  href: string;
  description: string;
};

const FILE_EXTENSION_RE = /\.[a-z0-9]+$/i;

function ensureCanonicalInternalHref(href: string): string {
  if (!href.startsWith("/") || href === "/") return href;
  const [path = href, suffix = ""] = href.split(/([?#].*)/, 2);
  const lastSegment = path.split("/").at(-1) ?? "";
  if (FILE_EXTENSION_RE.test(lastSegment)) return href;
  return path.endsWith("/") ? href : `${path}/${suffix}`;
}

export function deriveTitleFromHref(href: string): string {
  const segments = href.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return href;
  }
  // length > 0 checked above; last element always exists.
  const lastSegment = segments[segments.length - 1]!;
  return lastSegment.replace(/-/g, " ");
}

export function resolveRelatedPageLinks(
  hrefs: string[],
  contentMap: ContentMap,
): ResolvedPageLink[] {
  return hrefs.map((href) => {
    const normalized = href.endsWith("/") ? href.slice(0, -1) : href;
    const entry = contentMap.get(normalized);
    if (entry !== undefined) {
      const entryHref = entry.canonicalHref ?? normalized;
      return {
        title: entry.title,
        href: ensureCanonicalInternalHref(entryHref),
        description: entry.description,
      };
    }
    return {
      title: deriveTitleFromHref(href),
      href: ensureCanonicalInternalHref(href),
      description: "",
    };
  });
}
