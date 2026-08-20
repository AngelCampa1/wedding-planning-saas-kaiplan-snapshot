import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPnpmInvocation } from "./lib/pnpm-invocation";

const DATABASE_NAME = "kaiplan-db";
const WRANGLER_D1_TIMEOUT_MS = 300_000;
const CONFIG_PATH = existsSync("wrangler.jsonc")
  ? "wrangler.jsonc"
  : join("apps", "web", "wrangler.jsonc");
const UNSUBSCRIBE_BACKFILL_KEY = "signup_unsubscribe_legacy_backfill";

type D1CommandResult<T> = { results?: T[] };
type D1Result<T> = D1CommandResult<T> & {
  result?: Array<D1CommandResult<T>>;
};

export function extractWranglerJsonPayload(raw: string): string {
  // `wrangler d1 execute --json` can interleave progress text (for example
  // "├ Checking if file needs uploading") into stdout alongside the JSON
  // payload. Slice from the first JSON bracket to the last so the progress
  // noise does not break JSON.parse.
  const bracketIndexes = [raw.indexOf("["), raw.indexOf("{")].filter(
    (index) => index >= 0,
  );
  if (bracketIndexes.length === 0) {
    return raw;
  }
  const start = Math.min(...bracketIndexes);
  const end = Math.max(raw.lastIndexOf("]"), raw.lastIndexOf("}"));
  return end >= start ? raw.slice(start, end + 1) : raw.slice(start);
}

export function parseD1Results<T>(raw: string): T[] {
  const parsed = JSON.parse(extractWranglerJsonPayload(raw)) as
    | D1Result<T>
    | Array<D1CommandResult<T>>;
  // `wrangler d1 execute --json` returns an array of command results
  // (`[{ results: [...] }]`); older shapes used `{ results }` or
  // `{ result: [{ results }] }`. Handle all three.
  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry) => entry.results ?? []);
  }
  if (Array.isArray(parsed.results)) {
    return parsed.results;
  }
  return parsed.result?.flatMap((entry) => entry.results ?? []) ?? [];
}

function runD1(sql: string) {
  // Use `--command` (the D1 query endpoint) rather than `--file`. On current
  // wrangler, `d1 execute --file` routes through the D1 import API, which
  // returns import statistics instead of query rows and requires an
  // import-scoped API token. `--command` returns real result rows and works
  // with the standard OAuth login used everywhere else in this deploy.
  const command = buildPnpmInvocation([
    "exec",
    "wrangler",
    "d1",
    "execute",
    DATABASE_NAME,
    "--remote",
    "--config",
    CONFIG_PATH,
    "--command",
    sql,
    "--json",
  ]);
  const result = spawnSync(command.executable, command.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: WRANGLER_D1_TIMEOUT_MS,
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      [
        "wrangler d1 execute failed while backfilling marketing unsubscribes.",
        result.error?.message,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
      { cause: result.error },
    );
  }

  return result.stdout;
}

export function buildUnsubscribeBackfillSql(
  columns: string[],
  completedBackfill = false,
) {
  const columnSet = new Set(columns);
  const hasLegacyColumn = columnSet.has("nurture_unsubscribed_at");
  const hasCurrentColumn = columnSet.has("unsubscribed_at");

  if (hasLegacyColumn && hasCurrentColumn) {
    return [
      "BEGIN TRANSACTION;",
      "UPDATE signups",
      "SET unsubscribed_at = COALESCE(unsubscribed_at, nurture_unsubscribed_at)",
      "WHERE nurture_unsubscribed_at IS NOT NULL;",
      "CREATE TABLE IF NOT EXISTS marketing_backfill_state (",
      "  key TEXT PRIMARY KEY,",
      "  completed_at TEXT NOT NULL",
      ");",
      "INSERT OR REPLACE INTO marketing_backfill_state (key, completed_at)",
      `VALUES ('${UNSUBSCRIBE_BACKFILL_KEY}', CURRENT_TIMESTAMP);`,
      "ALTER TABLE signups DROP COLUMN nurture_unsubscribed_at;",
      "COMMIT;",
    ].join("\n");
  }

  if (!hasLegacyColumn && hasCurrentColumn && completedBackfill) {
    return null;
  }

  if (!hasLegacyColumn && hasCurrentColumn) {
    throw new Error(
      [
        "Cannot verify marketing unsubscribe backfill because signups.nurture_unsubscribed_at is missing.",
        "If a prior migration already dropped the legacy column, inspect the production D1 backup and backfill signups.unsubscribed_at manually before deploying.",
      ].join("\n"),
    );
  }

  throw new Error(
    "Marketing unsubscribe backfill requires signups.unsubscribed_at. Apply D1 migrations before running the backfill.",
  );
}

function hasCompletedUnsubscribeBackfill() {
  const markerTableRows = parseD1Results<{ marker_exists: number }>(
    runD1(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'marketing_backfill_state') AS marker_exists;",
    ),
  );
  const hasMarkerTable = Number(markerTableRows[0]?.marker_exists ?? 0) === 1;

  if (!hasMarkerTable) {
    return false;
  }

  const markerRows = parseD1Results<{ count: number }>(
    runD1(
      `SELECT COUNT(*) AS count FROM marketing_backfill_state WHERE key = '${UNSUBSCRIBE_BACKFILL_KEY}';`,
    ),
  );

  return Number(markerRows[0]?.count ?? 0) > 0;
}

function main() {
  const columns = parseD1Results<{ name: string }>(
    runD1("PRAGMA table_info(signups);"),
  ).map((row) => row.name);
  const sql = buildUnsubscribeBackfillSql(
    columns,
    hasCompletedUnsubscribeBackfill(),
  );

  if (!sql) {
    console.log("No legacy signup unsubscribe column to backfill.");
    return;
  }

  runD1(sql);
  console.log(
    "Backfilled signup unsubscribed_at from legacy unsubscribe data.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
