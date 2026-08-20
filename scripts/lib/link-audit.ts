/**
 * Pure (side-effect-free) link-audit helpers: HTML extraction, classification,
 * internal resolution, external status interpretation, and report shaping.
 *
 * The CLI wrapper in `scripts/audit-links.ts` handles I/O (reading dist files,
 * hitting the network, writing reports). This module is kept I/O-free so it is
 * cheap to unit test.
 */

export type TrailingSlashMode = "always";

export type LinkKind =
  | "internal"
  | "anchor"
  | "external"
  | "placeholder"
  | "skip";

export type LinkSource = "a" | "canonical" | "og:url" | "area" | "sitemap";

export interface ExtractedLink {
  href: string;
  source: LinkSource;
}

export interface RedirectRule {
  from: string;
  to: string;
  status: number;
}

export interface InternalResolution {
  status: "ok" | "broken";
  finalTarget?: string;
  reason?:
    | "unknown-path"
    | "redirect-target-missing"
    | "non-canonical-internal-route";
}

export interface ExternalCheckResult {
  status: "ok" | "broken";
  httpStatus?: number;
  error?: string;
}

export interface ExternalProbe {
  url: string;
  result: ExternalCheckResult;
}

export interface Finding {
  href: string;
  kind: LinkKind;
  status: "ok" | "broken";
  reason?: string;
  source?: LinkSource;
  anchor?: string;
  finalTarget?: string;
}

export interface LeadMagnetIssue {
  slug: string;
  pdfPath: string;
}

export interface RedirectRuleIssue {
  from: string;
  to: string;
  reason: "target-missing";
}

export interface InboundRouteIssue {
  route: string;
  inboundCount: number;
  sources: string[];
}

export interface SeoSmokeIssue {
  route: string;
  reason:
    | "missing-canonical"
    | "duplicate-canonical"
    | "missing-title"
    | "weak-title"
    | "missing-description"
    | "weak-description"
    | "missing-og-url"
    | "og-url-mismatch"
    | "invalid-json-ld"
    | "json-ld-outside-html"
    | "article-og-type-mismatch"
    | "noindex-in-sitemap"
    | "indexable-missing-from-sitemap";
}

export interface AuditReport {
  byPage: Map<string, Finding[]>;
  externalResults: ExternalProbe[];
  leadMagnetIssues: LeadMagnetIssue[];
  redirectRuleIssues: RedirectRuleIssue[];
  seoSmokeIssues: SeoSmokeIssue[];
  orphanRoutes: InboundRouteIssue[];
  lowInboundRoutes: InboundRouteIssue[];
  hasBrokenInternal: boolean;
  summary: {
    totalPages: number;
    totalLinks: number;
    brokenInternal: number;
    brokenExternal: number;
    seoSmokeIssues: number;
    orphanRoutes: number;
    lowInboundRoutes: number;
  };
}

/** Classify an href into a kind so we know how to validate it. */
export function classifyHref(href: string, sameHost?: string): LinkKind {
  const trimmed = href.trim();
  if (trimmed === "" || trimmed === "#") return "placeholder";
  if (trimmed.startsWith("#")) return "anchor";
  if (/^(mailto:|tel:|javascript:|data:)/i.test(trimmed)) return "skip";
  if (/^https?:\/\//i.test(trimmed)) {
    if (sameHost) {
      try {
        const u = new URL(trimmed);
        if (u.host === sameHost) return "internal";
      } catch {
        return "external";
      }
    }
    return "external";
  }
  if (trimmed.startsWith("/")) return "internal";
  // Relative paths (e.g. "foo/bar") — treat as internal; the resolver will
  // report them as broken if they do not normalize to a known path.
  return "internal";
}

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/** Strip HTML comments so we do not match hrefs inside commented-out markup. */
function stripComments(html: string): string {
  return html.replace(HTML_COMMENT_RE, "");
}

const A_HREF_RE =
  /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
const AREA_HREF_RE =
  /<area\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
const CANONICAL_RE =
  /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*"([^"]+)"/gi;
const CANONICAL_ALT_RE =
  /<link\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi;
const OG_URL_RE =
  /<meta\b[^>]*\bproperty\s*=\s*["']og:url["'][^>]*\bcontent\s*=\s*"([^"]+)"/gi;
const OG_URL_ALT_RE =
  /<meta\b[^>]*\bcontent\s*=\s*"([^"]+)"[^>]*\bproperty\s*=\s*["']og:url["'][^>]*>/gi;

function matchAll(
  regex: RegExp,
  input: string,
  source: LinkSource,
  groupIndexes: number[] = [1, 2, 3],
): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(input)) !== null) {
    for (const g of groupIndexes) {
      const v = m[g];
      if (v !== undefined) {
        out.push({ href: v, source });
        break;
      }
    }
  }
  return out;
}

/** Extract links from a single HTML document. */
export function extractLinksFromHtml(html: string): ExtractedLink[] {
  const cleaned = stripComments(html);
  return [
    ...matchAll(A_HREF_RE, cleaned, "a"),
    ...matchAll(AREA_HREF_RE, cleaned, "area"),
    ...matchAll(CANONICAL_RE, cleaned, "canonical", [1]),
    ...matchAll(CANONICAL_ALT_RE, cleaned, "canonical", [1]),
    ...matchAll(OG_URL_RE, cleaned, "og:url", [1]),
    ...matchAll(OG_URL_ALT_RE, cleaned, "og:url", [1]),
  ];
}

const ID_RE = /\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;

/** Collect DOM ids so we can resolve anchor targets on a page. */
export function collectPageIdsFromHtml(html: string): Set<string> {
  const cleaned = stripComments(html);
  const out = new Set<string>();
  ID_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ID_RE.exec(cleaned)) !== null) {
    const id = m[1] ?? m[2];
    if (id) out.add(id);
  }
  return out;
}

const ASSET_EXT_RE = /\.[a-z0-9]+$/i;

function extractInternalPathname(href: string): string | undefined {
  if (/^https?:\/\//i.test(href)) {
    try {
      return new URL(href).pathname;
    } catch {
      return undefined;
    }
  }

  if (href.startsWith("/")) {
    const hashIdx = href.indexOf("#");
    const queryIdx = href.indexOf("?");
    const endIndexes = [hashIdx, queryIdx].filter((idx) => idx >= 0);
    const end = endIndexes.length > 0 ? Math.min(...endIndexes) : href.length;
    return href.slice(0, end);
  }

  return undefined;
}

function isSlashlessHtmlRouteHref(href: string): boolean {
  const pathname = extractInternalPathname(href);
  if (pathname === undefined || pathname === "/" || pathname.endsWith("/")) {
    return false;
  }

  const lastSegment = pathname.split("/").at(-1) ?? "";
  return !ASSET_EXT_RE.test(lastSegment);
}

/** Normalize a path so it can be looked up against the set of emitted pages. */
export function normalizeInternalPath(
  href: string,
  trailing: TrailingSlashMode,
): string {
  let path = href;
  // If caller passed a full URL, keep only the pathname.
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname + new URL(path).search + new URL(path).hash;
    } catch {
      // fall through and let the rest of the logic handle the literal string.
    }
  }
  const hashIdx = path.indexOf("#");
  if (hashIdx >= 0) path = path.slice(0, hashIdx);
  const queryIdx = path.indexOf("?");
  if (queryIdx >= 0) path = path.slice(0, queryIdx);
  if (path === "") path = "/";
  if (path === "/") return "/";
  // Leave extensions (static assets) alone.
  const segments = path.split("/");
  const last = segments[segments.length - 1] || "";
  if (ASSET_EXT_RE.test(last)) return path;
  if (trailing === "always" && !path.endsWith("/")) return `${path}/`;
  return path;
}

/** Parse a Cloudflare-Pages-style `_redirects` file. */
export function parseRedirects(text: string): RedirectRule[] {
  const rules: RedirectRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [from, to, statusRaw] = parts;
    const status = statusRaw ? Number.parseInt(statusRaw, 10) : 301;
    rules.push({
      from,
      to,
      status: Number.isFinite(status) ? status : 301,
    });
  }
  return rules;
}

const PLACEHOLDER_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Apply a redirect rule to a path. Supports `:slug`-style placeholders for
 * simple single-segment capture (matches the usage in the repo's
 * `_redirects`). Returns the resolved destination or null when the rule does
 * not match.
 */
export function matchesRedirectRule(
  path: string,
  rule: RedirectRule,
): string | null {
  const placeholders: string[] = [];
  const regexSrc =
    "^" +
    rule.from
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(PLACEHOLDER_RE, (_m, name: string) => {
        placeholders.push(name);
        return "([^/]+)";
      }) +
    "$";
  const re = new RegExp(regexSrc);
  const match = re.exec(path);
  if (!match) return null;
  let dest = rule.to;
  for (let i = 0; i < placeholders.length; i++) {
    dest = dest.replace(`:${placeholders[i]}`, match[i + 1]);
  }
  return dest;
}

/** Read sitemap-style `<loc>` entries from an XML document. */
export function parseSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

/** Resolve an internal href against the known page set (+ redirects). */
export function resolveInternalTarget(
  href: string,
  knownPaths: Set<string>,
  redirects: RedirectRule[],
  trailing: TrailingSlashMode,
): InternalResolution {
  const normalized = normalizeInternalPath(href, trailing);
  if (knownPaths.has(normalized)) return { status: "ok" };
  // Try without trailing slash (for asset paths).
  if (normalized.endsWith("/") && knownPaths.has(normalized.slice(0, -1))) {
    return { status: "ok" };
  }
  // Also try the raw form in case the href already pointed at an extensioned path.
  if (knownPaths.has(href)) return { status: "ok" };
  const candidates = [normalized];
  if (normalized.endsWith("/") && normalized !== "/") {
    candidates.push(normalized.slice(0, -1));
  }
  for (const rule of redirects) {
    let dest: string | null = null;
    for (const candidate of candidates) {
      dest = matchesRedirectRule(candidate, rule);
      if (dest !== null) break;
    }
    if (dest !== null) {
      const destNormalized = normalizeInternalPath(dest, trailing);
      if (knownPaths.has(destNormalized)) {
        return { status: "ok", finalTarget: destNormalized };
      }
      return {
        status: "broken",
        finalTarget: destNormalized,
        reason: "redirect-target-missing",
      };
    }
  }
  return { status: "broken", reason: "unknown-path" };
}

/** Verify a page exposes the DOM id an anchor href points at. */
export function checkAnchorExists(
  anchor: string,
  ids: Set<string>,
): "ok" | "broken" {
  return ids.has(anchor) ? "ok" : "broken";
}

export interface CheckExternalOptions {
  fetchFn?: (
    url: string,
    init?: RequestInit,
  ) => Promise<{ status: number; ok: boolean }>;
  timeoutMs?: number;
}

/** HEAD-then-GET an external URL and classify the outcome. */
export async function checkExternalUrl(
  url: string,
  options: CheckExternalOptions = {},
): Promise<ExternalCheckResult> {
  const fetchFn: NonNullable<CheckExternalOptions["fetchFn"]> =
    options.fetchFn ??
    (fetch as unknown as NonNullable<CheckExternalOptions["fetchFn"]>);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const attempt = async (
    method: "HEAD" | "GET",
  ): Promise<{ status: number } | { error: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "kaiplan-link-audit/1.0" },
      });
      return { status: res.status };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  };

  const head = await attempt("HEAD");
  if ("status" in head) {
    if (head.status < 400) return { status: "ok", httpStatus: head.status };
    if (head.status === 405 || head.status === 403 || head.status === 501) {
      const get = await attempt("GET");
      if ("status" in get) {
        return {
          status: get.status < 400 ? "ok" : "broken",
          httpStatus: get.status,
        };
      }
      return { status: "broken", error: get.error };
    }
    return { status: "broken", httpStatus: head.status };
  }
  return { status: "broken", error: head.error };
}

export interface BuildAuditInput {
  pagesByPath: Map<string, string>;
  knownPaths: Set<string>;
  redirects: RedirectRule[];
  trailingSlash: TrailingSlashMode;
  externalProbes: Map<string, ExternalProbe>;
  leadMagnetIssues: LeadMagnetIssue[];
  redirectRuleIssues: RedirectRuleIssue[];
  sameHost?: string;
  orphanExclusions?: Set<string>;
  lowInboundThreshold?: number;
  enforceNoOrphans?: boolean;
  enforceLowInbound?: boolean;
  sitemapLocs?: Set<string>;
  enableSeoSmoke?: boolean;
}

function normalizeRouteForLookup(route: string): string {
  if (route === "/") return "/";
  return route.endsWith("/") ? route : `${route}/`;
}

function isPaginatedRoute(route: string): boolean {
  return /\/\d+\/$/.test(route);
}

function isNoindexHtml(html: string): boolean {
  return /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*\bnoindex\b/i.test(
    html,
  );
}

function getSingleMatch(html: string, regex: RegExp): string | null {
  const matches = [...html.matchAll(regex)];
  if (matches.length !== 1) return null;
  return matches[0]?.[1] ?? null;
}

function extractMetaDescription(html: string): string | null {
  return (
    getSingleMatch(
      html,
      /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent="([^"]+)"[^>]*>/gi,
    ) ??
    getSingleMatch(
      html,
      /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent='([^']+)'[^>]*>/gi,
    )
  );
}

function extractTitle(html: string): string | null {
  return getSingleMatch(html, /<title>([^<]+)<\/title>/gi);
}

function extractCanonicalUrls(html: string): string[] {
  return extractLinksFromHtml(html)
    .filter((link) => link.source === "canonical")
    .map((link) => link.href);
}

function extractOgUrls(html: string): string[] {
  return extractLinksFromHtml(html)
    .filter((link) => link.source === "og:url")
    .map((link) => link.href);
}

function extractMetaProperty(html: string, property: string): string | null {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return getSingleMatch(
    html,
    new RegExp(
      `<meta\\b[^>]*\\bproperty=["']${escapedProperty}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`,
      "gi",
    ),
  );
}

function extractJsonLdScripts(html: string) {
  return [
    ...html.matchAll(
      /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
}

function hasJsonLdOutsideHtml(html: string): boolean {
  const closingHtmlIndex = html.toLowerCase().lastIndexOf("</html>");
  if (closingHtmlIndex === -1) return false;
  return extractJsonLdScripts(html).some(
    (script) => (script.index ?? 0) > closingHtmlIndex,
  );
}

function hasParseableJsonLd(html: string): boolean {
  const scripts = extractJsonLdScripts(html);
  if (scripts.length === 0) return false;
  return scripts.every((script) => {
    try {
      JSON.parse(script[1] ?? "");
      return true;
    } catch {
      return false;
    }
  });
}

function buildSeoSmokeIssues(
  input: Pick<BuildAuditInput, "pagesByPath" | "sitemapLocs">,
): SeoSmokeIssue[] {
  const issues: SeoSmokeIssue[] = [];
  const sitemapPaths = new Set<string>();
  for (const loc of input.sitemapLocs ?? []) {
    try {
      sitemapPaths.add(new URL(loc).pathname);
    } catch {
      sitemapPaths.add(loc);
    }
  }

  for (const [route, html] of input.pagesByPath) {
    const noindex = isNoindexHtml(html);
    if (noindex) {
      if (sitemapPaths.size > 0 && sitemapPaths.has(route)) {
        issues.push({ route, reason: "noindex-in-sitemap" });
      }
      continue;
    }

    const canonicalUrls = extractCanonicalUrls(html);
    if (canonicalUrls.length === 0) {
      issues.push({ route, reason: "missing-canonical" });
    } else if (canonicalUrls.length > 1) {
      issues.push({ route, reason: "duplicate-canonical" });
    }

    const title = extractTitle(html);
    if (!title) {
      issues.push({ route, reason: "missing-title" });
    } else if (title.length < 10 || title.length > 90) {
      issues.push({ route, reason: "weak-title" });
    }

    const description = extractMetaDescription(html);
    if (!description) {
      issues.push({ route, reason: "missing-description" });
    } else if (description.length < 50 || description.length > 260) {
      issues.push({ route, reason: "weak-description" });
    }

    const ogUrls = extractOgUrls(html);
    if (ogUrls.length === 0) {
      issues.push({ route, reason: "missing-og-url" });
    } else if (canonicalUrls.length === 1 && ogUrls[0] !== canonicalUrls[0]) {
      issues.push({ route, reason: "og-url-mismatch" });
    }

    if (!hasParseableJsonLd(html)) {
      issues.push({ route, reason: "invalid-json-ld" });
    }
    if (hasJsonLdOutsideHtml(html)) {
      issues.push({ route, reason: "json-ld-outside-html" });
    }

    const hasArticleMetadata =
      /<meta\b[^>]*\bproperty=["']article:(published_time|modified_time|section|tag)["']/i.test(
        html,
      );
    if (
      hasArticleMetadata &&
      extractMetaProperty(html, "og:type") !== "article"
    ) {
      issues.push({ route, reason: "article-og-type-mismatch" });
    }

    if (sitemapPaths.size > 0) {
      const sitemapHasRoute = sitemapPaths.has(route);
      if (!sitemapHasRoute) {
        issues.push({ route, reason: "indexable-missing-from-sitemap" });
      }
    }
  }

  return issues;
}

function resolveInternalHrefPath(
  href: string,
  sourcePath: string,
  trailing: TrailingSlashMode,
): string {
  if (/^https?:\/\//i.test(href)) {
    return normalizeInternalPath(href, trailing);
  }

  if (href.startsWith("/")) {
    return normalizeInternalPath(href, trailing);
  }

  const sourceBase =
    sourcePath === "/"
      ? "https://kaiplan.audit/"
      : `https://kaiplan.audit${sourcePath}`;
  return normalizeInternalPath(new URL(href, sourceBase).pathname, trailing);
}

function buildInboundRouteIssues({
  pagesByPath,
  trailingSlash,
  sameHost,
  orphanExclusions,
  lowInboundThreshold,
}: Pick<
  BuildAuditInput,
  | "pagesByPath"
  | "trailingSlash"
  | "sameHost"
  | "orphanExclusions"
  | "lowInboundThreshold"
>): {
  orphanRoutes: InboundRouteIssue[];
  lowInboundRoutes: InboundRouteIssue[];
} {
  const threshold = lowInboundThreshold ?? 2;
  const defaultExclusions = new Set(["/", "/404/", "/500/"]);
  const exclusions = new Set(
    [...defaultExclusions, ...(orphanExclusions ?? [])].map(
      normalizeRouteForLookup,
    ),
  );
  const indexablePages = [...pagesByPath.entries()].filter(
    ([, html]) => !isNoindexHtml(html),
  );
  const pageRoutes = new Set(
    indexablePages.map(([route]) => normalizeRouteForLookup(route)),
  );
  const inbound = new Map<string, Set<string>>(
    [...pageRoutes].map((route) => [route, new Set<string>()]),
  );

  for (const [sourceRoute, html] of indexablePages) {
    const normalizedSource = normalizeRouteForLookup(sourceRoute);
    for (const link of extractLinksFromHtml(html)) {
      if (link.source !== "a") continue;
      if (classifyHref(link.href, sameHost) !== "internal") continue;

      const target = resolveInternalHrefPath(
        link.href,
        normalizedSource,
        trailingSlash,
      );
      if (!pageRoutes.has(target) || target === normalizedSource) continue;
      inbound.get(target)?.add(normalizedSource);
    }
  }

  const issues = [...inbound.entries()]
    .filter(([route]) => !exclusions.has(route))
    .map(([route, sources]) => ({
      route,
      inboundCount: sources.size,
      sources: [...sources].sort(),
    }))
    .sort(
      (a, b) =>
        a.inboundCount - b.inboundCount || a.route.localeCompare(b.route),
    );

  return {
    orphanRoutes: issues.filter((issue) => issue.inboundCount === 0),
    lowInboundRoutes: issues.filter(
      (issue) =>
        issue.inboundCount > 0 &&
        issue.inboundCount < threshold &&
        !isPaginatedRoute(issue.route),
    ),
  };
}

/** Walk every emitted page and classify each link it carries. */
export function buildAuditReport(input: BuildAuditInput): AuditReport {
  const byPage = new Map<string, Finding[]>();
  let totalLinks = 0;
  let brokenInternal = 0;
  let brokenExternal = 0;

  const idCache = new Map<string, Set<string>>();
  const getIds = (path: string, html: string): Set<string> => {
    const cached = idCache.get(path);
    if (cached) return cached;
    const ids = collectPageIdsFromHtml(html);
    idCache.set(path, ids);
    return ids;
  };

  for (const [path, html] of input.pagesByPath) {
    const links = extractLinksFromHtml(html);
    const findings: Finding[] = [];
    for (const link of links) {
      totalLinks += 1;
      const kind = classifyHref(link.href, input.sameHost);
      if (kind === "skip") continue;
      if (kind === "placeholder") {
        findings.push({
          href: link.href,
          kind,
          status: "broken",
          reason: "placeholder-href",
          source: link.source,
        });
        brokenInternal += 1;
        continue;
      }
      if (kind === "anchor") {
        const anchor = link.href.slice(1);
        const status = checkAnchorExists(anchor, getIds(path, html));
        if (status === "broken") {
          findings.push({
            href: link.href,
            kind,
            status,
            reason: "missing-anchor",
            source: link.source,
            anchor,
          });
          brokenInternal += 1;
        }
        continue;
      }
      if (kind === "internal") {
        if (
          link.source === "a" &&
          input.trailingSlash === "always" &&
          isSlashlessHtmlRouteHref(link.href)
        ) {
          findings.push({
            href: link.href,
            kind,
            status: "broken",
            reason: "non-canonical-internal-route",
            source: link.source,
            finalTarget: normalizeInternalPath(link.href, input.trailingSlash),
          });
          brokenInternal += 1;
          continue;
        }

        const resolution = resolveInternalTarget(
          link.href,
          input.knownPaths,
          input.redirects,
          input.trailingSlash,
        );
        if (resolution.status === "broken") {
          findings.push({
            href: link.href,
            kind,
            status: "broken",
            reason: resolution.reason,
            source: link.source,
            finalTarget: resolution.finalTarget,
          });
          brokenInternal += 1;
          continue;
        }
        // Anchor portion still needs validation if present.
        const hashIdx = link.href.indexOf("#");
        if (hashIdx >= 0) {
          const anchor = link.href.slice(hashIdx + 1);
          if (anchor) {
            const target =
              resolution.finalTarget ??
              normalizeInternalPath(link.href, input.trailingSlash);
            // Skip anchor validation when we do not have the target page's
            // rendered HTML (SSR pages that aren't in the prerendered set).
            const targetHtml = input.pagesByPath.get(target);
            if (targetHtml === undefined) continue;
            const targetIds = getIds(target, targetHtml);
            if (checkAnchorExists(anchor, targetIds) === "broken") {
              findings.push({
                href: link.href,
                kind: "anchor",
                status: "broken",
                reason: "missing-anchor",
                source: link.source,
                anchor,
              });
              brokenInternal += 1;
            }
          }
        }
        continue;
      }
      if (kind === "external") {
        const probe = input.externalProbes.get(link.href);
        if (probe && probe.result.status === "broken") {
          findings.push({
            href: link.href,
            kind,
            status: "broken",
            reason: probe.result.error
              ? `error:${probe.result.error}`
              : `http:${String(probe.result.httpStatus)}`,
            source: link.source,
          });
          brokenExternal += 1;
        }
      }
    }
    if (findings.length > 0) byPage.set(path, findings);
  }

  const { orphanRoutes, lowInboundRoutes } = buildInboundRouteIssues(input);
  const seoSmokeIssues =
    input.enableSeoSmoke === true ? buildSeoSmokeIssues(input) : [];
  const hasBrokenInternal =
    brokenInternal > 0 ||
    seoSmokeIssues.length > 0 ||
    input.leadMagnetIssues.length > 0 ||
    input.redirectRuleIssues.length > 0 ||
    (input.enforceNoOrphans === true && orphanRoutes.length > 0) ||
    (input.enforceLowInbound === true && lowInboundRoutes.length > 0);

  return {
    byPage,
    externalResults: [...input.externalProbes.values()],
    leadMagnetIssues: input.leadMagnetIssues,
    redirectRuleIssues: input.redirectRuleIssues,
    seoSmokeIssues,
    orphanRoutes,
    lowInboundRoutes,
    hasBrokenInternal,
    summary: {
      totalPages: input.pagesByPath.size,
      totalLinks,
      brokenInternal,
      brokenExternal,
      seoSmokeIssues: seoSmokeIssues.length,
      orphanRoutes: orphanRoutes.length,
      lowInboundRoutes: lowInboundRoutes.length,
    },
  };
}

/** Render an AuditReport as a markdown document grouped by source page. */
export function formatMarkdownReport(report: {
  byPage: Map<string, Finding[]>;
  externalResults: ExternalProbe[];
  leadMagnetIssues: LeadMagnetIssue[];
  redirectRuleIssues: RedirectRuleIssue[];
  seoSmokeIssues?: SeoSmokeIssue[];
  orphanRoutes?: InboundRouteIssue[];
  lowInboundRoutes?: InboundRouteIssue[];
  hasBrokenInternal: boolean;
  summary: {
    totalPages: number;
    totalLinks: number;
    brokenInternal: number;
    brokenExternal: number;
    seoSmokeIssues?: number;
    orphanRoutes?: number;
    lowInboundRoutes?: number;
  };
}): string {
  const lines: string[] = [];
  lines.push("# Link audit report");
  lines.push("");
  lines.push(
    `- pages scanned: **${report.summary.totalPages}**, total links: **${report.summary.totalLinks}**`,
  );
  lines.push(
    `- broken internal: **${report.summary.brokenInternal}**, broken external: **${report.summary.brokenExternal}**`,
  );
  lines.push(`- SEO smoke issues: **${report.summary.seoSmokeIssues ?? 0}**`);
  lines.push(
    `- orphan routes: **${report.summary.orphanRoutes ?? 0}**, low-inbound routes: **${report.summary.lowInboundRoutes ?? 0}**`,
  );
  lines.push("");

  if (report.leadMagnetIssues.length > 0) {
    lines.push("## Lead magnet manifest issues");
    for (const issue of report.leadMagnetIssues) {
      lines.push(`- **${issue.slug}** → missing PDF at \`${issue.pdfPath}\``);
    }
    lines.push("");
  }

  if (report.redirectRuleIssues.length > 0) {
    lines.push("## Redirect rules with dead targets");
    for (const issue of report.redirectRuleIssues) {
      lines.push(`- \`${issue.from}\` → \`${issue.to}\` (${issue.reason})`);
    }
    lines.push("");
  }

  if ((report.seoSmokeIssues?.length ?? 0) > 0) {
    lines.push("## SEO smoke issues");
    for (const issue of report.seoSmokeIssues ?? []) {
      lines.push(`- \`${issue.route}\` (${issue.reason})`);
    }
    lines.push("");
  }

  if ((report.orphanRoutes ?? []).length > 0) {
    lines.push("## Orphan routes");
    for (const issue of report.orphanRoutes ?? []) {
      lines.push(`- \`${issue.route}\` has no inbound internal links`);
    }
    lines.push("");
  }

  if ((report.lowInboundRoutes ?? []).length > 0) {
    lines.push("## Low-inbound routes");
    for (const issue of report.lowInboundRoutes ?? []) {
      lines.push(
        `- \`${issue.route}\` has ${issue.inboundCount} inbound internal link(s)`,
      );
    }
    lines.push("");
  }

  if (report.byPage.size === 0) {
    lines.push("No broken links per page.");
  } else {
    lines.push("## Broken links by page");
    const sortedPages = [...report.byPage.keys()].sort();
    for (const page of sortedPages) {
      lines.push("");
      lines.push(`### ${page}`);
      const findings = report.byPage.get(page) as Finding[];
      for (const f of findings) {
        const reason = f.reason ? f.reason : "";
        const arrow = f.finalTarget ? ` (→ \`${f.finalTarget}\`)` : "";
        lines.push(`- [${f.kind}] \`${f.href}\` — ${reason}${arrow}`);
      }
    }
  }

  const externalBroken = report.externalResults.filter(
    (p) => p.result.status === "broken",
  );
  if (externalBroken.length > 0) {
    lines.push("");
    lines.push("## External URLs that failed");
    for (const p of externalBroken) {
      const detail = p.result.httpStatus
        ? `HTTP ${p.result.httpStatus}`
        : p.result.error
          ? p.result.error
          : "unknown";
      lines.push(`- \`${p.url}\` — ${detail}`);
    }
  }

  return lines.join("\n") + "\n";
}
