import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  assertApiMarketingDbBinding,
  assertRequiredApiSecrets,
  assertApiCustomDomainRoute,
  assertHyperdriveBinding,
  parseTomlApiConfig,
  parseWranglerSecretNames,
  WRANGLER_SECRET_LIST_TIMEOUT_MS,
} from "./lib/cloudflare-api-config";
import { STRIPE_PRICE_ENV_KEYS } from "../packages/shared/src/index";

const REQUIRED_STRIPE_PRICE_SECRET_NAMES = Object.values(
  STRIPE_PRICE_ENV_KEYS,
).flatMap((keysByInterval) => Object.values(keysByInterval));

describe("cloudflare api config", () => {
  it("parses the Hyperdrive binding from Wrangler TOML", () => {
    expect(
      parseTomlApiConfig(`
        name = "kaiplan-api"

        [[hyperdrive]]
        binding = "HYPERDRIVE"
        id = "abc123"
      `),
    ).toEqual({
      d1_databases: [],
      hyperdrive: [{ binding: "HYPERDRIVE", id: "abc123" }],
      routes: [],
    });
  });

  it("parses custom domain routes from Wrangler TOML", () => {
    expect(
      parseTomlApiConfig(`
        name = "kaiplan-api"

        [[routes]]
        pattern = "api.kaiplan.app"
        custom_domain = true
      `),
    ).toEqual({
      d1_databases: [],
      hyperdrive: [],
      routes: [{ pattern: "api.kaiplan.app", custom_domain: true }],
    });
  });

  it("parses the MARKETING_DB D1 binding from Wrangler TOML", () => {
    expect(
      parseTomlApiConfig(`
        name = "kaiplan-api"

        [[d1_databases]]
        binding = "MARKETING_DB"
        database_name = "kaiplan-db"
        database_id = "d1-id"
        migrations_dir = "../../apps/web/d1/migrations"
      `),
    ).toEqual({
      d1_databases: [
        {
          binding: "MARKETING_DB",
          database_name: "kaiplan-db",
          database_id: "d1-id",
          migrations_dir: "../../apps/web/d1/migrations",
        },
      ],
      hyperdrive: [],
      routes: [],
    });
  });

  it("requires the production Hyperdrive id before deploy", () => {
    expect(() =>
      assertHyperdriveBinding({
        hyperdrive: [{ binding: "HYPERDRIVE", id: "" }],
      }),
    ).toThrow("production kaiplan-hyperdrive id");
  });

  it("accepts a concrete Hyperdrive id", () => {
    expect(() =>
      assertHyperdriveBinding({
        hyperdrive: [{ binding: "HYPERDRIVE", id: "abc123" }],
      }),
    ).not.toThrow();
  });

  it("requires the production MARKETING_DB D1 binding before deploy", () => {
    expect(() =>
      assertApiMarketingDbBinding({
        d1_databases: [
          {
            binding: "ANALYTICS_DB",
            database_name: "kaiplan-db",
            database_id: "d1-id",
            migrations_dir: "../../apps/web/d1/migrations",
          },
        ],
      }),
    ).toThrow('D1 binding named "MARKETING_DB"');

    expect(() =>
      assertApiMarketingDbBinding({
        d1_databases: [
          {
            binding: "MARKETING_DB",
            database_name: "kaiplan-db",
            database_id: "",
            migrations_dir: "../../apps/web/d1/migrations",
          },
        ],
      }),
    ).toThrow("MARKETING_DB.database_id");

    expect(() =>
      assertApiMarketingDbBinding({
        d1_databases: [
          {
            binding: "MARKETING_DB",
            database_name: "kaiplan-db",
            database_id: "d1-id",
            migrations_dir: "../../apps/web/d1/migrations",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("requires api.kaiplan.app to be configured as a Worker custom domain", () => {
    expect(() =>
      assertApiCustomDomainRoute({
        routes: [{ pattern: "api.kaiplan.app/*", zone_name: "kaiplan.app" }],
      }),
    ).toThrow("api.kaiplan.app");

    expect(() =>
      assertApiCustomDomainRoute({
        routes: [{ pattern: "api.kaiplan.app", custom_domain: true }],
      }),
    ).not.toThrow();
  });

  it("rejects legacy API zone routes even when the custom domain is present", () => {
    expect(() =>
      assertApiCustomDomainRoute({
        routes: [
          { pattern: "api.kaiplan.app", custom_domain: true },
          { pattern: "api.kaiplan.app/*", zone_name: "kaiplan.app" },
        ],
      }),
    ).toThrow("exact Worker custom domain");
  });

  it("parses Wrangler secret names from object output", () => {
    expect(
      parseWranglerSecretNames(
        JSON.stringify([
          { name: "SENTRY_DSN", type: "secret_text" },
          { name: "OTHER_SECRET", type: "secret_text" },
        ]),
      ),
    ).toEqual(["SENTRY_DSN", "OTHER_SECRET"]);
  });

  it("parses Wrangler secret names from string output", () => {
    expect(parseWranglerSecretNames(JSON.stringify(["SENTRY_DSN"]))).toEqual([
      "SENTRY_DSN",
    ]);
  });

  it("requires the production Sentry secret before deploy", () => {
    expect(() => assertRequiredApiSecrets([])).toThrow(
      "Cloudflare Worker secrets BETTER_AUTH_SECRET",
    );
  });

  it("requires operational production API secrets before deploy", () => {
    const missingOperationalSecrets = [
      "BETTER_AUTH_SECRET",
      "EMAIL_FROM_ADDRESS",
      "EMAIL_TOKEN_SECRET",
      "SENTRY_DSN",
      "STRIPE_CHECKOUT_CANCEL_URL",
      "STRIPE_CHECKOUT_SUCCESS_URL",
      "STRIPE_PORTAL_RETURN_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      ...REQUIRED_STRIPE_PRICE_SECRET_NAMES,
    ];

    expect(() => assertRequiredApiSecrets(missingOperationalSecrets)).toThrow(
      "FEEDBACK_RECIPIENT_EMAIL, RESEND_API_KEY, TURNSTILE_SECRET_KEY",
    );
  });

  it("accepts the required production API secrets without Cloudflare Images secrets", () => {
    expect(() =>
      assertRequiredApiSecrets([
        "BETTER_AUTH_SECRET",
        "EMAIL_FROM_ADDRESS",
        "EMAIL_TOKEN_SECRET",
        "FEEDBACK_RECIPIENT_EMAIL",
        "RESEND_API_KEY",
        "SENTRY_DSN",
        "STRIPE_CHECKOUT_CANCEL_URL",
        "STRIPE_CHECKOUT_SUCCESS_URL",
        "STRIPE_PORTAL_RETURN_URL",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        ...REQUIRED_STRIPE_PRICE_SECRET_NAMES,
        "TURNSTILE_SECRET_KEY",
      ]),
    ).not.toThrow();
  });

  it("bounds Wrangler secret listing before API deploys", () => {
    const script = readFileSync("scripts/validate-cloudflare-api-config.ts", {
      encoding: "utf8",
    });

    expect(WRANGLER_SECRET_LIST_TIMEOUT_MS).toBe(120_000);
    expect(script).toContain("timeout: WRANGLER_SECRET_LIST_TIMEOUT_MS");
  });

  it("runs Postgres and marketing D1 migrations before deploying the API worker", () => {
    const pkg = JSON.parse(
      readFileSync("apps/api/package.json", { encoding: "utf8" }),
    ) as { scripts?: Record<string, string> };
    const deployScript = pkg.scripts?.deploy ?? "";

    expect(deployScript).toContain("pnpm run db:migrate:prod");
    expect(deployScript).toContain("pnpm run marketing-d1:migrate:prod");
    expect(pkg.scripts?.["marketing-d1:migrate:prod"]).toBe(
      "pnpm --dir ../web run d1:migrate:prod",
    );
    expect(deployScript.indexOf("pnpm run db:migrate:prod")).toBeLessThan(
      deployScript.indexOf("pnpm run marketing-d1:migrate:prod"),
    );
    expect(
      deployScript.indexOf("pnpm run marketing-d1:migrate:prod"),
    ).toBeLessThan(deployScript.indexOf("wrangler deploy"));
  });

  it("runs the Stripe customer duplicate preflight inside production Postgres migration", () => {
    const pkg = JSON.parse(
      readFileSync("apps/api/package.json", { encoding: "utf8" }),
    ) as { scripts?: Record<string, string> };
    const migrateScript = pkg.scripts?.["db:migrate:prod"] ?? "";

    expect(migrateScript).toContain("pnpm run db:preflight:prod");
    expect(migrateScript).toContain("pnpm run db:migrate");
    expect(migrateScript.indexOf("pnpm run db:preflight:prod")).toBeLessThan(
      migrateScript.indexOf("pnpm run db:migrate"),
    );
  });

  it("preflights duplicate Stripe customers before the unique index migration", () => {
    const pkg = JSON.parse(
      readFileSync("apps/api/package.json", { encoding: "utf8" }),
    ) as { scripts?: Record<string, string> };
    const script = readFileSync(
      "apps/api/scripts/check-stripe-customer-duplicates.ts",
      { encoding: "utf8" },
    );

    expect(pkg.scripts?.["db:preflight"]).toBe(
      "tsx scripts/check-stripe-customer-duplicates.ts",
    );
    expect(pkg.scripts?.["db:preflight:prod"]).toContain(
      "require-production-database-url.ts",
    );
    expect(script).toContain("FROM subscription");
    expect(script).toContain("to_regclass('public.subscription')");
    expect(script).toContain("information_schema.columns");
    expect(script).toContain("stripe_customer_id IS NOT NULL");
    expect(script).toContain("HAVING count(*) > 1");
    expect(script).toContain("pg_index.indisvalid");
    expect(script).toContain("DROP INDEX CONCURRENTLY IF EXISTS");
    expect(script).toContain("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS");
    expect(script).toContain("process.exitCode = 1");
  });

  it("loads API migration env through the shared precedence helper", () => {
    const config = readFileSync("apps/api/drizzle.config.ts", {
      encoding: "utf8",
    });
    const preflight = readFileSync(
      "apps/api/scripts/check-stripe-customer-duplicates.ts",
      { encoding: "utf8" },
    );
    const loader = readFileSync("apps/api/scripts/database-env.ts", {
      encoding: "utf8",
    });

    expect(config).toContain("loadApiDatabaseEnv({");
    expect(preflight).toContain("loadApiDatabaseEnv({");
    expect(loader).toContain('path.resolve(cwd, "../../.env.local")');
    expect(loader).toContain('path.resolve(cwd, ".env.local")');
    expect(loader).toContain("override: true");
    expect(loader.indexOf("shellDatabaseUrl")).toBeLessThan(
      loader.indexOf('path.resolve(cwd, ".env.local")'),
    );
  });

  it("keeps API Drizzle SQL migrations represented in the journal", () => {
    const migrationDir = "apps/api/drizzle";
    const sqlMigrations = readdirSync(migrationDir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.replace(/\.sql$/, ""))
      .sort();
    const journal = JSON.parse(
      readFileSync("apps/api/drizzle/meta/_journal.json", {
        encoding: "utf8",
      }),
    ) as { entries?: Array<{ tag?: string }> };
    const journalEntries = (journal.entries ?? [])
      .map((entry) => entry.tag)
      .filter((tag): tag is string => typeof tag === "string")
      .sort();

    expect(journalEntries).toEqual(sqlMigrations);
  });

  it("keeps every API Drizzle journal entry backed by a parseable snapshot", () => {
    const journal = JSON.parse(
      readFileSync("apps/api/drizzle/meta/_journal.json", {
        encoding: "utf8",
      }),
    ) as { entries?: Array<{ tag?: string }> };
    const entries = journal.entries ?? [];

    expect(entries.at(-1)?.tag).toBe("0024_stripe_subscription_id");
    let previousSnapshotId: string | null = null;
    for (const entry of entries) {
      const migrationNumber = entry.tag?.split("_").at(0);
      expect(migrationNumber).toMatch(/^\d{4}$/);
      if (!migrationNumber) {
        throw new Error("Journal entry missing migration number.");
      }
      const snapshotText = readFileSync(
        `apps/api/drizzle/meta/${migrationNumber}_snapshot.json`,
        {
          encoding: "utf8",
        },
      ).replace(/^\uFEFF/, "");
      const snapshot = JSON.parse(snapshotText) as {
        id?: string;
        prevId?: string;
      };

      expect(snapshot.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(snapshot.prevId).toMatch(/^[0-9a-f-]{36}$/);

      // Each snapshot must link to the previous one's id so that
      // drizzle-kit generate/check walks an unbroken prevId chain.
      // A cherry-pick seam previously left 0010 pointing past 0009.
      if (previousSnapshotId === null) {
        expect(snapshot.prevId).toBe("00000000-0000-0000-0000-000000000000");
      } else {
        expect(snapshot.prevId).toBe(previousSnapshotId);
      }
      previousSnapshotId = snapshot.id ?? null;
    }
    expect(
      readFileSync("apps/api/drizzle/meta/0023_snapshot.json", {
        encoding: "utf8",
      }),
    ).toContain("subscription_stripe_customer_id_unique");
    expect(
      readFileSync("apps/api/drizzle/meta/0023_snapshot.json", {
        encoding: "utf8",
      }),
    ).toContain("trial_ending_reminder_claimed_at");
  });
});
