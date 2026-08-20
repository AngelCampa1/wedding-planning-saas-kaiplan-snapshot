import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import {
  buildWindowsCleanupScript,
  CLEANUP_COMMAND_TIMEOUT_MS,
  cleanupRepoOwnedService,
  runGuardedLocalService,
} from "./guard-local-service";

const spawnSyncMock = vi.mocked(spawnSync);

afterEach(() => {
  spawnSyncMock.mockReset();
});

describe("buildWindowsCleanupScript", () => {
  it("treats an empty port lookup as a no-op instead of a PowerShell error", () => {
    const script = buildWindowsCleanupScript({
      port: 3000,
      match: "vite --host 127.0.0.1 --port 3000",
    });

    expect(script).toContain(
      "Get-NetTCPConnection -LocalPort $port -State Listen",
    );
    expect(script).toContain("$_.ProcessId -in $listeningProcessIds");
    expect(script).toContain('$_.CommandLine -like "*$match*"');
    expect(script).toContain("exit 0");
  });

  it("excludes the guard process itself from the Windows cleanup match set", () => {
    const script = buildWindowsCleanupScript({
      port: 4321,
      match: "astro.mjs",
    });

    expect(script).toContain("$PID");
    expect(script).toContain("ProcessId -ne $PID");
  });

  it("excludes Codex command lines from the Windows cleanup match set", () => {
    const script = buildWindowsCleanupScript({
      port: 4321,
      match: "astro.mjs",
    });

    expect(script).toContain('$_.CommandLine -notlike "*codex*"');
  });

  it("escapes PowerShell -like wildcard characters in repoRoot", () => {
    const script = buildWindowsCleanupScript({
      port: 3000,
      match: "vite.js",
      repoRoot: "C:\\projects\\my*repo[dev]",
    });

    // Wildcard chars must be escaped with backtick so -like treats them as literals.
    expect(script).toContain("`*");
    expect(script).toContain("`[");
    // The path should not contain raw unescaped wildcard chars in the clause.
    expect(script).not.toMatch(/\*repo\[dev\]/);
  });

  it("escapes single quotes in repoRoot for PowerShell string safety", () => {
    const script = buildWindowsCleanupScript({
      port: 3000,
      match: "vite.js",
      repoRoot: "C:\\my'repo",
    });

    expect(script).toContain("''");
  });

  it("requires both repo root and match string for Windows cleanup", () => {
    const script = buildWindowsCleanupScript({
      port: 5031,
      match: "serve-local-marketing-api.ts",
      repoRoot: "C:\\Users\\dev\\Documents\\kaiplan",
    });

    expect(script).toContain("$_.ProcessId -in $listeningProcessIds");
    expect(script).toContain(
      '$_.CommandLine -like "*C:\\Users\\dev\\Documents\\kaiplan*"',
    );
    expect(script).toContain('$_.CommandLine -like "*$match*"');
  });

  it("accepts multiple repo root aliases for Windows cleanup", () => {
    const script = buildWindowsCleanupScript({
      port: 3031,
      match: "astro.mjs",
      repoRoots: ["D:\\code\\kaiplan", "C:\\Users\\dev\\Documents\\kaiplan"],
    });

    expect(script).toContain('$_.CommandLine -like "*D:\\code\\kaiplan*"');
    expect(script).toContain(
      '$_.CommandLine -like "*C:\\Users\\dev\\Documents\\kaiplan*"',
    );
    expect(script).toContain("-or");
    expect(script).toContain('$_.CommandLine -like "*$match*"');
  });
});

describe("cleanupRepoOwnedService", () => {
  it("treats an idle Unix port as a no-op instead of scanning and killing matching processes", () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: "",
      stderr: "",
    } as ReturnType<typeof spawnSync>);

    const killed = cleanupRepoOwnedService({
      port: 3000,
      match: "vite.js",
      platform: "linux",
    });

    expect(killed).toEqual([]);
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(spawnSyncMock).toHaveBeenCalledWith(
      "sh",
      ["-lc", "lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null || true"],
      {
        encoding: "utf8",
        stdio: "pipe",
        timeout: CLEANUP_COMMAND_TIMEOUT_MS,
      },
    );
  });

  it("ignores Unix kill races when the matched pid has already exited", () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: "123\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout:
          "123 node /repo/node_modules/vite.js --host 127.0.0.1 --port 3000\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "kill: (123): No such process",
      } as ReturnType<typeof spawnSync>);

    const killed = cleanupRepoOwnedService({
      port: 3000,
      match: "vite.js",
      platform: "linux",
    });

    expect(killed).toEqual([]);
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      2,
      "ps",
      ["-eo", "pid=,command="],
      {
        encoding: "utf8",
        stdio: "pipe",
        timeout: CLEANUP_COMMAND_TIMEOUT_MS,
      },
    );
    expect(spawnSyncMock).toHaveBeenNthCalledWith(3, "kill", ["-9", "123"], {
      encoding: "utf8",
      stdio: "pipe",
      timeout: CLEANUP_COMMAND_TIMEOUT_MS,
    });
  });

  it("fails Unix cleanup when the port probe times out", () => {
    spawnSyncMock.mockReturnValueOnce({
      pid: 0,
      output: [],
      status: null,
      signal: null,
      error: Object.assign(new Error("spawnSync sh ETIMEDOUT"), {
        code: "ETIMEDOUT",
      }),
      stdout: "",
      stderr: "",
    } as ReturnType<typeof spawnSync>);

    expect(() =>
      cleanupRepoOwnedService({
        port: 3000,
        match: "vite.js",
        platform: "linux",
      }),
    ).toThrow("Failed to inspect port 3000: spawnSync sh ETIMEDOUT");
  });

  it("treats empty-stderr Windows cleanup inspection failures as a no-op", () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 1,
      stdout: "",
      stderr: "",
    } as ReturnType<typeof spawnSync>);

    const killed = cleanupRepoOwnedService({
      port: 3131,
      match: "astro.mjs",
      platform: "win32",
    });

    expect(killed).toEqual([]);
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  it("does not kill Unix repo-owned listener children when the command omits the match string", () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: "123\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: "123 node /repo/node_modules/.bin/tsx/dist/cli.mjs\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      } as ReturnType<typeof spawnSync>);

    const killed = cleanupRepoOwnedService({
      port: 5031,
      match: "serve-local-marketing-api.ts",
      repoRoot: "/repo",
      platform: "linux",
    });

    expect(killed).toEqual([]);
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
  });

  it("does not kill Unix listeners whose command line belongs to Codex", () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: "123\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout:
          "123 codex exec node /repo/scripts/serve-local-marketing-api.ts\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>);

    const killed = cleanupRepoOwnedService({
      port: 5031,
      match: "serve-local-marketing-api.ts",
      repoRoot: "/repo",
      platform: "linux",
    });

    expect(killed).toEqual([]);
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
  });

  it("kills Unix repo-owned listener commands when both repo root and match string match", () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: "123\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: "123 node /repo/scripts/serve-local-marketing-api.ts\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      } as ReturnType<typeof spawnSync>);

    const killed = cleanupRepoOwnedService({
      port: 5031,
      match: "serve-local-marketing-api.ts",
      repoRoot: "/repo",
      platform: "linux",
    });

    expect(killed).toEqual(["123"]);
    expect(spawnSyncMock).toHaveBeenNthCalledWith(3, "kill", ["-9", "123"], {
      encoding: "utf8",
      stdio: "pipe",
      timeout: CLEANUP_COMMAND_TIMEOUT_MS,
    });
  });

  it("kills Unix repo-owned listener commands that match any repo root alias", () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: "123\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout:
          "123 node /mnt/c/Users/dev/Documents/kaiplan/node_modules/astro.mjs preview\n",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      } as ReturnType<typeof spawnSync>);

    const killed = cleanupRepoOwnedService({
      port: 3031,
      match: "astro.mjs",
      repoRoots: ["/repo/kaiplan", "/mnt/c/Users/dev/Documents/kaiplan"],
      platform: "linux",
    });

    expect(killed).toEqual(["123"]);
  });

  it("surfaces signal-terminated guarded services instead of treating them as success", () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
      } as ReturnType<typeof spawnSync>);

    expect(() =>
      runGuardedLocalService({
        label: "app",
        port: 3000,
        match: "vite.js",
        command: "pnpm --filter @kaiplan/app exec vite",
      }),
    ).toThrow("Guarded app process terminated with signal SIGTERM.");
  });

  it("passes explicit repo root aliases to cleanup before starting the service", () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      } as ReturnType<typeof spawnSync>);

    runGuardedLocalService({
      label: "web",
      port: 3031,
      match: "astro.mjs",
      command: "pnpm --filter @kaiplan/web exec astro preview",
      repoRoots: ["D:\\code\\kaiplan", "C:\\Users\\dev\\Documents\\kaiplan"],
    });

    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      1,
      "powershell",
      expect.arrayContaining([expect.stringContaining("D:\\code\\kaiplan")]),
      expect.any(Object),
    );
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      1,
      "powershell",
      expect.arrayContaining([
        expect.stringContaining("C:\\Users\\dev\\Documents\\kaiplan"),
      ]),
      expect.any(Object),
    );
  });
});
