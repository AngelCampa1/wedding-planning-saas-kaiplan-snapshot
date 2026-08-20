import { beforeEach, describe, it, expect, vi } from "vitest";

// Production (neon.tech) path must use neon-serverless to support transactions.
// neon-http throws "No transactions support in neon-http driver" on db.transaction().
vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn().mockReturnValue({}),
  Pool: vi.fn(function MockNeonPool() {
    return { on: vi.fn() };
  }),
  neonConfig: {},
}));

vi.mock("pg", () => ({
  Pool: vi.fn(function MockPool() {
    return { on: vi.fn() };
  }),
}));

vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: vi.fn().mockReturnValue({
    query: vi.fn(),
    transaction: vi.fn(),
  }),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn().mockReturnValue({
    query: vi.fn(),
    transaction: vi.fn(),
  }),
}));

import { createDb } from "../../src/db/client";
import { Pool as NeonPool } from "@neondatabase/serverless";
import { Pool } from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";

describe("createDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a drizzle db instance", () => {
    const db = createDb("postgresql://fake-connection-string");
    expect(db).toBeDefined();
  });

  it("uses the pg Pool for remote connections so Hyperdrive's standard PG wire works", () => {
    const connectionString = "postgresql://user:pass@ep-foo.neon.tech/db";
    createDb(connectionString);

    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString,
        max: 1,
        connectionTimeoutMillis: 15000,
      }),
    );
    expect(drizzleNodePg).toHaveBeenCalledWith(
      expect.objectContaining({ client: expect.anything() }),
    );
    expect(NeonPool).not.toHaveBeenCalled();
  });

  it("does not set max or connectionTimeoutMillis on local postgres pools", () => {
    const connectionString =
      "postgres://postgres:postgres@127.0.0.1:55432/kaiplan_e2e_local_opts";
    createDb(connectionString);
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString }),
    );
    // Should not have production-specific pool tuning
    const callArg = (Pool as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).not.toHaveProperty("max");
    expect(callArg).not.toHaveProperty("connectionTimeoutMillis");
  });

  it("returned production db exposes a transaction function", () => {
    const db = createDb("postgresql://user:pass@ep-foo.neon.tech/db");
    expect(typeof db.transaction).toBe("function");
  });

  it("uses the node-postgres driver for local docker postgres", () => {
    const connectionString =
      "postgres://postgres:postgres@127.0.0.1:55432/kaiplan_e2e";

    createDb(connectionString);

    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString,
      }),
    );
    expect(drizzleNodePg).toHaveBeenCalled();
    expect(NeonPool).not.toHaveBeenCalledWith(
      expect.objectContaining({ connectionString }),
    );
  });

  it("reuses the local postgres pool for repeated calls", () => {
    const connectionString =
      "postgres://postgres:postgres@127.0.0.1:55432/kaiplan_e2e_cache";

    createDb(connectionString);
    createDb(connectionString);

    expect(Pool).toHaveBeenCalledTimes(1);
  });

  it("falls back to the pg Pool when the connection string is unparseable", () => {
    const connectionString = "not-a-valid-connection-string";

    createDb(connectionString);

    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString }),
    );
    expect(NeonPool).not.toHaveBeenCalled();
  });
});
