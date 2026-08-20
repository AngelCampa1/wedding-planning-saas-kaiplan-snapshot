import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createCommandInvocation,
  deployLeadMagnetPdfs,
  LeadMagnetPdfDeployError,
  type CommandRunner,
} from "./deploy-lead-magnet-pdfs";
import { sha256Hex, type Manifest } from "./build-lead-magnet-pdfs";

function pdfBytes(slug: string): Buffer {
  return Buffer.from(`%PDF-1.7\n% ${slug}\n1 0 obj\n%%EOF\n`, "utf8");
}

async function makeFixture(): Promise<{
  repoRoot: string;
  outDir: string;
  manifestDir: string;
  tmpRoot: string;
  manifest: Manifest;
}> {
  const repoRoot = await mkdtemp(join(tmpdir(), "deploy-lm-pdfs-"));
  const outDir = join(repoRoot, "apps/web/.lead-magnets");
  const manifestDir = join(repoRoot, "apps/web/public/lead-magnets");
  const tmpRoot = join(repoRoot, "tmp");
  await mkdir(outDir, { recursive: true });
  await mkdir(manifestDir, { recursive: true });
  await mkdir(tmpRoot, { recursive: true });

  const entries: Manifest["entries"] = [];
  for (const slug of ["alpha", "beta"]) {
    const pdf = pdfBytes(slug);
    await writeFile(join(outDir, `${slug}.pdf`), pdf);
    entries.push({
      slug,
      title: slug.toUpperCase(),
      pdfPath: `/lead-magnets/${slug}.pdf`,
      pdfSha256: sha256Hex(pdf),
      byteSize: pdf.byteLength,
      pageCount: 1,
    });
  }
  await writeFile(join(outDir, "ignored-extra.pdf"), pdfBytes("ignored"));

  const manifest: Manifest = {
    generatedAt: "2026-04-27T00:00:00.000Z",
    entries,
  };
  await writeFile(
    join(manifestDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { repoRoot, outDir, manifestDir, tmpRoot, manifest };
}

function makeRunner(options: {
  outDir: string;
  corruptRemote?: boolean;
  calls: string[][];
}): CommandRunner {
  return async (command, args) => {
    options.calls.push([command, ...args]);
    const action = args.at(4);
    const objectPath = args.at(5);
    const fileIndex = args.indexOf("--file");
    const filePath = fileIndex >= 0 ? args.at(fileIndex + 1) : undefined;
    if (!objectPath || !filePath) {
      throw new Error("Unexpected wrangler command shape");
    }
    const slug = objectPath
      .split("/")
      .at(-1)
      ?.replace(/\.pdf$/, "");
    if (!slug) {
      throw new Error("Unexpected R2 object path");
    }
    if (action === "get") {
      if (options.corruptRemote) {
        await writeFile(filePath, pdfBytes(`${slug}-remote-drift`));
      } else {
        await copyFile(join(options.outDir, `${slug}.pdf`), filePath);
      }
    }
  };
}

describe("deployLeadMagnetPdfs", () => {
  let buildCalls: string[];

  beforeEach(() => {
    buildCalls = [];
  });

  it("builds, uploads only manifest entries, and verifies remote hashes", async () => {
    const { repoRoot, outDir, manifestDir, tmpRoot } = await makeFixture();
    const calls: string[][] = [];

    const result = await deployLeadMagnetPdfs({
      repoRoot,
      tmpRoot,
      bucketName: "test-bucket",
      build: async (root) => {
        buildCalls.push(root);
        return {
          manifest: JSON.parse(
            await readFile(join(manifestDir, "manifest.json"), "utf8"),
          ) as Manifest,
          wrote: [],
          skipped: ["alpha", "beta"],
        };
      },
      runner: makeRunner({ outDir, calls }),
      logger: () => undefined,
    });

    expect(buildCalls).toEqual([repoRoot]);
    expect(result).toEqual({
      bucketName: "test-bucket",
      uploaded: ["alpha", "beta"],
      verified: ["alpha", "beta"],
    });

    const objectPaths = calls.map((call) => call[6]);
    expect(objectPaths).toEqual([
      "test-bucket/alpha.pdf",
      "test-bucket/alpha.pdf",
      "test-bucket/beta.pdf",
      "test-bucket/beta.pdf",
    ]);
    expect(objectPaths).not.toContain("test-bucket/ignored-extra.pdf");
  });

  it("fails when a manifest PDF is missing locally", async () => {
    const { repoRoot, manifestDir, tmpRoot } = await makeFixture();
    await writeFile(
      join(manifestDir, "manifest.json"),
      JSON.stringify({
        generatedAt: "2026-04-27T00:00:00.000Z",
        entries: [
          {
            slug: "missing",
            title: "Missing",
            pdfPath: "/lead-magnets/missing.pdf",
            pdfSha256: "a".repeat(64),
            byteSize: 10,
            pageCount: 1,
          },
        ],
      }),
    );

    await expect(
      deployLeadMagnetPdfs({
        repoRoot,
        tmpRoot,
        build: async () => ({
          manifest: JSON.parse(
            await readFile(join(manifestDir, "manifest.json"), "utf8"),
          ) as Manifest,
          wrote: [],
          skipped: [],
        }),
        runner: async () => undefined,
        logger: () => undefined,
      }),
    ).rejects.toThrow(LeadMagnetPdfDeployError);
  });

  it("validates every local PDF before uploading any R2 object", async () => {
    const { repoRoot, outDir, manifestDir, tmpRoot, manifest } =
      await makeFixture();
    const invalidManifest: Manifest = {
      ...manifest,
      entries: [
        manifest.entries[0]!,
        {
          ...manifest.entries[1]!,
          pdfSha256: "b".repeat(64),
        },
      ],
    };
    await writeFile(
      join(manifestDir, "manifest.json"),
      `${JSON.stringify(invalidManifest, null, 2)}\n`,
    );
    const calls: string[][] = [];

    await expect(
      deployLeadMagnetPdfs({
        repoRoot,
        tmpRoot,
        build: async () => ({
          manifest: invalidManifest,
          wrote: [],
          skipped: [],
        }),
        runner: makeRunner({ outDir, calls }),
        logger: () => undefined,
      }),
    ).rejects.toThrow("Local PDF sha256 for beta does not match manifest.");
    expect(calls).toEqual([]);
  });

  it("fails when the fetched remote PDF hash differs from the manifest", async () => {
    const { repoRoot, outDir, manifestDir, tmpRoot } = await makeFixture();

    await expect(
      deployLeadMagnetPdfs({
        repoRoot,
        tmpRoot,
        build: async () => ({
          manifest: JSON.parse(
            await readFile(join(manifestDir, "manifest.json"), "utf8"),
          ) as Manifest,
          wrote: [],
          skipped: [],
        }),
        runner: makeRunner({ outDir, calls: [], corruptRemote: true }),
        logger: () => undefined,
      }),
    ).rejects.toThrow("Remote PDF sha256 for alpha does not match manifest.");
  });
});

describe("createCommandInvocation", () => {
  it("uses cmd.exe for PNPM on Windows because Node cannot spawn .cmd directly", () => {
    expect(
      createCommandInvocation(
        "pnpm",
        ["exec", "wrangler"],
        "win32",
        "C:\\Windows\\System32\\cmd.exe",
      ),
    ).toEqual({
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", "exec", "wrangler"],
    });
  });

  it("falls back to cmd.exe for PNPM on Windows when ComSpec is not set", () => {
    expect(
      createCommandInvocation("pnpm", ["exec", "wrangler"], "win32", ""),
    ).toEqual({
      executable: "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", "exec", "wrangler"],
    });
  });

  it("uses PNPM directly on non-Windows platforms", () => {
    expect(
      createCommandInvocation("pnpm", ["exec", "wrangler"], "linux"),
    ).toEqual({
      executable: "pnpm",
      args: ["exec", "wrangler"],
    });
  });

  it("keeps non-PNPM commands unchanged", () => {
    expect(createCommandInvocation("wrangler", ["--version"])).toEqual({
      executable: "wrangler",
      args: ["--version"],
    });
  });
});
