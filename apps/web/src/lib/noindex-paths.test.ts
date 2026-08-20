import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getNoindexPaths } from "./noindex-paths";

function writeFile(dir: string, name: string, content: string): void {
  writeFileSync(join(dir, name), content, "utf-8");
}

function makeFrontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${lines}\n---\n\nBody content here.`;
}

describe("getNoindexPaths", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "noindex-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty Set when no content directory exists", () => {
    const result = getNoindexPaths(join(tmpDir, "nonexistent"));
    expect(result).toEqual(new Set());
  });

  it("returns an empty Set when all files have no noindex field", () => {
    const altDir = join(tmpDir, "alternatives");
    mkdirSync(altDir);
    writeFile(
      altDir,
      "foo-alternative.md",
      makeFrontmatter({ title: '"Foo"', buyerStage: '"bofu"' }),
    );

    const result = getNoindexPaths(tmpDir);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set when noindex is false", () => {
    const altDir = join(tmpDir, "alternatives");
    mkdirSync(altDir);
    writeFile(
      altDir,
      "foo-alternative.md",
      makeFrontmatter({ noindex: "false" }),
    );

    const result = getNoindexPaths(tmpDir);
    expect(result.size).toBe(0);
  });

  it("uses competitor.slug from frontmatter for the alternatives path", () => {
    const altDir = join(tmpDir, "alternatives");
    mkdirSync(altDir);
    // Real alternative files have competitor.slug in frontmatter — the route
    // is /compare/alternatives/:competitorSlug, NOT :filename.
    writeFile(
      altDir,
      "the-knot-alternative.md",
      `---\nnoindex: true\ncompetitor:\n  slug: "the-knot"\n---\n\nBody.`,
    );

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/compare/alternatives/the-knot/");
    expect(result).not.toContain("/compare/alternatives/the-knot-alternative/");
  });

  it("falls back to filename slug when competitor.slug is absent from alternatives frontmatter", () => {
    const altDir = join(tmpDir, "alternatives");
    mkdirSync(altDir);
    writeFile(
      altDir,
      "the-knot-alternative.md",
      makeFrontmatter({ noindex: "true" }),
    );

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/compare/alternatives/the-knot-alternative/");
  });

  it("collects the path for a comparisons file with noindex: true", () => {
    const dir = join(tmpDir, "comparisons");
    mkdirSync(dir);
    writeFile(dir, "the-knot-vs-zola.md", makeFrontmatter({ noindex: "true" }));

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/compare/versus/the-knot-vs-zola/");
  });

  it("collects the path for a pricing-breakdowns file with noindex: true", () => {
    const dir = join(tmpDir, "pricing-breakdowns");
    mkdirSync(dir);
    writeFile(dir, "zola-pricing.md", makeFrontmatter({ noindex: "true" }));

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/compare/pricing/zola-pricing/");
  });

  it("collects the path for a listicles file with noindex: true", () => {
    const dir = join(tmpDir, "listicles");
    mkdirSync(dir);
    writeFile(
      dir,
      "best-wedding-planning-apps.md",
      makeFrontmatter({ noindex: "true" }),
    );

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/resources/best/best-wedding-planning-apps/");
  });

  it("collects the path for a guides file with noindex: true", () => {
    const dir = join(tmpDir, "guides");
    mkdirSync(dir);
    writeFile(
      dir,
      "how-to-plan-a-wedding.md",
      makeFrontmatter({ noindex: "true" }),
    );

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/resources/guides/how-to-plan-a-wedding/");
  });

  it("collects the path for a lead-magnets file with noindex: true", () => {
    const dir = join(tmpDir, "lead-magnets");
    mkdirSync(dir);
    writeFile(dir, "budget-template.md", makeFrontmatter({ noindex: "true" }));

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/free/budget-template/");
  });

  it("does not include a state-pages path (kaiplan has no state-pages collection)", () => {
    const dir = join(tmpDir, "state-pages");
    mkdirSync(dir);
    writeFile(
      dir,
      "texas-wedding-venues.md",
      makeFrontmatter({ noindex: "true" }),
    );

    const result = getNoindexPaths(tmpDir);
    expect(result.size).toBe(0);
  });

  it("collects paths from multiple collections at once", () => {
    const altDir = join(tmpDir, "alternatives");
    mkdirSync(altDir);
    // Uses competitor.slug "zola", not the filename "zola-alternative"
    writeFile(
      altDir,
      "zola-alternative.md",
      `---\nnoindex: true\ncompetitor:\n  slug: "zola"\n---\n\nBody.`,
    );

    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    writeFile(
      guidesDir,
      "wedding-budget-guide.md",
      makeFrontmatter({ noindex: "true" }),
    );

    // This one should NOT appear — noindex not set
    const listiclesDir = join(tmpDir, "listicles");
    mkdirSync(listiclesDir);
    writeFile(
      listiclesDir,
      "best-wedding-apps.md",
      makeFrontmatter({ title: '"Best Wedding Apps"' }),
    );

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/compare/alternatives/zola/");
    expect(result).not.toContain("/compare/alternatives/zola-alternative/");
    expect(result).toContain("/resources/guides/wedding-budget-guide/");
    expect(result).not.toContain("/resources/best/best-wedding-apps/");
    expect(result.size).toBe(2);
  });

  it("ignores non-.md files in collection directories", () => {
    const altDir = join(tmpDir, "alternatives");
    mkdirSync(altDir);
    writeFile(altDir, "README.txt", "noindex: true\nsome text");
    writeFile(altDir, "draft.json", '{"noindex": true}');

    const result = getNoindexPaths(tmpDir);
    expect(result.size).toBe(0);
  });

  it("does not match noindex: true appearing only in the body (outside frontmatter)", () => {
    const altDir = join(tmpDir, "alternatives");
    mkdirSync(altDir);
    writeFile(
      altDir,
      "foo.md",
      `---\ntitle: "Foo"\n---\n\nnoindex: true appears in body.`,
    );

    const result = getNoindexPaths(tmpDir);
    expect(result.size).toBe(0);
  });

  it("does not match files without valid frontmatter delimiters", () => {
    const altDir = join(tmpDir, "alternatives");
    mkdirSync(altDir);
    writeFile(altDir, "no-frontmatter.md", "# Just a heading\nnoindex: true");

    const result = getNoindexPaths(tmpDir);
    expect(result.size).toBe(0);
  });

  it("handles frontmatter where noindex: true has extra whitespace", () => {
    const altDir = join(tmpDir, "alternatives");
    mkdirSync(altDir);
    writeFile(altDir, "spaced.md", `---\nnoindex:  true  \n---\n\nBody.`);

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/compare/alternatives/spaced/");
  });

  it("handles CRLF frontmatter in real Windows markdown files", () => {
    const guidesDir = join(tmpDir, "guides");
    mkdirSync(guidesDir);
    writeFileSync(
      join(guidesDir, "wedding-song-guide.md"),
      '---\r\ntitle: "Wedding Song Guide"\r\nnoindex: true\r\n---\r\n\r\nBody.',
      "utf-8",
    );

    const result = getNoindexPaths(tmpDir);
    expect(result).toContain("/resources/guides/wedding-song-guide/");
  });
});
