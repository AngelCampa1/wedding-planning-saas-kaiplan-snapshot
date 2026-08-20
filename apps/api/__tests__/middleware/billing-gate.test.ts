import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  billingGateMiddleware,
  requireBillingAccess,
} from "../../src/middleware/billing-gate";
import type { Database } from "../../src/db/client";

function makeDb(row: unknown): Database {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue({
    then: (fn: (rows: unknown[]) => unknown) =>
      Promise.resolve(fn(row ? [row] : [])),
  });

  return {
    select: vi.fn().mockReturnValue(builder),
  } as unknown as Database;
}

describe("requireBillingAccess", () => {
  it("returns null when the user's billing gate is not active", async () => {
    const response = await requireBillingAccess(makeDb(undefined), {
      get: () =>
        ({
          id: "user-1",
          email: "user@example.com",
          name: "Test User",
        }) as never,
      json: vi.fn(),
    });

    expect(response).toBeNull();
  });

  it("returns a 402 response when the billing gate is active", async () => {
    const json = vi.fn((body: unknown, status?: number) =>
      Response.json({ body, status }),
    );

    const response = await requireBillingAccess(
      makeDb({
        userId: "user-1",
        plan: "free",
        status: "inactive",
        billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
      }),
      {
        get: () =>
          ({
            id: "user-1",
            email: "user@example.com",
            name: "Test User",
          }) as never,
        json,
      },
    );

    expect(json).toHaveBeenCalledWith(
      {
        error: "Complete billing setup to continue.",
        plan: "free",
        status: "inactive",
        effectivePlan: "free",
        billingGateRequired: true,
      },
      402,
    );
    expect(response).toBeInstanceOf(Response);
  });

  it("falls back to free and inactive when a gated row has nullable billing fields", async () => {
    const json = vi.fn((body: unknown, status?: number) =>
      Response.json({ body, status }),
    );

    await requireBillingAccess(
      makeDb({
        userId: "user-1",
        plan: null,
        status: null,
        billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
      }),
      {
        get: () =>
          ({
            id: "user-1",
            email: "user@example.com",
            name: "Test User",
          }) as never,
        json,
      },
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "free",
        status: "inactive",
      }),
      402,
    );
  });
});

describe("billingGateMiddleware", () => {
  it("blocks gated users before the route handler runs", async () => {
    const app = new Hono();

    app.use("*", (c, next) => {
      c.set("user" as never, {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
      });
      return next();
    });
    app.get(
      "/guarded",
      billingGateMiddleware(
        makeDb({
          userId: "user-1",
          plan: "free",
          status: "inactive",
          billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
        }),
      ),
      () => Response.json({ ok: true }),
    );

    const res = await app.request("/guarded");

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      error: "Complete billing setup to continue.",
      billingGateRequired: true,
    });
  });

  it("lets ungated users continue to the route handler", async () => {
    const app = new Hono();

    app.use("*", (c, next) => {
      c.set("user" as never, {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
      });
      return next();
    });
    app.get(
      "/guarded",
      billingGateMiddleware(
        makeDb({
          userId: "user-1",
          plan: "pro",
          status: "trialing",
          billingGateRequiredAt: null,
        }),
      ),
      () => Response.json({ ok: true }),
    );

    const res = await app.request("/guarded");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
