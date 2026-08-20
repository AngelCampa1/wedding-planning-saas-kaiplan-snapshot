import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadInTempWorkspace(options: {
  rootDatabaseUrl?: string;
  apiDatabaseUrl?: string;
  shellDatabaseUrl?: string;
  requireExplicitDatabaseUrl?: boolean;
}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kaiplan-api-env-"));
  const apiDir = path.join(tempRoot, "apps", "api");
  fs.mkdirSync(apiDir, { recursive: true });

  if (options.rootDatabaseUrl) {
    fs.writeFileSync(
      path.join(tempRoot, ".env.local"),
      `DATABASE_URL=${options.rootDatabaseUrl}\n`,
    );
  }
  if (options.apiDatabaseUrl) {
    fs.writeFileSync(
      path.join(apiDir, ".env.local"),
      `DATABASE_URL=${options.apiDatabaseUrl}\n`,
    );
  }

  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.DATABASE_URL;
  if (options.shellDatabaseUrl) {
    process.env.DATABASE_URL = options.shellDatabaseUrl;
  }

  try {
    const { loadApiDatabaseEnv } = await import("../../scripts/database-env");
    loadApiDatabaseEnv({
      cwd: apiDir,
      requireExplicitDatabaseUrl: options.requireExplicitDatabaseUrl,
    });
    return process.env.DATABASE_URL;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("loadApiDatabaseEnv", () => {
  it("lets apps/api/.env.local override the root fallback DATABASE_URL", async () => {
    await expect(
      loadInTempWorkspace({
        rootDatabaseUrl: "postgres://root-db",
        apiDatabaseUrl: "postgres://api-db",
      }),
    ).resolves.toBe("postgres://api-db");
  });

  it("preserves an explicit shell DATABASE_URL over local env files", async () => {
    await expect(
      loadInTempWorkspace({
        rootDatabaseUrl: "postgres://root-db",
        apiDatabaseUrl: "postgres://api-db",
        shellDatabaseUrl: "postgres://shell-db",
      }),
    ).resolves.toBe("postgres://shell-db");
  });

  it("rejects local env fallbacks when an explicit production DATABASE_URL is required", async () => {
    await expect(
      loadInTempWorkspace({
        rootDatabaseUrl: "postgres://root-db",
        apiDatabaseUrl: "postgres://api-db",
        requireExplicitDatabaseUrl: true,
      }),
    ).rejects.toThrow("Explicit DATABASE_URL is required");
  });

  it("rejects localhost DATABASE_URL for production operations", async () => {
    await expect(
      loadInTempWorkspace({
        shellDatabaseUrl: "postgres://localhost/kaiplan_prod",
        requireExplicitDatabaseUrl: true,
      }),
    ).rejects.toThrow("must not point at localhost");
  });

  it("rejects dev database names for production operations", async () => {
    await expect(
      loadInTempWorkspace({
        shellDatabaseUrl: "postgres://db.example.com/kaiplan_dev",
        requireExplicitDatabaseUrl: true,
      }),
    ).rejects.toThrow("non-production database");
  });

  it("accepts explicit production-looking DATABASE_URL for production operations", async () => {
    await expect(
      loadInTempWorkspace({
        shellDatabaseUrl: "postgres://db.example.com/kaiplan_prod",
        requireExplicitDatabaseUrl: true,
      }),
    ).resolves.toBe("postgres://db.example.com/kaiplan_prod");
  });
});
