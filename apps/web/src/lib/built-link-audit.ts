import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface BuiltLinkIssue {
  sourcePath: string;
  href: string;
  resolvedPath: string;
}

const HTML_HREF_REGEX = /href="([^"]+)"/g;

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    return stats.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function normalizeRoutePath(routePath: string): string {
  if (routePath === "/" || routePath === "") {
    return "/";
  }

  return routePath.endsWith("/") ? routePath.slice(0, -1) : routePath;
}

function htmlFileToRoutePath(distDir: string, filePath: string): string {
  const relativePath = relative(distDir, filePath).replaceAll("\\", "/");

  if (relativePath === "index.html") {
    return "/";
  }

  if (relativePath.endsWith("/index.html")) {
    return normalizeRoutePath(
      `/${relativePath.slice(0, -"index.html".length - 1)}`,
    );
  }

  return normalizeRoutePath(`/${relativePath.slice(0, -".html".length)}`);
}

function isIgnorableHref(href: string): boolean {
  return (
    href.length === 0 ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:") ||
    href.startsWith("data:") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("//")
  );
}

function isHtmlRoutePath(routePath: string): boolean {
  if (routePath === "/") {
    return true;
  }

  const pathSegments = routePath.split("/");
  const lastSegment = pathSegments[pathSegments.length - 1];

  return !lastSegment.includes(".");
}

export function collectBuiltHtmlRoutes(distDir: string): Set<string> {
  const htmlFiles = walkFiles(distDir).filter((filePath) =>
    filePath.endsWith(".html"),
  );

  return new Set(
    htmlFiles.map((filePath) => htmlFileToRoutePath(distDir, filePath)),
  );
}

export function auditBuiltHtmlLinks(distDir: string): BuiltLinkIssue[] {
  const routes = collectBuiltHtmlRoutes(distDir);
  const htmlFiles = walkFiles(distDir).filter((filePath) =>
    filePath.endsWith(".html"),
  );

  const issues: BuiltLinkIssue[] = [];

  for (const filePath of htmlFiles) {
    const sourcePath = htmlFileToRoutePath(distDir, filePath);
    const html = readFileSync(filePath, "utf8");
    const matches = html.matchAll(HTML_HREF_REGEX);

    for (const match of matches) {
      const href = match[1];

      if (isIgnorableHref(href)) {
        continue;
      }

      const resolvedUrl = new URL(
        href,
        `https://kaiplan.test${sourcePath === "/" ? "/" : `${sourcePath}/`}`,
      );
      const resolvedPath = normalizeRoutePath(resolvedUrl.pathname);

      if (!isHtmlRoutePath(resolvedPath)) {
        continue;
      }

      if (!routes.has(resolvedPath)) {
        issues.push({
          sourcePath,
          href,
          resolvedPath,
        });
      }
    }
  }

  return issues;
}
