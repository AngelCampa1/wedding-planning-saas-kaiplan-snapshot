import pg from "pg";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadApiDatabaseEnv } from "./database-env";

const { Pool } = pg;

loadApiDatabaseEnv({
  requireExplicitDatabaseUrl:
    process.env.KAIPLAN_REQUIRE_EXPLICIT_DATABASE_URL === "true",
});

type DuplicateStripeCustomerRow = {
  stripe_customer_id: string;
  duplicate_count: string;
};

type SchemaProbeRow = {
  table_exists: boolean;
  column_exists: boolean;
};

type IndexProbeRow = {
  index_exists: boolean;
  index_is_valid: boolean | null;
};

type Queryable = {
  query<T extends object = Record<string, unknown>>(
    sql: string,
  ): Promise<{ rows: T[] }>;
};

function maskStripeCustomerId(customerId: string) {
  if (customerId.length <= 8) return customerId;
  return `${customerId.slice(0, 4)}...${customerId.slice(-4)}`;
}

export async function checkStripeCustomerDuplicates(pool: Queryable) {
  const schema = await pool.query<SchemaProbeRow>(`
    SELECT
      to_regclass('public.subscription') IS NOT NULL AS table_exists,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription'
          AND column_name = 'stripe_customer_id'
      ) AS column_exists
  `);

  const schemaProbe = schema.rows[0];
  if (!schemaProbe?.table_exists || !schemaProbe.column_exists) {
    console.warn(
      "Skipping Stripe customer duplicate preflight because subscription.stripe_customer_id does not exist yet.",
    );
    return false;
  }

  const result = await pool.query<DuplicateStripeCustomerRow>(`
    SELECT stripe_customer_id, count(*)::text AS duplicate_count
    FROM subscription
    WHERE stripe_customer_id IS NOT NULL
    GROUP BY stripe_customer_id
    HAVING count(*) > 1
    ORDER BY count(*) DESC, stripe_customer_id ASC
    LIMIT 10
  `);

  if (result.rows.length > 0) {
    console.error(
      "Duplicate subscription.stripe_customer_id values must be resolved before applying the unique index migration.",
    );
    for (const row of result.rows) {
      console.error(
        `- ${maskStripeCustomerId(row.stripe_customer_id)} appears ${row.duplicate_count} times`,
      );
    }
    process.exitCode = 1;
    return false;
  }

  return true;
}

export async function ensureStripeCustomerUniqueIndex(pool: Queryable) {
  const indexProbe = await pool.query<IndexProbeRow>(`
    SELECT
      to_regclass('public.subscription_stripe_customer_id_unique') IS NOT NULL
        AS index_exists,
      pg_index.indisvalid AS index_is_valid
    FROM (SELECT to_regclass('public.subscription_stripe_customer_id_unique') AS index_oid) probe
    LEFT JOIN pg_index ON pg_index.indexrelid = probe.index_oid
  `);
  const index = indexProbe.rows[0];
  if (index?.index_exists && index.index_is_valid === false) {
    console.warn(
      "Dropping invalid subscription_stripe_customer_id_unique index before recreating it concurrently.",
    );
    await pool.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "subscription_stripe_customer_id_unique"
    `);
  }

  await pool.query(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "subscription_stripe_customer_id_unique"
    ON "subscription" USING btree ("stripe_customer_id")
    WHERE "stripe_customer_id" IS NOT NULL
  `);
}

export async function runStripeCustomerDuplicatePreflight() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required before checking Stripe customer duplicates.",
    );
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  try {
    const canCreateIndex = await checkStripeCustomerDuplicates(pool);
    if (canCreateIndex && process.exitCode !== 1) {
      await ensureStripeCustomerUniqueIndex(pool);
    }
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await runStripeCustomerDuplicatePreflight();
}
