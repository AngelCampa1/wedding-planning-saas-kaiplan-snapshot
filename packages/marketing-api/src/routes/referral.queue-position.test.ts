import { describe, expect, it } from "vitest";
import { createApi } from "../app";
import type { ApiEnv } from "../app";

type TransactionalDb = {
  transaction: <T>(cb: (tx: TransactionalDb) => Promise<T>) => Promise<T>;
};

function withTransaction<T extends Record<string, unknown>>(
  db: T,
): T & TransactionalDb {
  return {
    ...db,
    transaction: async <R>(cb: (tx: TransactionalDb & T) => Promise<R>) =>
      cb(db as TransactionalDb & T),
  };
}

function makeEnv(dbOverride: unknown): ApiEnv {
  const transactionalDb =
    dbOverride &&
    typeof (dbOverride as { transaction?: unknown }).transaction === "function"
      ? dbOverride
      : {
          ...(dbOverride as Record<string, unknown>),
          transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
            cb(dbOverride),
        };

  return {
    DB: {} as D1Database,
    RESEND_API_KEY: "re_test",
    APOLLO_API_KEY: "apollo_test",
    PRODUCT_NAME: "TestProduct",
    PRODUCT_DOMAIN: "test.app",
    PRODUCT_LOGO_URL: "https://test.app/logo.png",
    PRODUCT_BRAND_COLOR: "#0066FF",
    PRODUCT_ACCENT_COLOR: "#f59e0b",
    CALENDAR_URL: "https://cal.com/test",
    EMAIL_FROM: "hello@test.app",
    STATS_SECRET: "test-secret",
    ALLOWED_ORIGIN: "https://test.app",
    _db: transactionalDb as ApiEnv["_db"],
  };
}

function makeDb(row: {
  id: number;
  createdAt: string;
  referralCode: string;
  queuePosition: number;
  referralCount: number;
  repairedQueuePosition?: number;
}) {
  let selectCallCount = 0;
  const updateCalls: Record<string, unknown>[] = [];
  const repairedPosition = row.repairedQueuePosition ?? 1;

  return withTransaction({
    select: () => ({
      from: () => ({
        where: async () => {
          selectCallCount += 1;
          if (selectCallCount === 1) {
            return [
              {
                id: row.id,
                createdAt: row.createdAt,
                queuePosition: row.queuePosition,
              },
            ];
          }
          return [{ count: row.referralCount }];
        },
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => {
        updateCalls.push(data);
        return {
          where: () => ({
            returning: async () => [
              { id: row.id, queuePosition: repairedPosition },
            ],
          }),
        };
      },
    }),
    getUpdateCalls: () => updateCalls,
  });
}

function makeDbWithConcurrentRepair(row: {
  id: number;
  createdAt: string;
  referralCode: string;
  referralCount: number;
  repairedQueuePosition: number;
}) {
  let selectCallCount = 0;
  const updateCalls: Record<string, unknown>[] = [];

  return withTransaction({
    select: () => ({
      from: () => ({
        where: async () => {
          selectCallCount += 1;
          if (selectCallCount === 1) {
            return [
              {
                id: row.id,
                createdAt: row.createdAt,
                queuePosition: 0,
              },
            ];
          }
          if (selectCallCount === 2) {
            return [{ queuePosition: row.repairedQueuePosition }];
          }
          return [{ count: row.referralCount }];
        },
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => {
        updateCalls.push(data);
        return {
          where: () => ({
            returning: async () => [],
          }),
        };
      },
    }),
    getUpdateCalls: () => updateCalls,
  });
}

describe("referral route queue position", () => {
  it("returns the stored queuePosition instead of recomputing from createdAt/id", async () => {
    const app = createApi(
      makeEnv(
        makeDb({
          id: 5,
          createdAt: "2026-04-01T00:00:00.000Z",
          referralCode: "STORED01",
          queuePosition: 41,
          referralCount: 7,
        }),
      ),
    );

    const res = await app.request("/api/referral/STORED01", {
      headers: { "CF-Connecting-IP": "10.0.1.1" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    expect(body.referralCount).toBe(7);
    expect(body.position).toBe(41);
  });

  it("repairs legacy rows with a missing queuePosition", async () => {
    const db = makeDb({
      id: 6,
      createdAt: "2026-04-01T00:00:00.000Z",
      referralCode: "REPAIR01",
      queuePosition: 0,
      referralCount: 3,
      repairedQueuePosition: 12,
    });
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/referral/REPAIR01", {
      headers: { "CF-Connecting-IP": "10.0.1.2" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    expect(body.referralCount).toBe(3);
    expect(body.position).toBe(12);
    expect(db.getUpdateCalls()).toHaveLength(1);
    expect(db.getUpdateCalls()[0]?.queuePosition).toBeTruthy();
  });

  it("uses the current row returned by the repair update", async () => {
    let selectCallCount = 0;
    const updateCalls: Record<string, unknown>[] = [];
    const db = withTransaction({
      select: () => ({
        from: () => ({
          where: async () => {
            selectCallCount += 1;
            if (selectCallCount === 1) {
              return [
                {
                  id: 8,
                  createdAt: "2026-04-01T00:00:00.000Z",
                  queuePosition: 0,
                },
              ];
            }
            return [{ count: 2 }];
          },
        }),
      }),
      update: () => ({
        set: (data: Record<string, unknown>) => {
          updateCalls.push(data);
          return {
            where: () => ({
              returning: async () => [{ id: 8, queuePosition: 13 }],
            }),
          };
        },
      }),
      getUpdateCalls: () => updateCalls,
    });
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/referral/REPAIR03", {
      headers: { "CF-Connecting-IP": "10.0.1.4" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    expect(body.referralCount).toBe(2);
    expect(body.position).toBe(13);
    expect(db.getUpdateCalls()).toHaveLength(1);
  });

  it("re-reads the queuePosition when another request repairs first", async () => {
    const db = makeDbWithConcurrentRepair({
      id: 7,
      createdAt: "2026-04-01T00:00:00.000Z",
      referralCode: "REPAIR02",
      referralCount: 5,
      repairedQueuePosition: 9,
    });
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/referral/REPAIR02", {
      headers: { "CF-Connecting-IP": "10.0.1.3" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    expect(body.referralCount).toBe(5);
    expect(body.position).toBe(9);
    expect(db.getUpdateCalls()).toHaveLength(1);
  });
});
