import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getPublishedMarketingPageUrls,
  getPublishedMarketingRouteInventory,
} from "./published-marketing-route-inventory";

function writePage(
  dir: string,
  name: string,
  content = "---\n---\n\n<div>page</div>\n",
): void {
  writeFileSync(join(dir, name), content, "utf-8");
}

describe("getPublishedMarketingRouteInventory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "published-marketing-routes-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("collects indexable routes from concrete page files", () => {
    mkdirSync(join(tmpDir, "compare", "alternatives"), { recursive: true });
    mkdirSync(join(tmpDir, "resources", "guides"), { recursive: true });

    writePage(tmpDir, "index.astro");
    writePage(tmpDir, "privacy.astro");
    writePage(join(tmpDir, "compare"), "index.astro");
    writePage(join(tmpDir, "compare", "alternatives"), "the-knot.astro");
    writePage(
      join(tmpDir, "resources", "guides"),
      "wedding-planning-without-vendor-ads.astro",
    );

    const inventory = getPublishedMarketingRouteInventory(tmpDir);

    expect(inventory.indexablePaths).toEqual(
      new Set([
        "/",
        "/privacy/",
        "/compare/",
        "/compare/alternatives/the-knot/",
        "/resources/guides/wedding-planning-without-vendor-ads/",
      ]),
    );
    expect(inventory.noindexPaths.size).toBe(0);
  });

  it("ignores dynamic, error, api, and noindex pages", () => {
    mkdirSync(join(tmpDir, "api"), { recursive: true });
    mkdirSync(join(tmpDir, "resources", "guides"), { recursive: true });
    mkdirSync(join(tmpDir, "w"), { recursive: true });

    writePage(tmpDir, "404.astro");
    writePage(tmpDir, "500.astro");
    writePage(tmpDir, "notes.md", "# ignored");
    writePage(join(tmpDir, "api"), "health.astro");
    writePage(join(tmpDir, "resources", "guides"), "[slug].astro");
    writePage(join(tmpDir, "resources", "guides"), "[...page].astro");
    writePage(join(tmpDir, "w"), "[slug].astro");
    writePage(join(tmpDir, "resources", "guides"), "visible.test.astro");
    writePage(
      join(tmpDir, "resources", "guides"),
      "hidden.astro",
      "<Layout noindex={true} />\n",
    );
    writePage(join(tmpDir, "resources", "guides"), "visible.astro");

    const inventory = getPublishedMarketingRouteInventory(tmpDir);

    expect(inventory.allPaths).toEqual(
      new Set(["/resources/guides/hidden/", "/resources/guides/visible/"]),
    );
    expect(inventory.indexablePaths).toEqual(
      new Set(["/resources/guides/visible/"]),
    );
    expect(inventory.noindexPaths).toEqual(
      new Set(["/resources/guides/hidden/"]),
    );
  });

  it("ignores pages under the w/ top-level route without dynamic segments", () => {
    // Exercises the EXCLUDED_ROUTE_PATTERNS branch for /^w\/.+/i via a concrete
    // (non-dynamic) file that does not contain "[", reaching line 53 in
    // shouldIgnorePage rather than being caught by the dynamic-segment guard.
    mkdirSync(join(tmpDir, "w"), { recursive: true });
    mkdirSync(join(tmpDir, "resources"), { recursive: true });

    writePage(join(tmpDir, "w"), "wedding-smith.astro");
    writePage(join(tmpDir, "resources"), "visible.astro");

    const inventory = getPublishedMarketingRouteInventory(tmpDir);

    expect(inventory.allPaths).toEqual(new Set(["/resources/visible/"]));
    expect(inventory.indexablePaths).toEqual(new Set(["/resources/visible/"]));
  });
});

describe("getPublishedMarketingPageUrls", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "published-marketing-urls-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("builds absolute urls for published indexable routes", () => {
    mkdirSync(join(tmpDir, "compare"), { recursive: true });
    writePage(join(tmpDir, "compare"), "index.astro");

    expect(
      getPublishedMarketingPageUrls("https://kaiplan.app", tmpDir),
    ).toEqual(["https://kaiplan.app/compare/"]);
  });

  it("uses a provided inventory instead of reading from disk", () => {
    expect(
      getPublishedMarketingPageUrls("https://kaiplan.app", undefined, {
        allPaths: new Set(["/hidden/"]),
        indexablePaths: new Set(["/", "/pricing/"]),
        noindexPaths: new Set(["/hidden/"]),
      }),
    ).toEqual(["https://kaiplan.app/", "https://kaiplan.app/pricing/"]);
  });
});
