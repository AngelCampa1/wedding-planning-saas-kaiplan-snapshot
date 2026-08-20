import { describe, expect, it, vi } from "vitest";
import {
  checkAnchorExists,
  classifyHref,
  collectPageIdsFromHtml,
  extractLinksFromHtml,
  matchesRedirectRule,
  normalizeInternalPath,
  parseRedirects,
  parseSitemapLocs,
  resolveInternalTarget,
  checkExternalUrl,
  formatMarkdownReport,
  buildAuditReport,
  type ExternalProbe,
} from "./link-audit";

describe("classifyHref", () => {
  it("classifies absolute internal paths", () => {
    expect(classifyHref("/pricing/")).toBe("internal");
    expect(classifyHref("/")).toBe("internal");
  });

  it("classifies anchor-only hrefs", () => {
    expect(classifyHref("#section-id")).toBe("anchor");
  });

  it("classifies placeholder hash hrefs", () => {
    expect(classifyHref("#")).toBe("placeholder");
    expect(classifyHref("")).toBe("placeholder");
  });

  it("classifies external http(s) urls", () => {
    expect(classifyHref("https://example.com")).toBe("external");
    expect(classifyHref("http://example.com")).toBe("external");
  });

  it("classifies mailto/tel/javascript as skip", () => {
    expect(classifyHref("mailto:a@b.com")).toBe("skip");
    expect(classifyHref("tel:+15551234")).toBe("skip");
    expect(classifyHref("javascript:void(0)")).toBe("skip");
  });

  it("treats same-origin absolute url as internal", () => {
    expect(classifyHref("https://kaiplan.app/pricing/", "kaiplan.app")).toBe(
      "internal",
    );
  });

  it("classifies data: as skip", () => {
    expect(classifyHref("data:image/png;base64,xxx")).toBe("skip");
  });
});

describe("classifyHref extra cases", () => {
  it("returns external when sameHost URL fails to parse", () => {
    expect(classifyHref("https://[::invalid-url", "kaiplan.app")).toBe(
      "external",
    );
  });

  it("treats bare relative paths as internal", () => {
    expect(classifyHref("foo/bar")).toBe("internal");
  });
});

describe("extractLinksFromHtml", () => {
  it("extracts anchor hrefs", () => {
    const html = `<html><body><a href="/pricing/">P</a><a href="#top">top</a></body></html>`;
    const links = extractLinksFromHtml(html);
    expect(links.map((l) => l.href)).toEqual(["/pricing/", "#top"]);
    expect(links[0].source).toBe("a");
  });

  it("extracts canonical link", () => {
    const html = `<link rel="canonical" href="https://kaiplan.app/foo/">`;
    const links = extractLinksFromHtml(html);
    expect(links[0]).toEqual({
      href: "https://kaiplan.app/foo/",
      source: "canonical",
    });
  });

  it("extracts og:url meta", () => {
    const html = `<meta property="og:url" content="https://kaiplan.app/bar/">`;
    const links = extractLinksFromHtml(html);
    expect(links[0]).toEqual({
      href: "https://kaiplan.app/bar/",
      source: "og:url",
    });
  });

  it("ignores hrefs inside HTML comments", () => {
    const html = `<!-- <a href="/should-not-match/">x</a> --><a href="/real/">r</a>`;
    const links = extractLinksFromHtml(html);
    expect(links.map((l) => l.href)).toEqual(["/real/"]);
  });

  it("handles single-quoted and unquoted hrefs", () => {
    const html = `<a href='/single/'>s</a><a href=/unquoted>u</a>`;
    const links = extractLinksFromHtml(html);
    expect(links.map((l) => l.href)).toEqual(["/single/", "/unquoted"]);
  });
});

describe("collectPageIdsFromHtml", () => {
  it("collects id attributes", () => {
    const html = `<h1 id="top">t</h1><section id='mid'>m</section>`;
    const ids = collectPageIdsFromHtml(html);
    expect(ids.has("top")).toBe(true);
    expect(ids.has("mid")).toBe(true);
  });

  it("ignores empty ids", () => {
    const html = `<h1 id="">nope</h1>`;
    const ids = collectPageIdsFromHtml(html);
    expect(ids.size).toBe(0);
  });
});

describe("normalizeInternalPath", () => {
  it("ensures trailing slash when trailingSlash=always", () => {
    expect(normalizeInternalPath("/pricing", "always")).toBe("/pricing/");
    expect(normalizeInternalPath("/pricing/", "always")).toBe("/pricing/");
  });

  it("leaves root alone", () => {
    expect(normalizeInternalPath("/", "always")).toBe("/");
  });

  it("strips query and fragment", () => {
    expect(normalizeInternalPath("/foo?x=1", "always")).toBe("/foo/");
    expect(normalizeInternalPath("/foo#bar", "always")).toBe("/foo/");
  });

  it("preserves file-extension paths as-is", () => {
    expect(normalizeInternalPath("/sitemap.xml", "always")).toBe(
      "/sitemap.xml",
    );
    expect(normalizeInternalPath("/robots.txt", "always")).toBe("/robots.txt");
  });

  it("extracts pathname from same-host absolute URLs", () => {
    expect(
      normalizeInternalPath("https://kaiplan.app/pricing/", "always"),
    ).toBe("/pricing/");
    expect(normalizeInternalPath("https://kaiplan.app/foo", "always")).toBe(
      "/foo/",
    );
  });
});

describe("normalizeInternalPath edge cases", () => {
  it("treats empty path as root", () => {
    expect(normalizeInternalPath("", "always")).toBe("/");
  });

  it("falls through for unparseable absolute-looking URLs", () => {
    // Malformed URL -> falls back to literal handling -> still normalized.
    const result = normalizeInternalPath("https://", "always");
    expect(typeof result).toBe("string");
  });
});

describe("parseRedirects", () => {
  it("parses source/destination/status rows", () => {
    const txt = `# comment\n/old  /new  301\n/a /b 302\n`;
    const rules = parseRedirects(txt);
    expect(rules).toEqual([
      { from: "/old", to: "/new", status: 301 },
      { from: "/a", to: "/b", status: 302 },
    ]);
  });

  it("defaults status to 301 when omitted", () => {
    expect(parseRedirects("/x /y\n")).toEqual([
      { from: "/x", to: "/y", status: 301 },
    ]);
  });

  it("ignores blank and comment lines", () => {
    expect(parseRedirects("\n# hi\n")).toEqual([]);
  });

  it("skips single-token lines", () => {
    expect(parseRedirects("loneword\n")).toEqual([]);
  });

  it("falls back to 301 for unparseable status codes", () => {
    expect(parseRedirects("/a /b abc\n")).toEqual([
      { from: "/a", to: "/b", status: 301 },
    ]);
  });

  it("handles numeric-looking but infinite status tokens defensively", () => {
    // parseInt('Infinity', 10) is NaN → Number.isFinite(NaN) false → 301.
    expect(parseRedirects("/a /b Infinity\n")).toEqual([
      { from: "/a", to: "/b", status: 301 },
    ]);
  });
});

describe("matchesRedirectRule", () => {
  it("matches literal path", () => {
    const rule = { from: "/old", to: "/new/", status: 301 };
    expect(matchesRedirectRule("/old", rule)).toBe("/new/");
    expect(matchesRedirectRule("/other", rule)).toBe(null);
  });

  it("matches :slug patterns and substitutes", () => {
    const rule = { from: "/w/:slug", to: "/w/:slug/", status: 301 };
    expect(matchesRedirectRule("/w/hello", rule)).toBe("/w/hello/");
    expect(matchesRedirectRule("/w/hello/world", rule)).toBe(null);
  });
});

describe("parseSitemapLocs", () => {
  it("extracts loc entries", () => {
    const xml = `<urlset><url><loc>https://kaiplan.app/</loc></url><url><loc>https://kaiplan.app/pricing/</loc></url></urlset>`;
    expect(parseSitemapLocs(xml)).toEqual([
      "https://kaiplan.app/",
      "https://kaiplan.app/pricing/",
    ]);
  });

  it("returns empty for empty xml", () => {
    expect(parseSitemapLocs("")).toEqual([]);
  });
});

describe("resolveInternalTarget", () => {
  const pages = new Set(["/", "/pricing/", "/compare/", "/sitemap.xml"]);
  const redirects = [
    { from: "/old", to: "/pricing/", status: 301 },
    { from: "/deadend", to: "/missing/", status: 301 },
    { from: "/w/:slug", to: "/w/:slug/", status: 301 },
  ];

  it("resolves direct page hits", () => {
    expect(
      resolveInternalTarget("/pricing/", pages, redirects, "always").status,
    ).toBe("ok");
  });

  it("normalizes trailing slash when needed", () => {
    expect(
      resolveInternalTarget("/pricing", pages, redirects, "always").status,
    ).toBe("ok");
  });

  it("follows redirects to a valid page", () => {
    const r = resolveInternalTarget("/old", pages, redirects, "always");
    expect(r.status).toBe("ok");
    expect(r.finalTarget).toBe("/pricing/");
  });

  it("flags redirects whose target is also missing", () => {
    const r = resolveInternalTarget("/deadend", pages, redirects, "always");
    expect(r.status).toBe("broken");
  });

  it("flags unknown paths", () => {
    expect(
      resolveInternalTarget("/nope/", pages, redirects, "always").status,
    ).toBe("broken");
  });

  it("resolves dynamic-slug redirect rule", () => {
    const pagesWithW = new Set([...pages, "/w/hello/"]);
    expect(
      resolveInternalTarget("/w/hello", pagesWithW, redirects, "always").status,
    ).toBe("ok");
  });

  it("treats public asset files as ok when file exists check is external to this fn", () => {
    expect(
      resolveInternalTarget("/sitemap.xml", pages, redirects, "always").status,
    ).toBe("ok");
  });

  it("resolves an exact-known href that isn't trailing-slashed", () => {
    const exact = new Set(["/pricing.md"]);
    expect(
      resolveInternalTarget("/pricing.md", exact, [], "always").status,
    ).toBe("ok");
  });

  it("resolves when normalized slash form strips back to exact known", () => {
    const custom = new Set(["/raw"]);
    expect(resolveInternalTarget("/raw/", custom, [], "always").status).toBe(
      "ok",
    );
  });

  it("hits direct-href membership fallback (exact raw match)", () => {
    const custom = new Set(["/w/hello?foo=1"]);
    const r = resolveInternalTarget("/w/hello?foo=1", custom, [], "always");
    expect(r.status).toBe("ok");
  });
});

describe("checkAnchorExists", () => {
  it("returns ok when id present", () => {
    const ids = new Set(["top", "mid"]);
    expect(checkAnchorExists("top", ids)).toBe("ok");
  });

  it("returns broken when id missing", () => {
    expect(checkAnchorExists("ghost", new Set())).toBe("broken");
  });
});

describe("checkExternalUrl", () => {
  it("marks 2xx as ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true });
    const r = await checkExternalUrl("https://example.com", { fetchFn });
    expect(r.status).toBe("ok");
    expect(r.httpStatus).toBe(200);
  });

  it("marks 3xx as ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 301, ok: false });
    const r = await checkExternalUrl("https://example.com", { fetchFn });
    expect(r.status).toBe("ok");
  });

  it("marks 4xx as broken", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 404, ok: false });
    const r = await checkExternalUrl("https://example.com", { fetchFn });
    expect(r.status).toBe("broken");
  });

  it("falls back from HEAD to GET when HEAD 405/403", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ status: 405, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true });
    const r = await checkExternalUrl("https://example.com", { fetchFn });
    expect(r.status).toBe("ok");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("marks thrown (timeout/network) as broken", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    const r = await checkExternalUrl("https://example.com", { fetchFn });
    expect(r.status).toBe("broken");
    expect(r.error).toContain("ETIMEDOUT");
  });

  it("marks thrown non-Error as broken", async () => {
    const fetchFn = vi.fn().mockRejectedValue("network-down");
    const r = await checkExternalUrl("https://example.com", { fetchFn });
    expect(r.status).toBe("broken");
    expect(r.error).toBe("network-down");
  });

  it("falls back to GET and reports GET >=400 as broken", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ status: 403, ok: false })
      .mockResolvedValueOnce({ status: 410, ok: false });
    const r = await checkExternalUrl("https://example.com", { fetchFn });
    expect(r.status).toBe("broken");
    expect(r.httpStatus).toBe(410);
  });

  it("surfaces GET error when HEAD demands GET and GET also throws", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ status: 405, ok: false })
      .mockRejectedValueOnce(new Error("EAI_AGAIN"));
    const r = await checkExternalUrl("https://example.com", { fetchFn });
    expect(r.status).toBe("broken");
    expect(r.error).toContain("EAI_AGAIN");
  });

  it("triggers abort controller timer when the fetch hangs", async () => {
    // Simulate a hanging fetch: fetch rejects when the signal aborts.
    const fetchFn = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const r = await checkExternalUrl("https://example.com", {
      fetchFn,
      timeoutMs: 1,
    });
    expect(r.status).toBe("broken");
  });
});

describe("buildAuditReport", () => {
  it("groups broken findings by source page", () => {
    const pagesByPath = new Map([
      [
        "/",
        `<a href="/pricing/">ok</a><a href="/ghost/">bad</a><a href="#ghost">?</a>`,
      ],
      ["/pricing/", `<h1 id="top">t</h1><a href="/">h</a>`],
    ]);
    const knownPaths = new Set(["/", "/pricing/"]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths,
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });
    const rootFindings = report.byPage.get("/") ?? [];
    expect(rootFindings.some((f) => f.href === "/ghost/")).toBe(true);
    expect(rootFindings.some((f) => f.href === "#ghost")).toBe(true);
    expect(report.hasBrokenInternal).toBe(true);
  });

  it("skips mailto/tel hrefs entirely", () => {
    const pagesByPath = new Map([
      ["/", `<a href="mailto:a@b.com">m</a><a href="tel:+15555551234">t</a>`],
    ]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths: new Set(["/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });
    expect(report.hasBrokenInternal).toBe(false);
  });

  it("flags slashless internal route links when trailingSlash is always", () => {
    const pagesByPath = new Map([
      ["/", `<a href="/pricing">Pricing</a><a href="/features/">Features</a>`],
      ["/pricing/", `<a href="/">Home</a>`],
      ["/features/", `<a href="/">Home</a>`],
    ]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths: new Set(["/", "/pricing/", "/features/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });

    const findings = report.byPage.get("/") ?? [];
    expect(findings).toContainEqual({
      href: "/pricing",
      kind: "internal",
      status: "broken",
      reason: "non-canonical-internal-route",
      source: "a",
      finalTarget: "/pricing/",
    });
    expect(findings.some((finding) => finding.href === "/features/")).toBe(
      false,
    );
  });

  it("flags placeholder # hrefs as broken", () => {
    const pagesByPath = new Map([["/", `<a href="#">placeholder</a>`]]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths: new Set(["/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });
    expect(report.hasBrokenInternal).toBe(true);
    const findings = report.byPage.get("/") ?? [];
    expect(findings[0].reason).toBe("placeholder-href");
  });

  it("ignores external probes that passed and passes through unprobed URLs", () => {
    const pagesByPath = new Map([
      [
        "/",
        `<a href="https://live.example.com/">live</a><a href="https://unprobed.example.com/">x</a>`,
      ],
    ]);
    const externalProbes = new Map<string, ExternalProbe>([
      [
        "https://live.example.com/",
        {
          url: "https://live.example.com/",
          result: { status: "ok", httpStatus: 200 },
        },
      ],
    ]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths: new Set(["/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes,
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });
    expect(report.summary.brokenExternal).toBe(0);
    expect(report.byPage.size).toBe(0);
  });

  it("skips internal anchor portion when href ends with bare #", () => {
    const pagesByPath = new Map([["/a/", `<a href="/a/#">bare</a>`]]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths: new Set(["/a/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });
    expect(report.hasBrokenInternal).toBe(false);
  });

  it("records broken external probes and counts them", () => {
    const pagesByPath = new Map([
      ["/", `<a href="https://dead.example.com/">dead</a>`],
    ]);
    const externalProbes = new Map<string, ExternalProbe>([
      [
        "https://dead.example.com/",
        {
          url: "https://dead.example.com/",
          result: { status: "broken", httpStatus: 404 },
        },
      ],
    ]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths: new Set(["/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes,
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });
    expect(report.summary.brokenExternal).toBe(1);
    const findings = report.byPage.get("/") ?? [];
    expect(findings[0].reason).toBe("http:404");
  });

  it("records broken external probes with errors", () => {
    const pagesByPath = new Map([
      ["/", `<a href="https://dead.example.com/">dead</a>`],
    ]);
    const externalProbes = new Map<string, ExternalProbe>([
      [
        "https://dead.example.com/",
        {
          url: "https://dead.example.com/",
          result: { status: "broken", error: "ECONNREFUSED" },
        },
      ],
    ]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths: new Set(["/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes,
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });
    const findings = report.byPage.get("/") ?? [];
    expect(findings[0].reason).toBe("error:ECONNREFUSED");
  });

  it("validates anchors on internal links that target a known rendered page", () => {
    const pagesByPath = new Map([
      ["/pricing/", `<a href="/foo/#ghost">g</a><a href="/foo/#real">r</a>`],
      ["/foo/", `<h1 id="real">r</h1>`],
    ]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths: new Set(["/", "/foo/", "/pricing/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });
    const findings = report.byPage.get("/pricing/") ?? [];
    expect(findings.some((f) => f.anchor === "ghost")).toBe(true);
    expect(findings.some((f) => f.anchor === "real")).toBe(false);
  });

  it("skips anchor validation on SSR pages not in the prerendered set", () => {
    const pagesByPath = new Map([
      ["/pricing/", `<a href="/#hero">home anchor</a>`],
    ]);
    const knownPaths = new Set(["/", "/pricing/"]);
    const report = buildAuditReport({
      pagesByPath,
      knownPaths,
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
    });
    expect(report.hasBrokenInternal).toBe(false);
  });

  it("surfaces lead-magnet and redirect issues", () => {
    const report = buildAuditReport({
      pagesByPath: new Map(),
      knownPaths: new Set(["/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [{ slug: "foo", pdfPath: "/lead-magnets/foo.pdf" }],
      redirectRuleIssues: [
        { from: "/x", to: "/missing/", reason: "target-missing" },
      ],
    });
    expect(report.hasBrokenInternal).toBe(true);
    expect(report.leadMagnetIssues.length).toBe(1);
    expect(report.redirectRuleIssues.length).toBe(1);
  });

  it("reports indexable pages with no inbound internal links", () => {
    const report = buildAuditReport({
      pagesByPath: new Map([
        ["/", `<a href="/linked/">Linked</a>`],
        ["/linked/", `<a href="/">Home</a>`],
        ["/orphan/", `<h1>Orphan</h1>`],
      ]),
      knownPaths: new Set(["/", "/linked/", "/orphan/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
      orphanExclusions: new Set(["/"]),
      enforceNoOrphans: true,
    });

    expect(report.orphanRoutes).toEqual([
      { route: "/orphan/", inboundCount: 0, sources: [] },
    ]);
    expect(report.lowInboundRoutes).toContainEqual({
      route: "/linked/",
      inboundCount: 1,
      sources: ["/"],
    });
    expect(report.hasBrokenInternal).toBe(true);
  });

  it("can fail the report when routes have too few inbound links", () => {
    const report = buildAuditReport({
      pagesByPath: new Map([
        ["/", `<a href="/thin/">Thin</a><a href="/stable/">Stable</a>`],
        ["/thin/", `<a href="/">Home</a>`],
        ["/stable/", `<a href="/thin/">Thin</a>`],
      ]),
      knownPaths: new Set(["/", "/thin/", "/stable/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
      orphanExclusions: new Set(["/"]),
      enforceLowInbound: true,
    });

    expect(report.orphanRoutes).toEqual([]);
    expect(report.lowInboundRoutes).toContainEqual({
      route: "/stable/",
      inboundCount: 1,
      sources: ["/"],
    });
    expect(report.hasBrokenInternal).toBe(true);
  });

  it("ignores noindex pages when checking inbound route quality", () => {
    const report = buildAuditReport({
      pagesByPath: new Map([
        ["/", `<a href="/linked/">Linked</a>`],
        ["/linked/", `<a href="/">Home</a>`],
        [
          "/hidden/",
          `<meta name="robots" content="noindex,follow"><h1>Hidden</h1>`,
        ],
      ]),
      knownPaths: new Set(["/", "/linked/", "/hidden/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
      orphanExclusions: new Set(["/"]),
      enforceNoOrphans: true,
      enforceLowInbound: true,
    });

    expect(report.orphanRoutes).toEqual([]);
    expect(report.lowInboundRoutes.map((issue) => issue.route)).not.toContain(
      "/hidden/",
    );
  });

  it("flags built-output SEO smoke issues when enabled", () => {
    const goodHtml = [
      "<title>Good SEO Page</title>",
      '<meta name="description" content="A useful page description that is long enough for search snippets.">',
      '<link rel="canonical" href="https://kaiplan.app/good/">',
      '<meta property="og:url" content="https://kaiplan.app/good/">',
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>',
    ].join("");
    const badHtml = [
      "<title>Bad</title>",
      '<link rel="canonical" href="https://kaiplan.app/bad/">',
      '<meta property="og:url" content="https://kaiplan.app/wrong/">',
      '<meta property="og:type" content="website">',
      '<meta property="article:published_time" content="2026-05-01">',
      '<script type="application/ld+json">{bad</script>',
      "</html>",
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>',
    ].join("");
    const hiddenHtml = [
      '<meta name="robots" content="noindex, follow">',
      "<title>Hidden SEO Page</title>",
    ].join("");

    const report = buildAuditReport({
      pagesByPath: new Map([
        ["/good/", goodHtml],
        ["/bad/", badHtml],
        ["/hidden/", hiddenHtml],
      ]),
      knownPaths: new Set(["/good/", "/bad/", "/hidden/"]),
      redirects: [],
      trailingSlash: "always",
      externalProbes: new Map<string, ExternalProbe>(),
      leadMagnetIssues: [],
      redirectRuleIssues: [],
      sitemapLocs: new Set([
        "https://kaiplan.app/good/",
        "https://kaiplan.app/bad/",
        "https://kaiplan.app/hidden/",
      ]),
      enableSeoSmoke: true,
    });

    expect(report.seoSmokeIssues.map((issue) => issue.reason)).toEqual(
      expect.arrayContaining([
        "weak-title",
        "missing-description",
        "og-url-mismatch",
        "invalid-json-ld",
        "json-ld-outside-html",
        "article-og-type-mismatch",
        "noindex-in-sitemap",
      ]),
    );
    expect(report.hasBrokenInternal).toBe(true);
  });
});

describe("formatMarkdownReport", () => {
  it("renders unknown-status external entries as 'unknown'", () => {
    const md = formatMarkdownReport({
      byPage: new Map(),
      externalResults: [
        {
          url: "https://strange.example.com/",
          result: { status: "broken" },
        },
      ],
      leadMagnetIssues: [],
      redirectRuleIssues: [],
      hasBrokenInternal: false,
      summary: {
        totalPages: 0,
        totalLinks: 0,
        brokenInternal: 0,
        brokenExternal: 1,
      },
    });
    expect(md).toContain("unknown");
  });

  it("renders empty-page and lead-magnet/redirect sections", () => {
    const md = formatMarkdownReport({
      byPage: new Map(),
      externalResults: [
        {
          url: "https://dead.example.com/",
          result: { status: "broken", httpStatus: 404 },
        },
        {
          url: "https://err.example.com/",
          result: { status: "broken", error: "ECONNREFUSED" },
        },
      ],
      leadMagnetIssues: [{ slug: "foo", pdfPath: "/lead-magnets/foo.pdf" }],
      redirectRuleIssues: [
        { from: "/x", to: "/missing/", reason: "target-missing" },
      ],
      hasBrokenInternal: true,
      summary: {
        totalPages: 0,
        totalLinks: 0,
        brokenInternal: 0,
        brokenExternal: 2,
      },
    });
    expect(md).toContain("Lead magnet manifest issues");
    expect(md).toContain("Redirect rules with dead targets");
    expect(md).toContain("No broken links per page");
    expect(md).toContain("External URLs that failed");
    expect(md).toContain("HTTP 404");
    expect(md).toContain("ECONNREFUSED");
  });

  it("renders findings without reason gracefully", () => {
    const md = formatMarkdownReport({
      byPage: new Map([
        [
          "/",
          [
            {
              href: "/x",
              kind: "internal",
              status: "broken",
            },
          ],
        ],
      ]),
      externalResults: [],
      leadMagnetIssues: [],
      redirectRuleIssues: [],
      hasBrokenInternal: true,
      summary: {
        totalPages: 1,
        totalLinks: 1,
        brokenInternal: 1,
        brokenExternal: 0,
      },
    });
    expect(md).toContain("/x");
  });

  it("renders finalTarget arrows when present", () => {
    const md = formatMarkdownReport({
      byPage: new Map([
        [
          "/",
          [
            {
              href: "/old",
              kind: "internal",
              status: "broken",
              reason: "redirect-target-missing",
              finalTarget: "/gone/",
            },
          ],
        ],
      ]),
      externalResults: [],
      leadMagnetIssues: [],
      redirectRuleIssues: [],
      hasBrokenInternal: true,
      summary: {
        totalPages: 1,
        totalLinks: 1,
        brokenInternal: 1,
        brokenExternal: 0,
      },
    });
    expect(md).toContain("→ `/gone/`");
  });

  it("renders a human-readable markdown grouped by page", () => {
    const md = formatMarkdownReport({
      byPage: new Map([
        [
          "/",
          [
            {
              href: "/ghost/",
              kind: "internal",
              status: "broken",
              reason: "unknown-path",
            },
          ],
        ],
      ]),
      externalResults: [],
      leadMagnetIssues: [],
      redirectRuleIssues: [],
      hasBrokenInternal: true,
      summary: {
        totalPages: 1,
        totalLinks: 1,
        brokenInternal: 1,
        brokenExternal: 0,
      },
    });
    expect(md).toContain("# Link audit report");
    expect(md).toContain("## /");
    expect(md).toContain("/ghost/");
  });
});
