import { describe, it, expect } from "vitest";
import { createApi } from "../app";
import type { ApiEnv } from "../app";

function collectNames(value: unknown): string[] {
  const seen = new Set<object>();
  const names = new Set<string>();

  function walk(node: unknown) {
    if (!node || typeof node !== "object" || seen.has(node)) {
      return;
    }
    seen.add(node);

    const record = node as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(record, "name");
    if (descriptor?.value && typeof descriptor.value === "string") {
      names.add(descriptor.value);
    }

    for (const key of Reflect.ownKeys(record)) {
      const child = record[key as keyof typeof record];
      if (Array.isArray(child)) {
        for (const item of child) {
          walk(item);
        }
      } else {
        walk(child);
      }
    }
  }

  walk(value);
  return [...names];
}

// ---------------------------------------------------------------------------
// IP helpers — each test gets a unique IP to avoid the shared rate-limit Map
// ---------------------------------------------------------------------------

let ipCounter = 400;
function nextIp(): string {
  ipCounter += 1;
  return `10.40.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
}

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal DB mock for the referral route.
 *
 * The route issues sequential select() calls:
 *   1. .where(eq(signups.referralCode, code))   → referrer lookup (returns [] for 404)
 *   2. for legacy zero-position rows only, repair queue_position
 *   3. .where(eq(referrals.referralCode, code)) → referral count
 *
 * Pass `null` for referrerRow to simulate the 404 path (unknown code).
 */
function makeDb(
  referrerRow: {
    id: number;
    createdAt?: string;
    queuePosition?: number;
  } | null,
  positionCount: number = 1,
  referralCount: number = 0,
) {
  let selectCallCount = 0;
  let repairWhereArg: unknown = undefined;
  const updateCalls: Record<string, unknown>[] = [];
  const repairedPosition = positionCount;

  return {
    select: () => ({
      from: () => ({
        where: async (_arg?: unknown) => {
          selectCallCount += 1;
          if (selectCallCount === 1) {
            // First call: lookup signup by referralCode
            return referrerRow
              ? [
                  {
                    ...referrerRow,
                    createdAt:
                      referrerRow.createdAt ?? "2026-01-01T00:00:00.000Z",
                    queuePosition: referrerRow.queuePosition ?? positionCount,
                  },
                ]
              : [];
          }
          // Next call: COUNT from referrals WHERE referralCode = code
          return [{ count: referralCount }];
        },
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => {
        updateCalls.push(data);
        return {
          where: (arg?: unknown) => {
            repairWhereArg = arg;
            return {
              returning: async () => [
                { id: referrerRow?.id ?? 0, queuePosition: repairedPosition },
              ],
            };
          },
        };
      },
    }),
    getRepairWhereArg: () => repairWhereArg,
    getUpdateCalls: () => updateCalls,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("referral route — GET /api/referral/:code", () => {
  it("returns 404 for an unknown referral code", async () => {
    const app = createApi(makeEnv(makeDb(null)));
    const res = await app.request("/api/referral/UNKNOWN1", {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid referral code");
  });

  it("returns { referralCount: 0, position: 1 } for a valid code with no referrals yet", async () => {
    const app = createApi(makeEnv(makeDb({ id: 1 }, 1, 0)));
    const res = await app.request("/api/referral/FIRST001", {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    expect(data.referralCount).toBe(0);
    expect(data.position).toBe(1);
  });

  it("returns the correct position when COUNT returns 5", async () => {
    const app = createApi(makeEnv(makeDb({ id: 5 }, 5, 0)));
    const res = await app.request("/api/referral/FIFTH001", {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    expect(data.position).toBe(5);
  });

  it("returns the correct referralCount when COUNT returns 3", async () => {
    const app = createApi(makeEnv(makeDb({ id: 2 }, 2, 3)));
    const res = await app.request("/api/referral/REF3CODE", {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    expect(data.referralCount).toBe(3);
  });

  it("returns both referralCount and position together correctly", async () => {
    const app = createApi(makeEnv(makeDb({ id: 10 }, 10, 7)));
    const res = await app.request("/api/referral/BOTH1234", {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    expect(data.position).toBe(10);
    expect(data.referralCount).toBe(7);
  });

  it("repairs a legacy zero queuePosition instead of using createdAt/id ordering", async () => {
    const db = makeDb(
      { id: 12, createdAt: "2026-04-01T00:00:00.000Z", queuePosition: 0 },
      12,
      0,
    ) as ReturnType<typeof makeDb> & {
      getRepairWhereArg: () => unknown;
      getUpdateCalls: () => Record<string, unknown>[];
    };
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/referral/TIEBREAK", {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(res.status).toBe(200);
    const names = collectNames(db.getRepairWhereArg());
    expect(db.getRepairWhereArg()).toBeTruthy();
    expect(names).toContain("queue_position");
    expect(db.getUpdateCalls()).toHaveLength(1);
    expect(db.getUpdateCalls()[0]?.queuePosition).toBeTruthy();
  });
});

describe("referral route DB failure handling", () => {
  it("returns a generic 500 when referrer lookup fails", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => {
            throw new Error("D1_ERROR: referral lookup failed");
          },
        }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/referral/BROKEN01", {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("returns a generic 500 when referral count lookup fails", async () => {
    let selectCallCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: async () => {
            selectCallCount += 1;
            if (selectCallCount === 1) {
              return [{ id: 42, queuePosition: 9 }];
            }
            throw new Error("D1_ERROR: referral count failed");
          },
        }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/referral/BROKEN02", {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});

// ---------------------------------------------------------------------------
// BUG-D — Referral code path param length validation
// ---------------------------------------------------------------------------

describe("BUG-D — referral code path param length", () => {
  it("returns 404 when code exceeds 100 characters", async () => {
    const app = createApi(makeEnv(makeDb(null)));
    const longCode = "a".repeat(101);
    const res = await app.request(`/api/referral/${longCode}`, {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid referral code");
  });

  it("does not hit DB when code exceeds 100 characters", async () => {
    let dbHit = false;
    const db = {
      select: () => {
        dbHit = true;
        return {
          from: () => ({
            where: async () => [],
          }),
        };
      },
    };

    const app = createApi(makeEnv(db));
    const longCode = "x".repeat(150);
    await app.request(`/api/referral/${longCode}`, {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    expect(dbHit).toBe(false);
  });

  it("accepts code at exactly 100 characters", async () => {
    const app = createApi(makeEnv(makeDb({ id: 1 }, 1, 0)));
    const maxCode = "a".repeat(100);
    const res = await app.request(`/api/referral/${maxCode}`, {
      method: "GET",
      headers: { "CF-Connecting-IP": nextIp() },
    });

    // Should reach the DB — returns 200 since our mock has a referrer
    expect(res.status).toBe(200);
  });
});
