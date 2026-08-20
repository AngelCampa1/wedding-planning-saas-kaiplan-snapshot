/**
 * Unit tests for pricing-click route — covers BUG 5:
 *
 *   B5  sourcePage and sessionId lack typeof string checks and length limits;
 *       non-string values pass validation and reach the DB insert.
 */

import { describe, it, expect } from "vitest";
import { createApi } from "../app";
import type { ApiEnv } from "../app";
import type { DrizzleD1Database } from "../app";

// ---------------------------------------------------------------------------
// IP helpers — each test gets a unique IP to avoid the shared rate-limit Map
// ---------------------------------------------------------------------------

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `192.168.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
}

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

function makeDb(onInsert?: () => void): Partial<DrizzleD1Database> {
  return {
    insert: () => ({
      values: () => {
        if (onInsert) onInsert();
        return Promise.resolve();
      },
    }),
  } as unknown as Partial<DrizzleD1Database>;
}

function makeEnv(dbOverride: unknown): ApiEnv {
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
    _db: dbOverride as ApiEnv["_db"],
  };
}

function post(app: ReturnType<typeof createApi>, body: unknown, ip?: string) {
  return app.request("/api/pricing-click", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip ?? nextIp(),
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("pricing-click route — happy path", () => {
  it("returns 200 when all fields are valid strings", async () => {
    let inserted = false;
    const app = createApi(
      makeEnv(
        makeDb(() => {
          inserted = true;
        }),
      ),
    );
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc123",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(inserted).toBe(true);
  });

  it("accepts tier with hyphens (valid characters)", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro-plan",
      sourcePage: "/pricing",
      sessionId: "sess_xyz",
    });
    expect(res.status).toBe(200);
  });

  it("preserves underscores in tier (BUG-3)", async () => {
    let capturedValues: Record<string, unknown> = {};
    const db = {
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          capturedValues = vals;
          return Promise.resolve();
        },
      }),
    } as unknown as Partial<DrizzleD1Database>;

    const app = createApi(makeEnv(db));
    const res = await post(app, {
      tier: "pro_plan",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(200);
    expect(capturedValues.tier).toBe("pro_plan");
  });
});

// ---------------------------------------------------------------------------
// Existing validation (truthiness checks — no regression)
// ---------------------------------------------------------------------------

describe("pricing-click route — missing field validation", () => {
  it("returns 400 when body is not JSON", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when tier is missing", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, { sourcePage: "/pricing", sessionId: "s1" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when sourcePage is missing", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, { tier: "pro", sessionId: "s1" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when sessionId is missing", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, { tier: "pro", sourcePage: "/pricing" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when tier sanitizes to empty string", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "!!!",
      sourcePage: "/pricing",
      sessionId: "s1",
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// B5 — typeof validation for sourcePage
// ---------------------------------------------------------------------------

describe("B5 — sourcePage typeof validation", () => {
  it("returns 400 with descriptive error when sourcePage is a number", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: 42,
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sourcePage must be a string");
  });

  it("returns 400 when sourcePage is a boolean", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: true,
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sourcePage must be a string");
  });

  it("returns 400 when sourcePage is an object", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: { path: "/pricing" },
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sourcePage must be a string");
  });

  it("returns 400 when sourcePage is an array", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: ["/pricing"],
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sourcePage must be a string");
  });
});

// ---------------------------------------------------------------------------
// B5 — typeof validation for sessionId
// ---------------------------------------------------------------------------

describe("B5 — sessionId typeof validation", () => {
  it("returns 400 with descriptive error when sessionId is a number", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: 99,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sessionId must be a string");
  });

  it("returns 400 when sessionId is a boolean (true — truthy, hits typeof check)", async () => {
    // true is truthy so it passes !body.sessionId and reaches the typeof check.
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: true,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sessionId must be a string");
  });

  it("returns 400 when sessionId is an object", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: { id: "abc" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sessionId must be a string");
  });

  it("returns 400 when sessionId is an empty array (truthy, hits typeof check)", async () => {
    // [] is truthy so it passes !body.sessionId and reaches the typeof check.
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: [],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sessionId must be a string");
  });
});

// ---------------------------------------------------------------------------
// B5 — length limit for sourcePage
// ---------------------------------------------------------------------------

describe("B5 — sourcePage length limit (500 chars)", () => {
  it("returns 400 when sourcePage exceeds 500 characters", async () => {
    const app = createApi(makeEnv(makeDb()));
    const longPath = "/" + "a".repeat(500); // 501 chars total
    const res = await post(app, {
      tier: "pro",
      sourcePage: longPath,
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sourcePage too long");
  });

  it("returns 200 when sourcePage is exactly 500 characters", async () => {
    const app = createApi(makeEnv(makeDb()));
    const maxPath = "a".repeat(500);
    const res = await post(app, {
      tier: "pro",
      sourcePage: maxPath,
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 when sourcePage is under the 500-char limit", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// BUG-3 — tier max length (100 chars)
// ---------------------------------------------------------------------------

describe("BUG-3 — tier max length (100 chars)", () => {
  it("returns 400 with 'tier too long' when tier is 101 characters", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "a".repeat(101),
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("tier too long");
  });

  it("returns 200 when tier is exactly 100 characters", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "a".repeat(100),
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 with 'tier too long' when tier is 1000 characters", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "a".repeat(1000),
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("tier too long");
  });
});

// ---------------------------------------------------------------------------
// B5 — length limit for sessionId
// ---------------------------------------------------------------------------

describe("B5 — sessionId length limit (200 chars)", () => {
  it("returns 400 when sessionId exceeds 200 characters", async () => {
    const app = createApi(makeEnv(makeDb()));
    const longId = "s".repeat(201);
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: longId,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sessionId too long");
  });

  it("returns 200 when sessionId is exactly 200 characters", async () => {
    const app = createApi(makeEnv(makeDb()));
    const maxId = "s".repeat(200);
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: maxId,
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 when sessionId is under the 200-char limit", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "short-id",
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// BUG-B — Whitespace-only sourcePage and sessionId bypass validation
// ---------------------------------------------------------------------------

describe("BUG-B — whitespace-only sourcePage and sessionId", () => {
  it("returns 400 when sourcePage is whitespace-only", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "   ",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sourcePage must not be blank");
  });

  it("returns 400 when sessionId is whitespace-only", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "   ",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sessionId must not be blank");
  });

  it("returns 400 when sourcePage is tabs and newlines", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "\t\n ",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
  });

  it("accepts sourcePage with leading/trailing spaces if non-blank content exists", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "  /pricing  ",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// BUG 4 — strict tier validation (reject invalid characters instead of sanitizing)
// ---------------------------------------------------------------------------

describe("BUG-4 — tier strict character validation", () => {
  it("returns 400 with 'tier contains invalid characters' when tier has spaces", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "Pro Plan",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("tier contains invalid characters");
  });

  it("returns 400 when tier contains special characters like @", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro@plan",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("tier contains invalid characters");
  });

  it("returns 400 when tier contains punctuation like !", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro!",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("tier contains invalid characters");
  });

  it("returns 200 and stores exact tier value when tier is valid alphanumeric with hyphens", async () => {
    let capturedValues: Record<string, unknown> = {};
    const db = {
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          capturedValues = vals;
          return Promise.resolve();
        },
      }),
    } as unknown as Partial<DrizzleD1Database>;

    const app = createApi(makeEnv(db));
    const res = await post(app, {
      tier: "Pro-Plan",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(200);
    expect(capturedValues.tier).toBe("Pro-Plan");
  });
});

// ---------------------------------------------------------------------------
// BUG 1 — typeof check on tier
// ---------------------------------------------------------------------------

describe("BUG-1 — tier typeof validation", () => {
  it("returns 400 when tier is a number", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: 123,
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("tier must be a string");
  });

  it("returns 400 when tier is a boolean", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: true,
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("tier must be a string");
  });

  it("returns 400 when tier is an object", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: {},
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("tier must be a string");
  });
});

// ---------------------------------------------------------------------------
// BUG 10 & 11 — sourcePage and sessionId trimmed before DB insert
// ---------------------------------------------------------------------------

describe("BUG-10/11 — sourcePage and sessionId trimmed before insert", () => {
  it("trims sourcePage before insert", async () => {
    let capturedValues: Record<string, unknown> = {};
    const db = {
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          capturedValues = vals;
          return Promise.resolve();
        },
      }),
    } as unknown as Partial<DrizzleD1Database>;

    const app = createApi(makeEnv(db));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "  /pricing  ",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(200);
    expect(capturedValues.sourcePage).toBe("/pricing");
  });

  it("trims sessionId before insert", async () => {
    let capturedValues: Record<string, unknown> = {};
    const db = {
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          capturedValues = vals;
          return Promise.resolve();
        },
      }),
    } as unknown as Partial<DrizzleD1Database>;

    const app = createApi(makeEnv(db));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "  sess_abc  ",
    });
    expect(res.status).toBe(200);
    expect(capturedValues.sessionId).toBe("sess_abc");
  });
});

// ---------------------------------------------------------------------------
// billingPeriod — optional field validation
// ---------------------------------------------------------------------------

describe("billingPeriod — optional field validation", () => {
  it('returns 200 when billingPeriod is "monthly"', async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
      billingPeriod: "monthly",
    });
    expect(res.status).toBe(200);
  });

  it('returns 200 when billingPeriod is "annual"', async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
      billingPeriod: "annual",
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 when billingPeriod is missing (backward compat)", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 with descriptive error when billingPeriod is "weekly"', async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
      billingPeriod: "weekly",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('billingPeriod must be "monthly" or "annual"');
  });

  it("returns 400 when billingPeriod is a number (non-string)", async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
      billingPeriod: 123,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when billingPeriod is "Monthly" (case-sensitive)', async () => {
    const app = createApi(makeEnv(makeDb()));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
      billingPeriod: "Monthly",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('billingPeriod must be "monthly" or "annual"');
  });

  it('stores billingPeriod in DB when "annual" is provided', async () => {
    let capturedValues: Record<string, unknown> = {};
    const db = {
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          capturedValues = vals;
          return Promise.resolve();
        },
      }),
    } as unknown as Partial<DrizzleD1Database>;

    const app = createApi(makeEnv(db));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
      billingPeriod: "annual",
    });
    expect(res.status).toBe(200);
    expect(capturedValues.billingPeriod).toBe("annual");
  });

  it("returns 500 when DB insert fails", async () => {
    const failDb = {
      insert: () => ({
        values: () => Promise.reject(new Error("D1 error")),
      }),
    } as unknown as Partial<DrizzleD1Database>;

    const app = createApi(makeEnv(failDb));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
      billingPeriod: "annual",
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal server error");
  });

  it("stores null in DB when billingPeriod is not provided", async () => {
    let capturedValues: Record<string, unknown> = {};
    const db = {
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          capturedValues = vals;
          return Promise.resolve();
        },
      }),
    } as unknown as Partial<DrizzleD1Database>;

    const app = createApi(makeEnv(db));
    const res = await post(app, {
      tier: "pro",
      sourcePage: "/pricing",
      sessionId: "sess_abc",
    });
    expect(res.status).toBe(200);
    expect(capturedValues.billingPeriod).toBeNull();
  });
});
