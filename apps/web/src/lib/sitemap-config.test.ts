import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildSitemapConfigOptions } from "./sitemap-config";

function writePage(
  dir: string,
  name: string,
  content = "<div>page</div>\n",
): void {
  writeFileSync(join(dir, name), content, "utf-8");
}

describe("buildSitemapConfigOptions", () => {
  let tmpDir: string;
  let tmpContentDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sitemap-config-"));
    tmpContentDir = mkdtempSync(join(tmpdir(), "sitemap-content-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(tmpContentDir, { recursive: true, force: true });
  });

  it("returns published marketing routes for sitemap generation", () => {
    mkdirSync(join(tmpDir, "resources", "guides"), { recursive: true });
    mkdirSync(join(tmpDir, "compare"), { recursive: true });
    writePage(tmpDir, "index.astro");
    writePage(join(tmpDir, "compare"), "index.astro");
    writePage(
      join(tmpDir, "resources", "guides"),
      "wedding-planning-without-vendor-ads.astro",
    );

    const result = buildSitemapConfigOptions(
      "https://kaiplan.app",
      tmpDir,
      tmpContentDir,
    );

    expect(result.customPages).toContain("https://kaiplan.app/");
    expect(result.customPages).toContain("https://kaiplan.app/pricing.txt");
    expect(result.customPages).toContain("https://kaiplan.app/compare/");
    expect(result.customPages).toContain(
      "https://kaiplan.app/resources/guides/wedding-planning-without-vendor-ads/",
    );
  });

  it("filters out llms endpoints while keeping published routes indexable", () => {
    mkdirSync(join(tmpDir, "resources", "guides"), { recursive: true });
    writePage(join(tmpDir, "resources", "guides"), "visible.astro");

    const result = buildSitemapConfigOptions(
      "https://kaiplan.app",
      tmpDir,
      tmpContentDir,
    );

    expect(result.filter("https://kaiplan.app/llms.txt")).toBe(false);
    expect(result.filter("https://kaiplan.app/llms-full.txt")).toBe(false);
    expect(result.filter("https://kaiplan.app/pricing.txt")).toBe(true);
    expect(result.filter("https://kaiplan.app/api/marketing/signup")).toBe(
      false,
    );
    expect(result.filter("https://kaiplan.app/w/mia-and-noah/")).toBe(false);
    expect(result.filter("https://kaiplan.app/resources/guides/visible/")).toBe(
      true,
    );
  });

  it("includes indexable content routes and excludes noindex content routes", () => {
    mkdirSync(join(tmpDir, "resources", "guides"), { recursive: true });
    mkdirSync(join(tmpContentDir, "guides"), { recursive: true });

    writePage(join(tmpDir, "resources", "guides"), "[slug].astro");
    writeFileSync(
      join(tmpContentDir, "guides", "visible-guide.md"),
      '---\ntitle: "Visible Guide"\n---\n\nVisible guide.',
      "utf-8",
    );
    writeFileSync(
      join(tmpContentDir, "guides", "hidden-guide.md"),
      '---\ntitle: "Hidden Guide"\nnoindex: true\n---\n\nHidden guide.',
      "utf-8",
    );

    const result = buildSitemapConfigOptions(
      "https://kaiplan.app",
      tmpDir,
      tmpContentDir,
    );

    expect(result.customPages).toContain(
      "https://kaiplan.app/resources/guides/visible-guide/",
    );
    expect(result.customPages).not.toContain(
      "https://kaiplan.app/resources/guides/hidden-guide/",
    );
    expect(
      result.filter("https://kaiplan.app/resources/guides/visible-guide/"),
    ).toBe(true);
    expect(
      result.filter("https://kaiplan.app/resources/guides/hidden-guide/"),
    ).toBe(false);
  });

  it("provides stable lastmod dates for static and content routes", () => {
    mkdirSync(join(tmpDir, "resources", "guides"), { recursive: true });
    mkdirSync(join(tmpContentDir, "guides"), { recursive: true });

    writePage(tmpDir, "index.astro");
    writePage(join(tmpDir, "resources", "guides"), "[slug].astro");
    writeFileSync(
      join(tmpContentDir, "guides", "visible-guide.md"),
      '---\ntitle: "Visible Guide"\nupdatedAt: "2026-04-18"\n---\n\nVisible guide.',
      "utf-8",
    );

    const result = buildSitemapConfigOptions(
      "https://kaiplan.app",
      tmpDir,
      tmpContentDir,
    );

    expect(result.lastmodDates["/"]).toBe("2026-04-16");
    expect(result.lastmodDates["/about/"]).toBe("2026-04-16");
    expect(result.lastmodDates["/help/"]).toBe("2026-04-16");
    expect(result.lastmodDates["/pricing.txt"]).toBe("2026-05-12");
    expect(result.lastmodDates["/templates/"]).toBe("2026-04-16");
    expect(result.lastmodDates["/privacy/"]).toBe("2026-04-16");
    expect(result.lastmodDates["/terms/"]).toBe("2026-04-16");
    expect(result.lastmodDates["/resources/guides/visible-guide/"]).toBe(
      "2026-04-18",
    );
    expect(result.lastmodDates["/resources/guides/2/"]).toBeUndefined();
  });
});
