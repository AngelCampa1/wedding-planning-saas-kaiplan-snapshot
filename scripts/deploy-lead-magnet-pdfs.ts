import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildPnpmInvocation } from "./lib/pnpm-invocation";
import {
  buildLeadMagnetPdfs,
  DEFAULT_BRAND,
  sha256Hex,
  type BuildLeadMagnetPdfsResult,
  type Manifest,
  type ManifestEntry,
} from "./build-lead-magnet-pdfs";

const execFileAsync = promisify(execFile);
const PDF_HEADER = "%PDF";
const DEFAULT_BUCKET = "kaiplan-lead-magnets";

export type CommandRunner = (command: string, args: string[]) => Promise<void>;

export interface DeployLeadMagnetPdfsInput {
  repoRoot: string;
  bucketName?: string;
  build?: (repoRoot: string) => Promise<BuildLeadMagnetPdfsResult>;
  runner?: CommandRunner;
  logger?: (line: string) => void;
  tmpRoot?: string;
}

export interface DeployLeadMagnetPdfsResult {
  bucketName: string;
  uploaded: string[];
  verified: string[];
}

type ValidatedManifestEntry = {
  entry: ManifestEntry;
  localPath: string;
};

export class LeadMagnetPdfDeployError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadMagnetPdfDeployError";
  }
}

export function createCommandInvocation(
  command: string,
  args: string[],
  platform = process.platform,
  comspec = process.env.ComSpec,
): { executable: string; args: string[] } {
  if (command === "pnpm") {
    return buildPnpmInvocation(args, platform, comspec);
  }

  return { executable: command, args };
}

function defaultRunner(command: string, args: string[]): Promise<void> {
  const invocation = createCommandInvocation(command, args);

  return execFileAsync(invocation.executable, invocation.args, {
    cwd: process.cwd(),
    env: process.env,
    timeout: 120_000,
  }).then(() => undefined);
}

async function defaultBuild(
  repoRoot: string,
): Promise<BuildLeadMagnetPdfsResult> {
  return buildLeadMagnetPdfs({
    contentDir: resolve(repoRoot, "apps/web/src/content/lead-magnets"),
    outDir: resolve(repoRoot, "apps/web/.lead-magnets"),
    manifestDir: resolve(repoRoot, "apps/web/public/lead-magnets"),
    brand: DEFAULT_BRAND,
  });
}

async function readManifest(repoRoot: string): Promise<Manifest> {
  const manifestPath = resolve(
    repoRoot,
    "apps/web/public/lead-magnets/manifest.json",
  );
  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new LeadMagnetPdfDeployError("Lead magnet manifest is malformed.");
  }
  return parsed;
}

function validateEntryShape(entry: ManifestEntry): void {
  if (!entry.slug || !/^[a-z0-9-]+$/.test(entry.slug)) {
    throw new LeadMagnetPdfDeployError(
      `Invalid lead magnet slug in manifest: ${entry.slug}`,
    );
  }
  if (entry.pdfPath !== `/lead-magnets/${entry.slug}.pdf`) {
    throw new LeadMagnetPdfDeployError(
      `Manifest pdfPath for ${entry.slug} must be /lead-magnets/${entry.slug}.pdf.`,
    );
  }
  if (!/^[0-9a-f]{64}$/.test(entry.pdfSha256)) {
    throw new LeadMagnetPdfDeployError(
      `Manifest sha256 for ${entry.slug} is invalid.`,
    );
  }
  if (entry.byteSize <= 0 || entry.pageCount <= 0) {
    throw new LeadMagnetPdfDeployError(
      `Manifest metadata for ${entry.slug} must include positive byteSize and pageCount.`,
    );
  }
}

async function validateLocalPdf(
  repoRoot: string,
  entry: ManifestEntry,
): Promise<string> {
  validateEntryShape(entry);
  const pdfPath = resolve(
    repoRoot,
    "apps/web/.lead-magnets",
    `${entry.slug}.pdf`,
  );
  const pdf = await readFile(pdfPath).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    throw new LeadMagnetPdfDeployError(
      `Local PDF for ${entry.slug} is missing or unreadable: ${message}`,
    );
  });
  if (pdf.subarray(0, 4).toString("ascii") !== PDF_HEADER) {
    throw new LeadMagnetPdfDeployError(
      `Local PDF for ${entry.slug} does not start with %PDF.`,
    );
  }
  if (pdf.byteLength !== entry.byteSize) {
    throw new LeadMagnetPdfDeployError(
      `Local PDF byte size for ${entry.slug} does not match manifest.`,
    );
  }
  const localHash = sha256Hex(pdf);
  if (localHash !== entry.pdfSha256) {
    throw new LeadMagnetPdfDeployError(
      `Local PDF sha256 for ${entry.slug} does not match manifest.`,
    );
  }
  return pdfPath;
}

function ensureUniqueSlugs(entries: ManifestEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.slug)) {
      throw new LeadMagnetPdfDeployError(
        `Duplicate lead magnet manifest entry: ${entry.slug}`,
      );
    }
    seen.add(entry.slug);
  }
}

async function uploadAndVerifyEntry(input: {
  bucketName: string;
  entry: ManifestEntry;
  localPath: string;
  remotePath: string;
  runner: CommandRunner;
  logger: (line: string) => void;
}): Promise<void> {
  const { bucketName, entry, localPath, remotePath, runner, logger } = input;
  const objectPath = `${bucketName}/${entry.slug}.pdf`;
  logger(`[deploy-lead-magnet-pdfs] uploading ${entry.slug} to R2`);
  await runner("pnpm", [
    "exec",
    "wrangler",
    "r2",
    "object",
    "put",
    objectPath,
    "--remote",
    "--file",
    localPath,
  ]);

  logger(`[deploy-lead-magnet-pdfs] verifying ${entry.slug} from R2`);
  await runner("pnpm", [
    "exec",
    "wrangler",
    "r2",
    "object",
    "get",
    objectPath,
    "--remote",
    "--file",
    remotePath,
  ]);
  const remotePdf = await readFile(remotePath);
  const remoteHash = sha256Hex(remotePdf);
  if (remoteHash !== entry.pdfSha256) {
    throw new LeadMagnetPdfDeployError(
      `Remote PDF sha256 for ${entry.slug} does not match manifest.`,
    );
  }
}

async function validateManifestEntries(
  repoRoot: string,
  entries: ManifestEntry[],
): Promise<ValidatedManifestEntry[]> {
  const validated: ValidatedManifestEntry[] = [];
  for (const entry of entries) {
    validated.push({
      entry,
      localPath: await validateLocalPdf(repoRoot, entry),
    });
  }
  return validated;
}

export async function deployLeadMagnetPdfs(
  input: DeployLeadMagnetPdfsInput,
): Promise<DeployLeadMagnetPdfsResult> {
  const repoRoot = resolve(input.repoRoot);
  const bucketName = input.bucketName ?? DEFAULT_BUCKET;
  const runner = input.runner ?? defaultRunner;
  const logger = input.logger ?? ((line) => process.stdout.write(`${line}\n`));
  const build = input.build ?? defaultBuild;

  await build(repoRoot);
  const manifest = await readManifest(repoRoot);
  ensureUniqueSlugs(manifest.entries);
  const validatedEntries = await validateManifestEntries(
    repoRoot,
    manifest.entries,
  );

  const tmpRoot =
    input.tmpRoot ?? (await mkdtemp(join(tmpdir(), "kaiplan-r2-pdfs-")));
  const uploaded: string[] = [];
  const verified: string[] = [];

  for (const { entry, localPath } of validatedEntries) {
    const remotePath = join(tmpRoot, `${entry.slug}.pdf`);
    await uploadAndVerifyEntry({
      bucketName,
      entry,
      localPath,
      remotePath,
      runner,
      logger,
    });
    uploaded.push(entry.slug);
    verified.push(entry.slug);
  }

  logger(
    `[deploy-lead-magnet-pdfs] uploaded and verified ${verified.length} PDFs in ${bucketName}`,
  );

  return { bucketName, uploaded, verified };
}

async function runCli(): Promise<void> {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  await deployLeadMagnetPdfs({ repoRoot });
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("deploy-lead-magnet-pdfs.ts")) {
  runCli().catch((err: unknown) => {
    process.stderr.write(
      `[deploy-lead-magnet-pdfs] failed: ${
        err instanceof Error ? (err.stack ?? err.message) : String(err)
      }\n`,
    );
    process.exitCode = 1;
  });
}
