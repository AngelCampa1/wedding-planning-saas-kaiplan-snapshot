import { config } from "dotenv";
import path from "node:path";

const NON_PRODUCTION_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const NON_PRODUCTION_DATABASE_NAME_PATTERN =
  /(^|[_-])(dev|development|local|test|testing|staging|stage)([_-]|$)/i;

export function assertProductionDatabaseUrl(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL.");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL must use the postgres/postgresql protocol.");
  }

  if (NON_PRODUCTION_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      "DATABASE_URL must not point at localhost for production API database operations.",
    );
  }

  const databaseName = parsed.pathname.replace(/^\/+/, "");
  if (NON_PRODUCTION_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      "DATABASE_URL appears to target a non-production database. Refusing production API database operation.",
    );
  }
}

export function loadApiDatabaseEnv({
  cwd = process.cwd(),
  requireExplicitDatabaseUrl = false,
}: { cwd?: string; requireExplicitDatabaseUrl?: boolean } = {}) {
  const shellDatabaseUrl = process.env.DATABASE_URL;

  if (requireExplicitDatabaseUrl) {
    if (!shellDatabaseUrl) {
      throw new Error(
        "Explicit DATABASE_URL is required for production API database operations. Refusing to use .env.local fallback.",
      );
    }
    assertProductionDatabaseUrl(shellDatabaseUrl);
    return;
  }

  config({ path: path.resolve(cwd, "../../.env.local") });

  if (shellDatabaseUrl) {
    process.env.DATABASE_URL = shellDatabaseUrl;
    return;
  }

  config({ path: path.resolve(cwd, ".env.local"), override: true });
}
