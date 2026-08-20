import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import {
  renderLeadMagnetPdf,
  type BrandConfig,
  type RenderLeadMagnetPdfInput,
  type RenderLeadMagnetPdfResult,
} from "@kaiplan/lead-magnet-pdf";

export type Renderer = (
  input: RenderLeadMagnetPdfInput,
) => Promise<RenderLeadMagnetPdfResult>;

export interface ManifestEntry {
  slug: string;
  title: string;
  pdfPath: string;
  pdfSha256: string;
  byteSize: number;
  pageCount: number;
}

export interface Manifest {
  generatedAt: string;
  entries: ManifestEntry[];
}

export interface BuildLeadMagnetPdfsInput {
  contentDir: string;
  outDir: string;
  manifestDir?: string;
  brand: BrandConfig;
  renderer?: Renderer;
  now?: () => Date;
  logger?: (line: string) => void;
}

export interface BuildLeadMagnetPdfsResult {
  manifest: Manifest;
  wrote: string[];
  skipped: string[];
}

export const DEFAULT_BRAND: BrandConfig = {
  productName: "Kaiplan",
  domain: "kaiplan.app",
  brandColor: "#B0432A",
  accentColor: "#3A4A2C",
  logoUrl: "https://kaiplan.app/logo-light.svg",
};

export function sha256Hex(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function stripPreviewFrontmatterMeta(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const { freePreviewSections: _omit, ...rest } = data;
  return rest;
}

async function loadExistingManifest(
  path: string,
): Promise<Manifest | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Manifest;
    if (parsed && Array.isArray(parsed.entries)) return parsed;
  } catch {
    // Manifest does not exist yet or is malformed — treat as cache miss.
  }
  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build PDF artifacts from every markdown file in `contentDir`. Idempotent:
 * if the PDF on disk already matches the manifest's recorded sha256, the
 * existing PDF is kept and the entry is marked skipped.
 */
export async function buildLeadMagnetPdfs(
  input: BuildLeadMagnetPdfsInput,
): Promise<BuildLeadMagnetPdfsResult> {
  const {
    contentDir,
    outDir,
    manifestDir = outDir,
    brand,
    renderer = renderLeadMagnetPdf,
    now = () => new Date(),
    logger = (line) => process.stdout.write(`${line}\n`),
  } = input;

  await mkdir(outDir, { recursive: true });
  await mkdir(manifestDir, { recursive: true });
  const manifestPath = join(manifestDir, "manifest.json");
  const existing = await loadExistingManifest(manifestPath);
  const existingBySlug = new Map<string, ManifestEntry>();
  if (existing) {
    for (const entry of existing.entries) existingBySlug.set(entry.slug, entry);
  }

  const files = (await readdir(contentDir))
    .filter((name) => name.endsWith(".md"))
    .sort();

  const entries: ManifestEntry[] = [];
  const wrote: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const raw = await readFile(join(contentDir, file), "utf8");
    const parsed = matter(raw);
    const data = stripPreviewFrontmatterMeta(
      parsed.data as Record<string, unknown>,
    );
    const title = typeof data.title === "string" ? data.title : slug;
    const subtitleCandidate =
      (typeof data.subtitle === "string" && data.subtitle) ||
      (typeof data.description === "string" && data.description) ||
      undefined;

    const pdfPath = join(outDir, `${slug}.pdf`);
    const existingEntry = existingBySlug.get(slug);

    if (existingEntry && (await fileExists(pdfPath))) {
      const onDisk = await readFile(pdfPath);
      const onDiskHash = sha256Hex(onDisk);
      if (onDiskHash === existingEntry.pdfSha256) {
        entries.push(existingEntry);
        skipped.push(slug);
        logger(
          `[build-lead-magnet-pdfs] = ${slug} (cached, ${existingEntry.pageCount} pages, ${formatKb(existingEntry.byteSize)})`,
        );
        continue;
      }
    }

    const html = await marked.parse(parsed.content, { async: true });
    const { pdf, pageCount } = await renderer({
      slug,
      title,
      subtitle: subtitleCandidate,
      html,
      brand,
    });
    await writeFile(pdfPath, pdf);
    const hash = sha256Hex(pdf);
    const entry: ManifestEntry = {
      slug,
      title,
      pdfPath: `/lead-magnets/${slug}.pdf`,
      pdfSha256: hash,
      byteSize: pdf.byteLength,
      pageCount,
    };
    entries.push(entry);
    wrote.push(slug);
    logger(
      `[build-lead-magnet-pdfs] + ${slug} (${pageCount} pages, ${formatKb(pdf.byteLength)})`,
    );
  }

  const canReuseGeneratedAt =
    wrote.length === 0 &&
    existing !== undefined &&
    JSON.stringify(existing.entries) === JSON.stringify(entries);
  const manifest: Manifest = {
    generatedAt:
      canReuseGeneratedAt && typeof existing.generatedAt === "string"
        ? existing.generatedAt
        : now().toISOString(),
    entries,
  };
  const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  const currentManifest = await readFile(manifestPath, "utf8").catch(
    () => null,
  );
  if (currentManifest !== serializedManifest) {
    await writeFile(manifestPath, serializedManifest);
  }
  logger(
    `[build-lead-magnet-pdfs] manifest written to ${manifestPath} (${entries.length} entries, ${wrote.length} regenerated, ${skipped.length} cached)`,
  );

  return { manifest, wrote, skipped };
}

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

async function runCli(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "..");
  const contentDir = resolve(repoRoot, "apps/web/src/content/lead-magnets");
  const outDir = resolve(repoRoot, "apps/web/.lead-magnets");
  const manifestDir = resolve(repoRoot, "apps/web/public/lead-magnets");
  await buildLeadMagnetPdfs({
    contentDir,
    outDir,
    manifestDir,
    brand: DEFAULT_BRAND,
  });
}

// Only run when invoked directly as a CLI (tsx sets argv[1] to this file).
const entry = process.argv[1] ?? "";
if (entry.endsWith("build-lead-magnet-pdfs.ts")) {
  runCli().catch((err: unknown) => {
    process.stderr.write(
      `[build-lead-magnet-pdfs] failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exitCode = 1;
  });
}
