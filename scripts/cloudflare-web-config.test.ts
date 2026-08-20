import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertCloudflareWebConfig,
  assertLeadMagnetR2Binding,
  assertMarketingD1Binding,
  assertPublicApiUrl,
  assertPublicSentryDsn,
  assertPublicTurnstileConfig,
  assertRequiredWebSecrets,
  assertWebCustomDomainRoutes,
  assertWorkerFirstAssetsConfig,
  parseJsonc,
} from "./lib/cloudflare-web-config";
import { buildUnsubscribeBackfillSql } from "./backfill-marketing-unsubscribes";

describe("cloudflare web config", () => {
  it("parses JSONC with line comments", () => {
    expect(
      parseJsonc(`{
        // comment
        "name": "kaiplan-web",
      }`),
    ).toEqual({ name: "kaiplan-web" });
  });

  it("parses JSONC with block comments and trailing array commas", () => {
    expect(
      parseJsonc(`{
        /* block comment */
        "d1_databases": [
          {
            "binding": "DB",
          },
        ],
      }`),
    ).toEqual({
      d1_databases: [
        {
          binding: "DB",
        },
      ],
    });
  });

  it("requires a DB binding for the embedded marketing API", () => {
    expect(() => assertMarketingD1Binding({ d1_databases: [] })).toThrow(
      'D1 binding named "DB"',
    );
  });

  it("requires the canonical production D1 database name", () => {
    expect(() =>
      assertMarketingD1Binding({
        d1_databases: [
          {
            binding: "DB",
            database_name: "kaiplan-marketing",
            database_id: "11111111-1111-4111-8111-111111111111",
          },
        ],
      }),
    ).toThrow("database_name to kaiplan-db");
  });

  it("rejects a missing D1 database id before deploy", () => {
    expect(() =>
      assertMarketingD1Binding({
        d1_databases: [
          {
            binding: "DB",
            database_name: "kaiplan-db",
          },
        ],
      }),
    ).toThrow("production kaiplan-db D1 database id");
  });

  it("accepts a concrete D1 database id", () => {
    expect(() =>
      assertMarketingD1Binding({
        d1_databases: [
          {
            binding: "DB",
            database_name: "kaiplan-db",
            database_id: "11111111-1111-4111-8111-111111111111",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects a missing public Sentry DSN before deploy", () => {
    expect(() => assertPublicSentryDsn({ vars: {} })).toThrow(
      "vars.PUBLIC_SENTRY_DSN",
    );
  });

  it("rejects a missing public API URL before deploy", () => {
    expect(() => assertPublicApiUrl({ vars: {} })).toThrow(
      "vars.PUBLIC_API_URL",
    );
  });

  it("rejects missing or disabled production RSVP Turnstile config before deploy", () => {
    expect(() => assertPublicTurnstileConfig({ vars: {} })).toThrow(
      "vars.PUBLIC_TURNSTILE_SITE_KEY",
    );

    expect(() =>
      assertPublicTurnstileConfig({
        vars: {
          PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAA",
          PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
        },
      }),
    ).toThrow("PUBLIC_RSVP_REQUIRE_TURNSTILE");

    expect(() =>
      assertPublicTurnstileConfig({
        vars: {
          PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAA",
          PUBLIC_RSVP_REQUIRE_TURNSTILE: "true",
        },
      }),
    ).not.toThrow();
  });

  it("accepts a concrete public Sentry DSN", () => {
    expect(() =>
      assertPublicSentryDsn({
        vars: {
          PUBLIC_API_URL: "https://api.kaiplan.app",
          PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
          PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAA",
          PUBLIC_RSVP_REQUIRE_TURNSTILE: "true",
        },
      }),
    ).not.toThrow();
  });

  it("requires the lead magnet R2 bucket binding", () => {
    expect(() => assertLeadMagnetR2Binding({ r2_buckets: [] })).toThrow(
      "LEAD_MAGNETS_R2",
    );
    expect(() =>
      assertLeadMagnetR2Binding({
        r2_buckets: [
          {
            binding: "LEAD_MAGNETS_R2",
            bucket_name: "kaiplan-lead-magnets",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("requires Worker-first static asset routing for canonical redirects", () => {
    expect(() =>
      assertWorkerFirstAssetsConfig({
        assets: { binding: "ASSETS", run_worker_first: false },
      }),
    ).toThrow("run_worker_first to true");

    expect(() =>
      assertWorkerFirstAssetsConfig({
        assets: { binding: "ASSETS", run_worker_first: true },
      }),
    ).not.toThrow();
  });

  it("requires exact Worker custom domains for production marketing traffic", () => {
    expect(() =>
      assertWebCustomDomainRoutes({
        routes: [
          { pattern: "kaiplan.app/*", zone_name: "kaiplan.app" },
          { pattern: "www.kaiplan.app", custom_domain: true },
        ],
      }),
    ).toThrow("kaiplan.app");

    expect(() =>
      assertWebCustomDomainRoutes({
        routes: [
          { pattern: "kaiplan.app", custom_domain: true },
          { pattern: "www.kaiplan.app", custom_domain: true },
        ],
      }),
    ).not.toThrow();
  });

  it("validates the full Cloudflare web deploy config", () => {
    expect(() =>
      assertCloudflareWebConfig({
        main: "./src/worker.ts",
        assets: { binding: "ASSETS", run_worker_first: true },
        vars: {
          PUBLIC_API_URL: "https://api.kaiplan.app",
          PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
          PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAA",
          PUBLIC_RSVP_REQUIRE_TURNSTILE: "true",
        },
        triggers: { crons: ["0 * * * *"] },
        routes: [
          { pattern: "kaiplan.app", custom_domain: true },
          { pattern: "www.kaiplan.app", custom_domain: true },
        ],
        r2_buckets: [
          {
            binding: "LEAD_MAGNETS_R2",
            bucket_name: "kaiplan-lead-magnets",
          },
        ],
        d1_databases: [
          {
            binding: "DB",
            database_name: "kaiplan-db",
            database_id: "11111111-1111-4111-8111-111111111111",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("requires production Worker secrets for the embedded marketing API", () => {
    expect(() => assertRequiredWebSecrets([])).toThrow(
      "RESEND_API_KEY, TURNSTILE_SECRET_KEY",
    );
    expect(() =>
      assertRequiredWebSecrets(["RESEND_API_KEY", "TURNSTILE_SECRET_KEY"]),
    ).not.toThrow();
  });

  it("typechecks deploy and runtime scripts used by production deploys", () => {
    const tsconfig = JSON.parse(
      readFileSync("scripts/tsconfig.json", "utf8"),
    ) as { include?: string[] };

    expect(tsconfig.include).toEqual(
      expect.arrayContaining(["*.ts", "lib/**/*.ts"]),
    );
  });

  it("requires Sequencer Access secrets when Sequencer is configured", () => {
    expect(() =>
      assertRequiredWebSecrets(["RESEND_API_KEY", "TURNSTILE_SECRET_KEY"], {
        vars: { SEQUENCER_BASE_URL: "https://sequencer.example.com" },
      }),
    ).toThrow(
      "SEQUENCER_CF_ACCESS_CLIENT_ID, SEQUENCER_CF_ACCESS_CLIENT_SECRET",
    );

    expect(() =>
      assertRequiredWebSecrets(
        [
          "RESEND_API_KEY",
          "TURNSTILE_SECRET_KEY",
          "SEQUENCER_CF_ACCESS_CLIENT_ID",
          "SEQUENCER_CF_ACCESS_CLIENT_SECRET",
        ],
        { vars: { SEQUENCER_BASE_URL: "https://sequencer.example.com" } },
      ),
    ).not.toThrow();
  });

  it("applies production D1 migrations before publishing the web worker", () => {
    const packageJson = JSON.parse(
      readFileSync("apps/web/package.json", "utf8"),
    ) as { scripts?: Record<string, string> };
    const migrateScript = packageJson.scripts?.["d1:migrate:prod"] ?? "";
    const deployScript = packageJson.scripts?.deploy ?? "";

    expect(migrateScript).toContain(
      "wrangler d1 migrations apply kaiplan-db --remote --config wrangler.jsonc",
    );
    expect(deployScript).toContain("pnpm run d1:migrate:prod");
    expect(deployScript).toContain("pnpm run d1:backfill:prod");
    expect(deployScript.indexOf("pnpm run d1:migrate:prod")).toBeLessThan(
      deployScript.indexOf("pnpm run d1:backfill:prod"),
    );
    expect(deployScript.indexOf("pnpm run d1:backfill:prod")).toBeLessThan(
      deployScript.indexOf("wrangler deploy"),
    );
  });

  it("keeps D1 unsubscribe suppression migrations consistent for fresh and already-migrated databases", () => {
    const dropScheduleMigration = readFileSync(
      "apps/web/d1/migrations/0006_drop_nurture_schedule.sql",
      "utf8",
    );
    const suppressionMigration = readFileSync(
      "apps/web/d1/migrations/0007_signup_unsubscribe_suppression.sql",
      "utf8",
    );

    expect(dropScheduleMigration).toContain(
      "DROP TABLE IF EXISTS nurture_schedule",
    );
    expect(dropScheduleMigration).not.toContain(
      "DROP COLUMN nurture_unsubscribed_at",
    );
    expect(suppressionMigration).toContain(
      "ALTER TABLE signups ADD COLUMN unsubscribed_at TEXT",
    );
    const backfillSql = buildUnsubscribeBackfillSql([
      "email",
      "nurture_unsubscribed_at",
      "unsubscribed_at",
    ]);

    expect(backfillSql).toContain(
      "COALESCE(unsubscribed_at, nurture_unsubscribed_at)",
    );
    expect(backfillSql).toContain(
      "ALTER TABLE signups DROP COLUMN nurture_unsubscribed_at",
    );
    expect(backfillSql).toContain("marketing_backfill_state");
    expect(
      buildUnsubscribeBackfillSql(["email", "unsubscribed_at"], true),
    ).toBe(null);
    expect(() =>
      buildUnsubscribeBackfillSql(["email", "unsubscribed_at"]),
    ).toThrow("Cannot verify marketing unsubscribe backfill");
    expect(() => buildUnsubscribeBackfillSql(["email"])).toThrow(
      "requires signups.unsubscribed_at",
    );
  });
});
