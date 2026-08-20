import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg, { type QueryResultRow } from "pg";
import { buildPnpmInvocation } from "../../../scripts/lib/pnpm-invocation";

const { Client } = pg;

type LegacyPreferenceRow = {
  id: string;
  email: string;
  wedding_id: string | null;
  preference_type: string;
  enabled: boolean;
  updated_at: Date | string;
  created_at: Date | string;
};

type LegacyTokenRow = {
  id: string;
  email: string;
  wedding_id: string | null;
  allowed_types: string[] | null;
  expires_at: Date | string;
  used_at: Date | string | null;
  created_at: Date | string;
};

type LegacySendLogRow = {
  id: string;
  email: string;
  wedding_id: string | null;
  email_type: string;
  status: string;
  provider_message_id: string | null;
  error_message: string | null;
  created_at: Date | string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const webWranglerConfig = resolve(repoRoot, "apps/web/wrangler.jsonc");
const databaseName = "kaiplan-db";
const WRANGLER_D1_TIMEOUT_MS = 300_000;

const signupsColumns = [
  {
    name: "queue_position",
    definition: "queue_position INTEGER NOT NULL DEFAULT 0",
  },
  { name: "lead_magnet_title", definition: "lead_magnet_title TEXT" },
  { name: "lead_magnet_url", definition: "lead_magnet_url TEXT" },
  { name: "email_sent_at", definition: "email_sent_at TEXT" },
];

function parseArgs() {
  const remote = process.argv.includes("--remote");
  const local = process.argv.includes("--local");

  if (remote === local) {
    throw new Error("Pass exactly one of --remote or --local.");
  }

  return { remote };
}

export function buildWranglerD1Invocation(
  args: string[],
  platform = process.platform,
  comspec = process.env.ComSpec,
) {
  return buildPnpmInvocation(["exec", "wrangler", ...args], platform, comspec);
}

export function formatWranglerD1ResultError(
  args: string[],
  result: Pick<
    ReturnType<typeof spawnSync>,
    "error" | "status" | "stdout" | "stderr"
  >,
): Error | null {
  if (result.error) {
    return new Error(
      [`wrangler ${args.join(" ")} failed.`, result.error.message]
        .filter(Boolean)
        .join("\n"),
      { cause: result.error },
    );
  }

  if (result.status !== 0) {
    return new Error(
      [
        `wrangler ${args.join(" ")} failed.`,
        trimSpawnOutput(result.stdout),
        trimSpawnOutput(result.stderr),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return null;
}

function trimSpawnOutput(value: string | Buffer | null | undefined) {
  return typeof value === "string" ? value.trim() : value?.toString().trim();
}

function runWrangler(args: string[]) {
  const command = buildWranglerD1Invocation(args);
  const result = spawnSync(command.executable, command.args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: WRANGLER_D1_TIMEOUT_MS,
  });

  const error = formatWranglerD1ResultError(args, result);
  if (error) {
    throw error;
  }

  return result.stdout;
}

function executeD1(command: string, remote: boolean) {
  return runWrangler([
    "d1",
    "execute",
    databaseName,
    remote ? "--remote" : "--local",
    "--command",
    command,
    "--config",
    webWranglerConfig,
    "--json",
  ]);
}

function executeD1File(sql: string, remote: boolean) {
  const tempDir = mkdtempSync(resolve(tmpdir(), "kaiplan-d1-backfill-"));
  const filePath = resolve(tempDir, "backfill.sql");

  try {
    writeFileSync(filePath, sql);
    runWrangler([
      "d1",
      "execute",
      databaseName,
      remote ? "--remote" : "--local",
      "--file",
      filePath,
      "--config",
      webWranglerConfig,
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function parseD1Results<T>(output: string): T[] {
  const parsed = JSON.parse(output) as Array<{ results?: T[] }>;
  return parsed.flatMap((entry) => entry.results ?? []);
}

function sqlString(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  const raw =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return `'${raw.replaceAll("'", "''")}'`;
}

function timestamp(value: Date | string | null): string {
  if (value === null) return "NULL";
  return sqlString(value instanceof Date ? value.toISOString() : value);
}

function jsonArray(value: string[] | null): string {
  return sqlString(JSON.stringify(value ?? []));
}

async function tableExists(client: pg.Client, tableName: string) {
  const result = await client.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`],
  );
  return result.rows[0]?.exists === true;
}

async function rowsForTable<T extends QueryResultRow>(
  client: pg.Client,
  tableName: string,
) {
  if (!(await tableExists(client, tableName))) {
    return [] as T[];
  }

  const result = await client.query<T>(`SELECT * FROM ${tableName}`);
  return result.rows;
}

function preferenceInsert(row: LegacyPreferenceRow) {
  return `INSERT OR REPLACE INTO email_preference (id, email, wedding_id, preference_type, enabled, updated_at, created_at) VALUES (${[
    sqlString(row.id),
    sqlString(row.email),
    sqlString(row.wedding_id),
    sqlString(row.preference_type),
    row.enabled ? "1" : "0",
    timestamp(row.updated_at),
    timestamp(row.created_at),
  ].join(", ")});`;
}

function tokenInsert(row: LegacyTokenRow) {
  return `INSERT OR REPLACE INTO email_unsubscribe_token (id, email, wedding_id, allowed_types, expires_at, used_at, created_at) VALUES (${[
    sqlString(row.id),
    sqlString(row.email),
    sqlString(row.wedding_id),
    jsonArray(row.allowed_types),
    timestamp(row.expires_at),
    timestamp(row.used_at),
    timestamp(row.created_at),
  ].join(", ")});`;
}

function sendLogInsert(row: LegacySendLogRow) {
  return `INSERT OR REPLACE INTO email_send_log (id, email, wedding_id, email_type, status, provider_message_id, error_message, created_at) VALUES (${[
    sqlString(row.id),
    sqlString(row.email),
    sqlString(row.wedding_id),
    sqlString(row.email_type),
    sqlString(row.status),
    sqlString(row.provider_message_id),
    sqlString(row.error_message),
    timestamp(row.created_at),
  ].join(", ")});`;
}

function countSql() {
  return [
    "SELECT 'email_preference' AS table_name, COUNT(*) AS row_count FROM email_preference",
    "SELECT 'email_unsubscribe_token' AS table_name, COUNT(*) AS row_count FROM email_unsubscribe_token",
    "SELECT 'email_send_log' AS table_name, COUNT(*) AS row_count FROM email_send_log",
  ].join(" UNION ALL ");
}

function assertEmptyDestination(
  rows: Array<{ table_name: string; row_count: number }>,
) {
  const nonEmptyRows = rows.filter((row) => Number(row.row_count) > 0);

  if (nonEmptyRows.length > 0) {
    throw new Error(
      [
        "Refusing to backfill because D1 email tables are not empty.",
        "Run this before deploying the D1-writing API, or inspect and migrate manually.",
        JSON.stringify(nonEmptyRows, null, 2),
      ].join("\n"),
    );
  }
}

async function main() {
  const { remote } = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required so legacy Neon email rows can be verified and backfilled.",
    );
  }

  const pragmaRows = parseD1Results<{ name: string }>(
    executeD1("PRAGMA table_info(signups);", remote),
  );
  const existingColumns = new Set(pragmaRows.map((row) => row.name));
  const missingColumns = signupsColumns.filter(
    (column) => !existingColumns.has(column.name),
  );

  if (missingColumns.length > 0) {
    executeD1File(
      missingColumns
        .map((column) => `ALTER TABLE signups ADD COLUMN ${column.definition};`)
        .join("\n"),
      remote,
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const preferences = await rowsForTable<LegacyPreferenceRow>(
      client,
      "email_preference",
    );
    const tokens = await rowsForTable<LegacyTokenRow>(
      client,
      "email_unsubscribe_token",
    );
    const sendLogs = await rowsForTable<LegacySendLogRow>(
      client,
      "email_send_log",
    );

    const beforeCounts = parseD1Results<{
      table_name: string;
      row_count: number;
    }>(executeD1(countSql(), remote));

    assertEmptyDestination(beforeCounts);

    const statements = [
      ...preferences.map(preferenceInsert),
      ...tokens.map(tokenInsert),
      ...sendLogs.map(sendLogInsert),
    ];

    if (statements.length > 0) {
      executeD1File(
        ["BEGIN TRANSACTION;", ...statements, "COMMIT;"].join("\n"),
        remote,
      );
    }

    const d1Counts = parseD1Results<{ table_name: string; row_count: number }>(
      executeD1(countSql(), remote),
    );

    console.log(
      JSON.stringify(
        {
          repairedSignupsColumns: missingColumns.map((column) => column.name),
          sourceCounts: {
            email_preference: preferences.length,
            email_unsubscribe_token: tokens.length,
            email_send_log: sendLogs.length,
          },
          beforeD1Counts: beforeCounts,
          d1Counts,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
