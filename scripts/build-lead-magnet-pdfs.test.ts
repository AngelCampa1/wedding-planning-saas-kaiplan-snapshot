import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLeadMagnetPdfs,
  DEFAULT_BRAND,
  sha256Hex,
  type Renderer,
} from "./build-lead-magnet-pdfs";

function fakePdfBuffer(slug: string): Uint8Array {
  const body =
    `%PDF-1.7\n` +
    `% ${slug}\n` +
    `1 0 obj <</Type /Pages /Count 2>> endobj\n` +
    `2 0 obj <</Type /Page>> endobj\n` +
    `3 0 obj <</Type /Page>> endobj\n` +
    `%%EOF\n`;
  const out = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) out[i] = body.charCodeAt(i) & 0xff;
  return out;
}

async function makeFixture(): Promise<{
  contentDir: string;
  outDir: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "lead-magnet-pdf-"));
  const contentDir = join(root, "content");
  const outDir = join(root, "out");
  await writeFile(join(root, "content.placeholder"), "", "utf8").catch(
    () => undefined,
  );
  await writeFile(`${contentDir}-sentinel`, "", "utf8").catch(() => undefined);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(contentDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(contentDir, "alpha.md"),
    `---\ntitle: "Alpha"\nsubtitle: "First"\nfreePreviewSections: 2\n---\n\n## Alpha heading\n\nAlpha body text.\n`,
    "utf8",
  );
  await writeFile(
    join(contentDir, "beta.md"),
    `---\ntitle: "Beta"\ndescription: "Beta desc"\n---\n\n## Beta heading\n\nBeta body text.\n`,
    "utf8",
  );
  return { contentDir, outDir };
}

describe("buildLeadMagnetPdfs", () => {
  it("renders every markdown file to a PDF and writes a manifest", async () => {
    const { contentDir, outDir } = await makeFixture();
    const calls: string[] = [];
    const renderer: Renderer = async (input) => {
      calls.push(input.slug);
      expect(input.html).toContain(
        `${input.slug === "alpha" ? "Alpha" : "Beta"} heading`,
      );
      return { pdf: fakePdfBuffer(input.slug), pageCount: 2 };
    };

    const result = await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      logger: () => undefined,
    });

    expect(calls.sort()).toEqual(["alpha", "beta"]);
    expect(result.manifest.entries.length).toBe(2);
    expect(result.wrote.sort()).toEqual(["alpha", "beta"]);
    expect(result.skipped).toEqual([]);

    const files = (await readdir(outDir)).sort();
    expect(files).toContain("alpha.pdf");
    expect(files).toContain("beta.pdf");
    expect(files).toContain("manifest.json");

    const manifest = JSON.parse(
      await readFile(join(outDir, "manifest.json"), "utf8"),
    );
    expect(manifest.generatedAt).toBe("2026-04-20T00:00:00.000Z");
    const alphaEntry = manifest.entries.find(
      (e: { slug: string }) => e.slug === "alpha",
    );
    expect(alphaEntry.pdfPath).toBe("/lead-magnets/alpha.pdf");
    expect(alphaEntry.title).toBe("Alpha");
    expect(alphaEntry.pageCount).toBe(2);

    const onDisk = await readFile(join(outDir, "alpha.pdf"));
    expect(sha256Hex(onDisk)).toBe(alphaEntry.pdfSha256);
  });

  it("is idempotent: skips entries whose on-disk PDF sha matches the manifest", async () => {
    const { contentDir, outDir } = await makeFixture();
    const renderer: Renderer = async (input) => ({
      pdf: fakePdfBuffer(input.slug),
      pageCount: 2,
    });
    await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      logger: () => undefined,
    });
    const firstManifest = await readFile(join(outDir, "manifest.json"), "utf8");

    let calls = 0;
    const countingRenderer: Renderer = async (input) => {
      calls++;
      return { pdf: fakePdfBuffer(input.slug), pageCount: 2 };
    };
    const result = await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer: countingRenderer,
      now: () => new Date("2026-04-21T00:00:00.000Z"),
      logger: () => undefined,
    });
    expect(calls).toBe(0);
    expect(result.skipped.sort()).toEqual(["alpha", "beta"]);
    expect(result.wrote).toEqual([]);
    expect(await readFile(join(outDir, "manifest.json"), "utf8")).toBe(
      firstManifest,
    );
    expect(result.manifest.generatedAt).toBe("2026-04-20T00:00:00.000Z");
  });

  it("repairs a cached manifest that is missing generatedAt", async () => {
    const { contentDir, outDir } = await makeFixture();
    const renderer: Renderer = async (input) => ({
      pdf: fakePdfBuffer(input.slug),
      pageCount: 2,
    });
    await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      logger: () => undefined,
    });

    const manifest = JSON.parse(
      await readFile(join(outDir, "manifest.json"), "utf8"),
    ) as { generatedAt?: string; entries: unknown[] };
    delete manifest.generatedAt;
    await writeFile(
      join(outDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    const result = await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer: async () => {
        throw new Error("renderer should not run for cached PDFs");
      },
      now: () => new Date("2026-04-21T00:00:00.000Z"),
      logger: () => undefined,
    });

    expect(result.wrote).toEqual([]);
    expect(result.manifest.generatedAt).toBe("2026-04-21T00:00:00.000Z");
    expect(
      JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8")),
    ).toMatchObject({ generatedAt: "2026-04-21T00:00:00.000Z" });
  });

  it("can write the public manifest separately from private PDF artifacts", async () => {
    const { contentDir, outDir } = await makeFixture();
    const manifestDir = join(outDir, "..", "public-manifest");
    const renderer: Renderer = async (input) => ({
      pdf: fakePdfBuffer(input.slug),
      pageCount: 2,
    });

    await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      manifestDir,
      brand: DEFAULT_BRAND,
      renderer,
      logger: () => undefined,
    });

    expect(await readFile(join(outDir, "alpha.pdf"))).toBeDefined();
    await expect(readFile(join(outDir, "manifest.json"))).rejects.toThrow();
    expect(
      JSON.parse(await readFile(join(manifestDir, "manifest.json"), "utf8")),
    ).toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({ pdfPath: "/lead-magnets/alpha.pdf" }),
      ]),
    });
  });

  it("re-renders an entry when the PDF on disk has drifted from the manifest hash", async () => {
    const { contentDir, outDir } = await makeFixture();
    const renderer: Renderer = async (input) => ({
      pdf: fakePdfBuffer(input.slug),
      pageCount: 2,
    });
    await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer,
      logger: () => undefined,
    });
    // Corrupt one PDF on disk so its sha no longer matches the manifest.
    await writeFile(join(outDir, "alpha.pdf"), "not a pdf", "utf8");

    let calls = 0;
    const countingRenderer: Renderer = async (input) => {
      calls++;
      return { pdf: fakePdfBuffer(input.slug), pageCount: 2 };
    };
    const result = await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer: countingRenderer,
      logger: () => undefined,
    });
    expect(calls).toBe(1);
    expect(result.wrote).toEqual(["alpha"]);
    expect(result.skipped).toEqual(["beta"]);
  });

  it("uses frontmatter.description as the subtitle when subtitle is absent", async () => {
    const { contentDir, outDir } = await makeFixture();
    let betaSubtitle: string | undefined;
    const renderer: Renderer = async (input) => {
      if (input.slug === "beta") betaSubtitle = input.subtitle;
      return { pdf: fakePdfBuffer(input.slug), pageCount: 2 };
    };
    await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer,
      logger: () => undefined,
    });
    expect(betaSubtitle).toBe("Beta desc");
  });

  it("logs progress lines for each entry via the injected logger", async () => {
    const { contentDir, outDir } = await makeFixture();
    const lines: string[] = [];
    const renderer: Renderer = async (input) => ({
      pdf: fakePdfBuffer(input.slug),
      pageCount: 2,
    });
    await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer,
      logger: (line) => lines.push(line),
    });
    expect(lines.some((l) => l.includes("+ alpha"))).toBe(true);
    expect(lines.some((l) => l.includes("manifest written"))).toBe(true);
  });

  it("falls back to the default renderer and default clock when not overridden", async () => {
    // Exercise the default-argument branches without triggering Chromium.
    const { contentDir, outDir } = await makeFixture();
    // Stub writeFile path: we simply pass our own renderer but omit now/logger.
    const renderer: Renderer = async (input) => ({
      pdf: fakePdfBuffer(input.slug),
      pageCount: 2,
    });
    const before = Date.now() - 1;
    const { manifest } = await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer,
    });
    const after = Date.now() + 1;
    const ts = Date.parse(manifest.generatedAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("treats a malformed manifest.json as a cache miss", async () => {
    const { contentDir, outDir } = await makeFixture();
    await writeFile(join(outDir, "manifest.json"), "{not json", "utf8");
    const renderer: Renderer = async (input) => ({
      pdf: fakePdfBuffer(input.slug),
      pageCount: 2,
    });
    const result = await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer,
      logger: () => undefined,
    });
    expect(result.wrote.sort()).toEqual(["alpha", "beta"]);
  });

  it("falls back to the slug as the title when frontmatter.title is missing", async () => {
    const { contentDir, outDir } = await makeFixture();
    await writeFile(
      join(contentDir, "untitled.md"),
      `---\nfreePreviewSections: 1\n---\n\n## Body\n\nSome text.\n`,
      "utf8",
    );
    let capturedTitle: string | undefined;
    const renderer: Renderer = async (input) => {
      if (input.slug === "untitled") capturedTitle = input.title;
      return { pdf: fakePdfBuffer(input.slug), pageCount: 2 };
    };
    await buildLeadMagnetPdfs({
      contentDir,
      outDir,
      brand: DEFAULT_BRAND,
      renderer,
      logger: () => undefined,
    });
    expect(capturedTitle).toBe("untitled");
  });
});

describe("sha256Hex", () => {
  it("returns the deterministic sha256 hex of a buffer", () => {
    const bytes = new Uint8Array([97, 98, 99]); // "abc"
    expect(sha256Hex(bytes)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
