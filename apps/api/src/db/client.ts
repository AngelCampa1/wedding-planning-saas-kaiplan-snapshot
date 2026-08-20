import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const localPoolCache = new Map<string, Pool>();

function isLocalPostgres(connectionString: string) {
  try {
    const url = new URL(connectionString);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function createDb(connectionString: string) {
  // Use `pg` for both local Postgres and production. In production the
  // connection string is Hyperdrive's internal URL (standard Postgres wire
  // protocol, which `pg` speaks). `pg` on Cloudflare Workers works via the
  // `nodejs_compat` flag which polyfills `net`/`tls` to cloudflare:sockets.
  // Transactions are supported by drizzle-orm/node-postgres.
  if (isLocalPostgres(connectionString)) {
    let pool = localPoolCache.get(connectionString);
    if (!pool) {
      pool = new Pool({ connectionString });
      localPoolCache.set(connectionString, pool);
    }

    return drizzleNodePg({ client: pool, schema });
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  return drizzleNodePg({ client: pool, schema });
}

export type Database = ReturnType<typeof createDb>;
