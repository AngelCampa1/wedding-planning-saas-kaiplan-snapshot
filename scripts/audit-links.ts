/**
 * Kaiplan marketing-site link auditor.
 *
 * Walks a built Astro `dist/client/` tree, extracts every link (anchor,
 * canonical, og:url, area, sitemap <loc>), cross-references the lead-magnet
 * manifest against the on-disk PDFs, and optionally HEAD/GETs external URLs to
 * classify them as live or rotten. A non-zero exit code is returned when any
 * internal-broken link, manifest mismatch, or dead redirect rule is found —
 * externals are informational because the internet rots.
 */
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAuditReport,
  checkExternalUrl,
  classifyHref,
  extractLinksFromHtml,
  formatMarkdownReport,
  parseRedirects,
  parseSitemapLocs,
  type ExternalProbe,
  type Finding,
  type LeadMagnetIssue,
  type RedirectRule,
  type RedirectRuleIssue,
} from "./lib/link-audit";

interface CliArgs {
  dist: string;
  publicDir: string;
  contentDir: string;
  reportsDir: string;
  skipExternal: boolean;
  externalConcurrency: number;
  externalTimeoutMs: number;
  sameHost: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dist: "apps/web/dist",
    publicDir: "apps/web/public",
    contentDir: "apps/web/src/content",
    reportsDir: "reports",
    skipExternal: false,
    externalConcurrency: 8,
    externalTimeoutMs: 15_000,
    sameHost: "kaiplan.app",
  };
  let positional: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skip-external") args.skipExternal = true;
    else if (a === "--dist") args.dist = argv[++i];
    else if (a === "--public") args.publicDir = argv[++i];
    else if (a === "--content") args.contentDir = argv[++i];
    else if (a === "--reports") args.reportsDir = argv[++i];
    else if (a === "--concurrency")
      args.externalConcurrency = Number.parseInt(argv[++i] ?? "8", 10);
    else if (a === "--timeout")
      args.externalTimeoutMs = Number.parseInt(argv[++i] ?? "15000", 10);
    else if (a === "--host") args.sameHost = argv[++i];
    else if (!a.startsWith("--") && positional === undefined) positional = a;
  }
  if (positional) args.dist = positional;
  return args;
}

async function walkHtmlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Array<{
      name: string;
      isDirectory: () => boolean;
      isFile: () => boolean;
    }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

/** Translate a filesystem HTML path to the URL path it serves at. */
function htmlPathToRoute(htmlFile: string, clientRoot: string): string {
  const rel = path.relative(clientRoot, htmlFile).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html"))
    return `/${rel.slice(0, -"index.html".length)}`;
  if (rel.endsWith(".html")) return `/${rel.slice(0, -".html".length)}`;
  return `/${rel}`;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

interface ContentCollectionSlugPlan {
  /** Directory under src/content containing markdown files. */
  dir: string;
  /** URL prefix (trailing slash required). */
  prefix: string;
  /**
   * Converts a markdown filename (without extension) into the URL slug. For
   * most collections the slug is the stem; the alternatives collection uses a
   * frontmatter-driven `competitor.slug` so we also read the file body.
   */
  slugFor: (stem: string, body: string) => string | null;
}

function extractFrontmatterCompetitorSlug(body: string): string | null {
  // The alternatives collection sets its url slug via `competitor.slug` in the
  // frontmatter. The file body is markdown so we can greedily slice the top
  // YAML block and scan for the field — no YAML dep needed.
  const end = body.indexOf("\n---", 3);
  const fm = end > 0 ? body.slice(0, end) : body;
  const m = /\bslug\s*:\s*["']?([A-Za-z0-9_-]+)["']?/.exec(
    fm.split(/competitor\s*:/)[1] ?? "",
  );
  return m ? m[1] : null;
}

const CONTENT_COLLECTION_PLANS: ContentCollectionSlugPlan[] = [
  {
    dir: "alternatives",
    prefix: "/compare/alternatives/",
    slugFor: (_stem, body) => extractFrontmatterCompetitorSlug(body),
  },
  {
    dir: "comparisons",
    prefix: "/compare/versus/",
    slugFor: (stem) => stem,
  },
  {
    dir: "pricing-breakdowns",
    prefix: "/compare/pricing/",
    slugFor: (stem) => stem,
  },
  {
    dir: "listicles",
    prefix: "/resources/best/",
    slugFor: (stem) => stem,
  },
  {
    dir: "guides",
    prefix: "/resources/guides/",
    slugFor: (stem) => stem,
  },
  {
    dir: "lead-magnets",
    prefix: "/free/",
    slugFor: (stem) => stem,
  },
];

async function collectContentRoutes(contentRoot: string): Promise<Set<string>> {
  const routes = new Set<string>();
  for (const plan of CONTENT_COLLECTION_PLANS) {
    const dir = path.join(contentRoot, plan.dir);
    let entries: Array<{ name: string; isFile: () => boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.(md|mdx)$/i.test(entry.name)) continue;
      const stem = entry.name.replace(/\.(md|mdx)$/i, "");
      const body = await readFile(path.join(dir, entry.name), "utf8");
      const slug = plan.slugFor(stem, body);
      if (!slug) continue;
      routes.add(`${plan.prefix}${slug}/`);
    }
  }
  return routes;
}

function frontmatterIsNoindex(body: string): boolean {
  const end = body.indexOf("\n---", 3);
  const fm = end > 0 ? body.slice(0, end) : body;
  return /^noindex\s*:\s*true\s*$/im.test(fm);
}

async function collectNoindexContentRoutes(
  contentRoot: string,
): Promise<Set<string>> {
  const routes = new Set<string>();
  for (const plan of CONTENT_COLLECTION_PLANS) {
    const dir = path.join(contentRoot, plan.dir);
    let entries: Array<{ name: string; isFile: () => boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.(md|mdx)$/i.test(entry.name)) continue;
      const stem = entry.name.replace(/\.(md|mdx)$/i, "");
      const body = await readFile(path.join(dir, entry.name), "utf8");
      if (!frontmatterIsNoindex(body)) continue;
      const slug = plan.slugFor(stem, body);
      if (!slug) continue;
      routes.add(`${plan.prefix}${slug}/`);
    }
  }
  return routes;
}

async function collectKnownPaths(
  clientRoot: string,
  pagesByPath: Map<string, string>,
  contentRoot: string | null,
): Promise<Set<string>> {
  const known = new Set<string>();
  for (const route of pagesByPath.keys()) known.add(route);

  // Static top-level asset files (favicon.svg, robots.txt, sitemap-0.xml, etc).
  async function walk(dir: string, prefix: string): Promise<void> {
    let entries: Array<{
      name: string;
      isDirectory: () => boolean;
      isFile: () => boolean;
    }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const urlPath = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        await walk(full, `${urlPath}/`);
      } else if (entry.isFile()) {
        known.add(urlPath);
      }
    }
  }
  await walk(clientRoot, "/");

  // Sitemap-advertised URLs are legitimate targets even if not prerendered
  // (SSR pages served by the Cloudflare Worker at runtime).
  if (contentRoot) {
    const contentRoutes = await collectContentRoutes(contentRoot);
    for (const r of contentRoutes) known.add(r);
  }

  const candidateSitemaps = ["sitemap-0.xml", "sitemap-index.xml"];
  for (const rel of candidateSitemaps) {
    const sitemapPath = path.join(clientRoot, rel);
    if (!(await fileExists(sitemapPath))) continue;
    const xml = await readFile(sitemapPath, "utf8");
    for (const loc of parseSitemapLocs(xml)) {
      try {
        const url = new URL(loc);
        known.add(url.pathname);
      } catch {
        // Skip malformed sitemap entries; they'd never resolve anyway.
      }
    }
  }
  return known;
}

interface LeadMagnetEntry {
  slug: string;
  pdfPath: string;
}

interface LeadMagnetManifest {
  entries: LeadMagnetEntry[];
}

async function auditLeadMagnets(publicDir: string): Promise<LeadMagnetIssue[]> {
  const manifestPath = path.join(publicDir, "lead-magnets", "manifest.json");
  if (!(await fileExists(manifestPath))) return [];
  const pdfArtifactDir = path.resolve(publicDir, "..", ".lead-magnets");
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as LeadMagnetManifest;
  const issues: LeadMagnetIssue[] = [];
  for (const entry of parsed.entries ?? []) {
    if (!entry.pdfPath) continue;
    const diskPath = path.join(pdfArtifactDir, `${entry.slug}.pdf`);
    if (!(await fileExists(diskPath))) {
      issues.push({ slug: entry.slug, pdfPath: entry.pdfPath });
    }
  }
  return issues;
}

async function collectRedirectRuleIssues(
  redirects: RedirectRule[],
  knownPaths: Set<string>,
): Promise<RedirectRuleIssue[]> {
  const issues: RedirectRuleIssue[] = [];
  for (const rule of redirects) {
    // Skip placeholder rules (we cannot know every slug), but flag concrete
    // redirects whose target is not served.
    if (rule.to.includes(":")) continue;
    const [target] = rule.to.split("#");
    const withoutQuery = target.split("?")[0];
    if (!knownPaths.has(withoutQuery)) {
      const withSlash = withoutQuery.endsWith("/")
        ? withoutQuery
        : `${withoutQuery}/`;
      if (!knownPaths.has(withSlash)) {
        issues.push({
          from: rule.from,
          to: rule.to,
          reason: "target-missing",
        });
      }
    }
  }
  return issues;
}

async function probeExternalUrls(
  urls: string[],
  concurrency: number,
  timeoutMs: number,
): Promise<Map<string, ExternalProbe>> {
  const out = new Map<string, ExternalProbe>();
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < urls.length) {
      const idx = cursor++;
      const url = urls[idx];
      const result = await checkExternalUrl(url, { timeoutMs });
      out.set(url, { url, result });
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.max(1, concurrency); i++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

export async function runAudit(args: CliArgs): Promise<number> {
  const cwd = process.cwd();
  const distAbs = path.resolve(cwd, args.dist);
  const clientRoot = (await fileExists(path.join(distAbs, "client")))
    ? path.join(distAbs, "client")
    : distAbs;
  const publicAbs = path.resolve(cwd, args.publicDir);
  const contentAbs = path.resolve(cwd, args.contentDir);
  const reportsAbs = path.resolve(cwd, args.reportsDir);

  const htmlFiles = await walkHtmlFiles(clientRoot);
  const pagesByPath = new Map<string, string>();
  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, "utf8");
    const route = htmlPathToRoute(htmlFile, clientRoot);
    pagesByPath.set(route, html);
  }

  const redirectsPath = path.join(clientRoot, "_redirects");
  const redirectsText = (await fileExists(redirectsPath))
    ? await readFile(redirectsPath, "utf8")
    : "";
  const redirects = parseRedirects(redirectsText);

  const knownPaths = await collectKnownPaths(
    clientRoot,
    pagesByPath,
    (await fileExists(contentAbs)) ? contentAbs : null,
  );
  const sitemapLocs = new Set<string>();
  for (const rel of ["sitemap-0.xml", "sitemap-index.xml"]) {
    const sitemapPath = path.join(clientRoot, rel);
    if (!(await fileExists(sitemapPath))) continue;
    const xml = await readFile(sitemapPath, "utf8");
    for (const loc of parseSitemapLocs(xml)) sitemapLocs.add(loc);
  }
  const noindexContentRoutes = (await fileExists(contentAbs))
    ? await collectNoindexContentRoutes(contentAbs)
    : new Set<string>();
  const leadMagnetIssues = await auditLeadMagnets(publicAbs);
  const redirectRuleIssues = await collectRedirectRuleIssues(
    redirects,
    knownPaths,
  );

  // Discover unique external URLs referenced anywhere in the emitted HTML
  // (including sitemap XML URLs in the dist/ tree).
  const externalSet = new Set<string>();
  for (const html of pagesByPath.values()) {
    for (const link of extractLinksFromHtml(html)) {
      if (classifyHref(link.href, args.sameHost) === "external") {
        externalSet.add(link.href);
      }
    }
  }

  const externalProbes = args.skipExternal
    ? new Map<string, ExternalProbe>()
    : await probeExternalUrls(
        [...externalSet],
        args.externalConcurrency,
        args.externalTimeoutMs,
      );

  const report = buildAuditReport({
    pagesByPath,
    knownPaths,
    redirects,
    trailingSlash: "always",
    externalProbes,
    leadMagnetIssues,
    redirectRuleIssues,
    sameHost: args.sameHost,
    orphanExclusions: noindexContentRoutes,
    sitemapLocs,
    enableSeoSmoke: true,
  });

  await mkdir(reportsAbs, { recursive: true });
  const jsonOut = {
    generatedAt: new Date().toISOString(),
    summary: report.summary,
    byPage: Object.fromEntries(
      [...report.byPage.entries()].map(
        ([page, findings]: [string, Finding[]]) => [page, findings],
      ),
    ),
    externalResults: report.externalResults,
    leadMagnetIssues: report.leadMagnetIssues,
    redirectRuleIssues: report.redirectRuleIssues,
    seoSmokeIssues: report.seoSmokeIssues,
    orphanRoutes: report.orphanRoutes,
    lowInboundRoutes: report.lowInboundRoutes,
    externalUrlsScanned: [...externalSet].sort(),
    skipExternal: args.skipExternal,
  };
  await writeFile(
    path.join(reportsAbs, "link-audit.json"),
    JSON.stringify(jsonOut, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(reportsAbs, "link-audit.md"),
    formatMarkdownReport(report),
    "utf8",
  );

  // Log a short summary so CI output is useful without opening the files.
  const brokenPages = [...report.byPage.entries()].filter(([, findings]) =>
    findings.some((f) => f.status === "broken"),
  );
  const lines = [
    `[audit-links] pages=${report.summary.totalPages} links=${report.summary.totalLinks}`,
    `[audit-links] broken-internal=${report.summary.brokenInternal} broken-external=${report.summary.brokenExternal}`,
    `[audit-links] orphan-routes=${report.summary.orphanRoutes} low-inbound-routes=${report.summary.lowInboundRoutes}`,
    `[audit-links] seo-smoke-issues=${report.summary.seoSmokeIssues}`,
    `[audit-links] lead-magnet-issues=${report.leadMagnetIssues.length} redirect-rule-issues=${report.redirectRuleIssues.length}`,
  ];
  for (const [page, findings] of brokenPages) {
    lines.push(`  ${page}:`);
    for (const f of findings.filter((x) => x.status === "broken")) {
      lines.push(`    - [${f.kind}] ${f.href} (${f.reason ?? ""})`);
    }
  }
  for (const issue of report.leadMagnetIssues) {
    lines.push(`  lead-magnet ${issue.slug} missing ${issue.pdfPath}`);
  }
  for (const issue of report.redirectRuleIssues) {
    lines.push(`  redirect ${issue.from} -> ${issue.to} (${issue.reason})`);
  }
  for (const issue of report.seoSmokeIssues) {
    lines.push(`  seo ${issue.route} (${issue.reason})`);
  }
  for (const issue of report.orphanRoutes) {
    lines.push(`  orphan ${issue.route}`);
  }
  for (const issue of report.lowInboundRoutes) {
    lines.push(`  low-inbound ${issue.route} (${issue.inboundCount} inbound)`);
  }
  console.log(lines.join("\n"));

  return report.hasBrokenInternal ? 1 : 0;
}

const invokedAsCli = (() => {
  if (typeof process === "undefined" || !process.argv[1]) return false;
  const entry = path.resolve(process.argv[1]);
  const self = fileURLToPath(import.meta.url);
  return entry === self;
})();

if (invokedAsCli) {
  const args = parseArgs(process.argv.slice(2));
  runAudit(args)
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error("[audit-links] fatal:", err);
      process.exit(2);
    });
}
