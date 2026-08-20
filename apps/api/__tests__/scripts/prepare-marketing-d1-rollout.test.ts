import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildWranglerD1Invocation,
  formatWranglerD1ResultError,
} from "../../scripts/prepare-marketing-d1-rollout";

describe("prepare marketing D1 rollout script", () => {
  it("bounds Wrangler D1 calls so rollout preparation cannot hang indefinitely", () => {
    const source = readScriptSource();

    expect(source).toContain("const WRANGLER_D1_TIMEOUT_MS = 300_000");
    expect(source).toContain("timeout: WRANGLER_D1_TIMEOUT_MS");
  });

  it("uses a Windows-safe pnpm invocation for Wrangler", () => {
    expect(
      buildWranglerD1Invocation(
        ["d1", "execute", "kaiplan-db"],
        "win32",
        "C:\\Windows\\System32\\cmd.exe",
      ),
    ).toEqual({
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "pnpm.cmd",
        "exec",
        "wrangler",
        "d1",
        "execute",
        "kaiplan-db",
      ],
    });
  });

  it("reports spawn errors before status failures", () => {
    const spawnError = new Error("spawnSync pnpm ENOENT");
    const result = {
      error: spawnError,
      status: 1,
      stdout: "ignored stdout",
      stderr: "ignored stderr",
    } as const;

    const error = formatWranglerD1ResultError(["d1", "execute"], result);

    expect(error?.message).toContain("spawnSync pnpm ENOENT");
    expect(error?.message).not.toContain("ignored stdout");
    expect(error?.cause).toBe(spawnError);
  });

  it("includes Wrangler output for non-zero status failures", () => {
    const error = formatWranglerD1ResultError(["d1", "execute"], {
      error: undefined,
      status: 1,
      stdout: "stdout detail",
      stderr: "stderr detail",
    });

    expect(error?.message).toContain("wrangler d1 execute failed.");
    expect(error?.message).toContain("stdout detail");
    expect(error?.message).toContain("stderr detail");
  });

  it("does not manually apply columns owned by pending tracked D1 migrations", () => {
    const source = readScriptSource();

    expect(source).not.toContain(
      '{ name: "unsubscribed_at", definition: "unsubscribed_at TEXT" }',
    );
  });
});

function readScriptSource() {
  return readFileSync("scripts/prepare-marketing-d1-rollout.ts", {
    encoding: "utf8",
  });
}
