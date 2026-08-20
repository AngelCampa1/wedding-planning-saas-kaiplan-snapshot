import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withLocalDbLock } from "./prepare-local-e2e";

const tempRoots: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaiplan-e2e-lock-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("withLocalDbLock", () => {
  it("creates and releases a repo-local lock around local db prep", async () => {
    const root = makeTempDir();
    const lockFile = path.join(root, "local-e2e-db.lock");

    const result = await withLocalDbLock(
      () => {
        expect(fs.existsSync(lockFile)).toBe(true);
        return "prepared";
      },
      {
        lockFile,
        timeoutMs: 50,
        pollIntervalMs: 10,
      },
    );

    expect(result).toBe("prepared");
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("replaces a stale lock left behind by a dead process", async () => {
    const root = makeTempDir();
    const lockFile = path.join(root, "local-e2e-db.lock");
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 999_999, createdAt: 0 }));

    await withLocalDbLock(
      () => {
        const lockContents = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        expect(lockContents.pid).toBe(process.pid);
      },
      {
        lockFile,
        timeoutMs: 50,
        pollIntervalMs: 10,
      },
    );

    expect(fs.existsSync(lockFile)).toBe(false);
  });
});
