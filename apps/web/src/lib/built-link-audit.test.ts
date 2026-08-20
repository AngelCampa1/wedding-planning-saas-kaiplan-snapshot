import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditBuiltHtmlLinks,
  collectBuiltHtmlRoutes,
} from "./built-link-audit";

const tempDirs: string[] = [];

function makeDistDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "kaiplan-built-links-"));
  tempDirs.push(dir);
  return dir;
}

function writeHtml(distDir: string, relativePath: string, html: string): void {
  const fullPath = join(distDir, relativePath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, html, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("collectBuiltHtmlRoutes", () => {
  it("normalizes built index files into route paths", () => {
    const distDir = makeDistDir();
    writeHtml(distDir, "index.html", "<html></html>");
    writeHtml(distDir, "resources/guides/example/index.html", "<html></html>");

    expect(Array.from(collectBuiltHtmlRoutes(distDir)).sort()).toEqual([
      "/",
      "/resources/guides/example",
    ]);
  });

  it("maps standalone html files to route paths", () => {
    const distDir = makeDistDir();
    writeHtml(distDir, "404.html", "<html></html>");

    expect(Array.from(collectBuiltHtmlRoutes(distDir))).toEqual(["/404"]);
  });
});

describe("auditBuiltHtmlLinks", () => {
  it("reports missing internal html routes from built pages", () => {
    const distDir = makeDistDir();
    writeHtml(
      distDir,
      "index.html",
      '<a href="/compare/alternatives/the-knot-alternative">Broken</a>',
    );
    writeHtml(
      distDir,
      "compare/alternatives/the-knot/index.html",
      "<html></html>",
    );

    expect(auditBuiltHtmlLinks(distDir)).toEqual([
      {
        sourcePath: "/",
        href: "/compare/alternatives/the-knot-alternative",
        resolvedPath: "/compare/alternatives/the-knot-alternative",
      },
    ]);
  });

  it("ignores assets, xml endpoints, anchors, and external links", () => {
    const distDir = makeDistDir();
    writeHtml(
      distDir,
      "index.html",
      [
        '<a href="/apple-touch-icon.png">Icon</a>',
        '<a href="/rss.xml">RSS</a>',
        '<a href="/sitemap-index.xml">Sitemap</a>',
        '<a href="#pricing">Pricing</a>',
        '<a href="https://example.com">External</a>',
      ].join(""),
    );

    expect(auditBuiltHtmlLinks(distDir)).toEqual([]);
  });

  it("treats the root route as a valid internal html target", () => {
    const distDir = makeDistDir();
    writeHtml(
      distDir,
      "index.html",
      '<a href="/resources/guides/example">Guide</a>',
    );
    writeHtml(
      distDir,
      "resources/guides/example/index.html",
      '<a href="/">Home</a>',
    );

    expect(auditBuiltHtmlLinks(distDir)).toEqual([]);
  });

  it("normalizes trailing slashes before validating built routes", () => {
    const distDir = makeDistDir();
    writeHtml(
      distDir,
      "index.html",
      '<a href="/resources/guides/example/">Guide</a>',
    );
    writeHtml(distDir, "resources/guides/example/index.html", "<html></html>");

    expect(auditBuiltHtmlLinks(distDir)).toEqual([]);
  });

  it("resolves relative links from nested routes", () => {
    const distDir = makeDistDir();
    writeHtml(
      distDir,
      "resources/guides/example/index.html",
      '<a href="../checklist">Checklist</a><a href="../missing">Missing</a>',
    );
    writeHtml(
      distDir,
      "resources/guides/checklist/index.html",
      "<html></html>",
    );

    expect(auditBuiltHtmlLinks(distDir)).toEqual([
      {
        sourcePath: "/resources/guides/example",
        href: "../missing",
        resolvedPath: "/resources/guides/missing",
      },
    ]);
  });
});
