import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type GuardOptions = {
  label: string;
  port: number;
  match: string;
  command: string;
  repoRoots?: string[];
};

export const CLEANUP_COMMAND_TIMEOUT_MS = 5_000;
const PROTECTED_PROCESS_COMMAND_PATTERNS = ["codex"];

function parseArgs(argv: string[]): GuardOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key?.startsWith("--") || !value) {
      throw new Error(
        "Expected --label, --port, --match, and --command arguments.",
      );
    }

    const normalizedKey = key.slice(2);
    if (normalizedKey === "repo-root") {
      values.set(
        normalizedKey,
        [values.get(normalizedKey), value].filter(Boolean).join("\n"),
      );
      continue;
    }

    values.set(normalizedKey, value);
  }

  const label = values.get("label");
  const port = Number(values.get("port"));
  const match = values.get("match");
  const command = values.get("command");
  const repoRoots = values
    .get("repo-root")
    ?.split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!label || !Number.isInteger(port) || !match || !command) {
    throw new Error(
      "Expected --label, --port, --match, and --command arguments.",
    );
  }

  return {
    label,
    port,
    match,
    command,
    repoRoots,
  };
}

function runCommand(command: string, args: string[]) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: CLEANUP_COMMAND_TIMEOUT_MS,
  });
}

function escapePowerShell(value: string) {
  // Escape single quotes for PowerShell string literals, then escape -like
  // wildcard characters so repoRoot paths containing *, ?, or [ are treated
  // as literal characters rather than glob patterns.
  return value.replace(/'/g, "''").replace(/[*?[]/g, "`$&");
}

function isMissingProcessError(output: string) {
  return /no such process|esrch/i.test(output);
}

function isProtectedProcessCommand(commandLine: string) {
  const normalizedCommandLine = commandLine.toLowerCase();

  return PROTECTED_PROCESS_COMMAND_PATTERNS.some((pattern) =>
    normalizedCommandLine.includes(pattern),
  );
}

export function buildWindowsCleanupScript(options: {
  port: number;
  match: string;
  repoRoot?: string;
  repoRoots?: string[];
}) {
  const repoRoots = [
    ...(options.repoRoot ? [options.repoRoot] : []),
    ...(options.repoRoots ?? []),
  ].filter((value, index, values) => values.indexOf(value) === index);
  const ownerClause =
    repoRoots.length > 0
      ? repoRoots
          .map(
            (repoRoot) =>
              `$_.CommandLine -like "*${escapePowerShell(repoRoot)}*"`,
          )
          .join(" -or ")
      : `$_.CommandLine -like "*$match*"`;
  const commandClause = `$_.CommandLine -like "*$match*"`;
  const processOwnerClause =
    repoRoots.length > 0
      ? `(${ownerClause}) -and (${commandClause})`
      : commandClause;
  const protectedProcessClause = PROTECTED_PROCESS_COMMAND_PATTERNS.map(
    (pattern) => `$_.CommandLine -notlike "*${escapePowerShell(pattern)}*"`,
  ).join(" -and ");

  return [
    `$port = ${options.port}`,
    `$match = '${escapePowerShell(options.match)}'`,
    "$listeningProcessIds = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)",
    "$targetProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {",
    `  $null -ne $_.CommandLine -and $_.ProcessId -ne $PID -and $_.ProcessId -in $listeningProcessIds -and (${protectedProcessClause}) -and (${processOwnerClause})`,
    "} | Select-Object -ExpandProperty ProcessId -Unique)",
    "foreach ($processId in $targetProcesses) {",
    "  Write-Output $processId",
    "}",
    "exit 0",
  ].join("; ");
}

export function cleanupRepoOwnedService(options: {
  port: number;
  match: string;
  repoRoot?: string;
  repoRoots?: string[];
  platform?: NodeJS.Platform;
}) {
  const platform = options.platform ?? process.platform;
  const repoRoots = [
    ...(options.repoRoot ? [options.repoRoot] : []),
    ...(options.repoRoots ?? []),
  ].filter((value, index, values) => values.indexOf(value) === index);

  if (platform === "win32") {
    const script = buildWindowsCleanupScript({
      port: options.port,
      match: options.match,
      repoRoots,
    });

    const result = runCommand("powershell", ["-NoProfile", "-Command", script]);
    if (result.status !== 0) {
      if (!result.stderr.trim()) {
        return [];
      }

      throw new Error(
        `Failed to clean up port ${options.port}: ${result.stderr.trim()}`,
      );
    }

    const pids = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const pid of pids) {
      const stopped = runCommand("taskkill", ["/PID", pid, "/T", "/F"]);
      if (stopped.status !== 0) {
        const output =
          `${stopped.stderr || ""}\n${stopped.stdout || ""}`.trim();
        if (/not found/i.test(output)) {
          continue;
        }

        throw new Error(
          `Failed to stop process ${pid}: ${output || "unknown taskkill error"}`,
        );
      }
    }

    return pids;
  }

  const listeningProcesses = runCommand("sh", [
    "-lc",
    `lsof -nP -iTCP:${options.port} -sTCP:LISTEN -t 2>/dev/null || true`,
  ]);
  if (listeningProcesses.error) {
    throw new Error(
      `Failed to inspect port ${options.port}: ${listeningProcesses.error.message}`,
      { cause: listeningProcesses.error },
    );
  }

  if (listeningProcesses.status !== 0) {
    throw new Error(
      `Failed to inspect port ${options.port}: ${listeningProcesses.stderr.trim() || "unknown lsof error"}`,
    );
  }

  const listeningPids = new Set(
    listeningProcesses.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );

  if (listeningPids.size === 0) {
    return [];
  }

  const processes = runCommand("ps", ["-eo", "pid=,command="]);
  if (processes.status !== 0) {
    throw new Error(
      `Failed to inspect running processes: ${processes.stderr.trim() || "unknown ps error"}`,
    );
  }

  const pids = processes.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/);
      if (!match) {
        return null;
      }

      return {
        pid: match[1],
        commandLine: match[2],
      };
    })
    .filter(
      (entry): entry is { pid: string; commandLine: string } =>
        entry !== null &&
        (listeningPids.size === 0 || listeningPids.has(entry.pid)) &&
        !isProtectedProcessCommand(entry.commandLine) &&
        entry.commandLine.includes(options.match) &&
        (repoRoots.length === 0 ||
          repoRoots.some((repoRoot) => entry.commandLine.includes(repoRoot))),
    );
  const killed: string[] = [];

  for (const processInfo of pids) {
    const stopped = runCommand("kill", ["-9", processInfo.pid]);
    if (stopped.status !== 0) {
      const output = `${stopped.stderr || ""}\n${stopped.stdout || ""}`.trim();
      if (isMissingProcessError(output)) {
        continue;
      }

      throw new Error(
        `Failed to stop process ${processInfo.pid}: ${output || "unknown kill error"}`,
      );
    }
    killed.push(processInfo.pid);
  }

  return killed;
}

export function runGuardedLocalService(options: GuardOptions) {
  const cleaned = cleanupRepoOwnedService({
    port: options.port,
    match: options.match,
    repoRoots: options.repoRoots?.length ? options.repoRoots : [process.cwd()],
  });

  if (cleaned.length > 0) {
    console.log(
      `Stopped stale ${options.label} process(es) on port ${options.port}: ${cleaned.join(", ")}`,
    );
  }

  const result = spawnSync(options.command, {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    stdio: "inherit",
  });

  if (typeof result.status === "number") {
    process.exitCode = result.status;
    return;
  }

  if (result.signal) {
    throw new Error(
      `Guarded ${options.label} process terminated with signal ${result.signal}.`,
    );
  }

  if (result.error) {
    throw result.error;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  runGuardedLocalService(options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
