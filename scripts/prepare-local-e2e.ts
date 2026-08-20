import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { buildLocalDbConfig, ensureLocalE2ERuntime } from "./local-e2e-config";
import { resetLocalDb, runApiCommand, runPsqlCommand } from "./local-e2e-db";

const LOCAL_E2E_LOCK_DIR = path.join(process.cwd(), ".local-e2e");
const LOCAL_E2E_DB_LOCK_FILE = path.join(
  LOCAL_E2E_LOCK_DIR,
  "prepare-local-e2e.lock",
);
const DEFAULT_LOCK_TIMEOUT_MS = 120_000;
const DEFAULT_LOCK_POLL_INTERVAL_MS = 250;

type LocalDbLockOptions = {
  lockFile?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

function isProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? String(error.code) : "";
    if (code === "EPERM") {
      return true;
    }
    return false;
  }
}

function clearStaleLock(lockPath: string) {
  try {
    const contents = JSON.parse(fs.readFileSync(lockPath, "utf8")) as {
      pid?: number;
    };

    if (!isProcessAlive(contents.pid ?? -1)) {
      const staleLockPath = `${lockPath}.stale-${process.pid}-${Date.now()}`;
      fs.renameSync(lockPath, staleLockPath);
      fs.rmSync(staleLockPath, { force: true, recursive: true });
      return true;
    }
  } catch {
    fs.rmSync(lockPath, { force: true, recursive: true });
    return true;
  }

  return false;
}

export async function withLocalDbLock<T>(
  task: () => Promise<T> | T,
  options: LocalDbLockOptions = {},
) {
  const lockFile = options.lockFile ?? LOCAL_E2E_DB_LOCK_FILE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_LOCK_POLL_INTERVAL_MS;
  const startedAt = Date.now();
  const lockContents = JSON.stringify({
    pid: process.pid,
    createdAt: startedAt,
  });

  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  while (true) {
    try {
      fs.writeFileSync(lockFile, lockContents, { flag: "wx" });
      break;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") {
        throw error;
      }

      if (clearStaleLock(lockFile)) {
        continue;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(
          `Timed out waiting for the local E2E DB lock at ${lockFile}.`,
          { cause: error },
        );
      }

      await delay(pollIntervalMs);
    }
  }

  try {
    return await task();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}

export async function prepareLocalE2E() {
  const runtime = await ensureLocalE2ERuntime();
  const config = buildLocalDbConfig(runtime);

  await withLocalDbLock(async () => {
    resetLocalDb(config);
    runPsqlCommand("CREATE EXTENSION IF NOT EXISTS pgcrypto;", config);
    runApiCommand(
      [
        "--filter",
        "@kaiplan/api",
        "exec",
        "drizzle-kit",
        "migrate",
        "--config",
        "drizzle.config.ts",
      ],
      config,
    );
  });
}

export const LOCAL_E2E_DB_PREP_LOCK_FILE = LOCAL_E2E_DB_LOCK_FILE;

function runCli() {
  return prepareLocalE2E().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli();
}
