import { describe, expect, it, vi } from "vitest";
import {
  recordWeddingFeatureUse,
  requireWeddingFeature,
  weddingFeatureMiddleware,
} from "../../src/middleware/feature-gate";

function makeSelectBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue({
    then: (fn: (rows: unknown) => unknown) => Promise.resolve(fn(resolveWith)),
  });
  return builder;
}

function makeContext({
  weddingId,
  userId = "user-1",
  role = "owner",
  method = "POST",
  status = "active",
  waitUntil,
}: {
  weddingId?: string | undefined;
  method?: string;
  userId?: string;
  role?: "owner" | "editor" | "viewer";
  status?: "active" | "archived";
  waitUntil?: (promise: Promise<unknown>) => void;
}) {
  return {
    req: {
      method,
      param: vi
        .fn()
        .mockImplementation((name: string) =>
          name === "weddingId" ? weddingId : undefined,
        ),
    },
    get: vi.fn().mockImplementation((key: string) => {
      if (key === "user") {
        return { id: userId, email: "user@example.com", name: "Test User" };
      }
      if (key === "weddingStatus") {
        return status;
      }
      return role;
    }),
    json: vi.fn().mockImplementation((body: unknown, status = 200) => ({
      body,
      status,
    })),
    ...(waitUntil ? { executionCtx: { waitUntil } } : {}),
  };
}

describe("feature gate", () => {
  it("returns 400 when wedding id is missing", async () => {
    const db = { select: vi.fn() };
    const c = makeContext({});

    await expect(
      requireWeddingFeature(db as never, c as never, "vendors"),
    ).resolves.toMatchObject({
      status: 400,
    });
  });

  it("blocks inactive owner subscriptions", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValue(
          makeSelectBuilder([
            { userId: "user-1", plan: "pro", status: "past_due" },
          ]),
        ),
    };
    const c = makeContext({ weddingId: "wed-1" });

    await expect(
      requireWeddingFeature(db as never, c as never, "vendors"),
    ).resolves.toMatchObject({
      status: 402,
      body: expect.objectContaining({
        feature: "vendors",
        status: "past_due",
      }),
    });
  });

  it("blocks access when no subscription exists", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectBuilder([])),
    };
    const c = makeContext({ weddingId: "wed-1" });

    await expect(
      requireWeddingFeature(db as never, c as never, "vendors"),
    ).resolves.toMatchObject({
      status: 402,
      body: expect.objectContaining({
        plan: "free",
        status: "inactive",
      }),
    });
  });

  it("allows pro-only features during a free full-app trial", async () => {
    const db = {
      select: vi.fn().mockReturnValue(
        makeSelectBuilder([
          {
            userId: "user-1",
            plan: "free",
            status: "trialing",
            trialStartedAt: new Date(Date.now() - 5 * 86_400_000),
          },
        ]),
      ),
      update: vi.fn().mockReturnValue({
        set: vi
          .fn()
          .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    const c = makeContext({ weddingId: "wed-1" });

    await expect(
      requireWeddingFeature(db as never, c as never, "weddingWebsite"),
    ).resolves.toBeNull();
  });

  it("blocks starter subscriptions from pro-only features", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValue(
          makeSelectBuilder([
            { userId: "user-1", plan: "starter", status: "active" },
          ]),
        ),
    };
    const c = makeContext({ weddingId: "wed-1" });

    await expect(
      requireWeddingFeature(db as never, c as never, "vendors"),
    ).resolves.toMatchObject({
      status: 402,
      body: expect.objectContaining({
        feature: "vendors",
        plan: "starter",
        status: "active",
      }),
    });
  });

  it("allows members when the owner has active access", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectBuilder([{ createdBy: "owner-1" }]))
        .mockReturnValueOnce(
          makeSelectBuilder([
            { userId: "owner-1", plan: "pro", status: "active" },
          ]),
        ),
      update: vi.fn().mockReturnValue({
        set: vi
          .fn()
          .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    const c = makeContext({ weddingId: "wed-1", role: "editor" });

    await expect(
      requireWeddingFeature(db as never, c as never, "vendors"),
    ).resolves.toBeNull();
  });

  it("passes through the middleware when access is allowed", async () => {
    const db = {
      select: vi
        .mocked(vi.fn())
        .mockReturnValue(
          makeSelectBuilder([
            { userId: "user-1", plan: "pro", status: "active" },
          ]),
        ),
      update: vi.fn().mockReturnValue({
        set: vi
          .fn()
          .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    const middleware = weddingFeatureMiddleware(db as never, "vendors");
    const next = vi.fn();

    const result = await middleware(
      makeContext({ weddingId: "wed-1" }) as never,
      next,
    );

    expect(result).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns the gate response from middleware when access is denied", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValue(
          makeSelectBuilder([
            { userId: "user-1", plan: "pro", status: "past_due" },
          ]),
        ),
    };
    const middleware = weddingFeatureMiddleware(db as never, "vendors");
    const next = vi.fn();

    const result = await middleware(
      makeContext({ weddingId: "wed-1" }) as never,
      next,
    );

    expect(result).toMatchObject({ status: 402 });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("recordFeatureFirstUse via requireWeddingFeature", () => {
  function makeUpdateChain() {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    return { update, set, where };
  }

  it("does not record feature use for archived read requests", async () => {
    const { update } = makeUpdateChain();
    const db = { update };
    const c = makeContext({
      method: "GET",
      status: "archived",
      weddingId: "wed-1",
    });

    await recordWeddingFeatureUse(db as never, c as never, "vendors");

    expect(update).not.toHaveBeenCalled();
  });

  it("does not record feature use when the route has no wedding id", async () => {
    const { update } = makeUpdateChain();
    const db = { update };
    const c = makeContext({ weddingId: undefined });

    await recordWeddingFeatureUse(db as never, c as never, "vendors");

    expect(update).not.toHaveBeenCalled();
  });

  it("calls db.update with vendorsFirstUsedAt when vendors access is granted", async () => {
    const { update, set, where } = makeUpdateChain();
    const db = {
      select: vi.fn().mockReturnValue(
        makeSelectBuilder([
          {
            userId: "user-1",
            plan: "pro",
            status: "active",
            trialStartedAt: null,
          },
        ]),
      ),
      update,
    };
    const c = makeContext({ weddingId: "wed-1" });

    const result = await requireWeddingFeature(
      db as never,
      c as never,
      "vendors",
    );

    expect(result).toBeNull();
    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ vendorsFirstUsedAt: expect.any(Date) }),
    );
    expect(where).toHaveBeenCalled();
  });

  it("registers first-use tracking with waitUntil when execution context exists", async () => {
    const { update } = makeUpdateChain();
    const db = {
      select: vi.fn().mockReturnValue(
        makeSelectBuilder([
          {
            userId: "user-1",
            plan: "pro",
            status: "active",
            trialStartedAt: null,
          },
        ]),
      ),
      update,
    };
    const promises: Promise<unknown>[] = [];
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      promises.push(promise);
    });
    const c = makeContext({ weddingId: "wed-1", waitUntil });

    const result = await requireWeddingFeature(
      db as never,
      c as never,
      "vendors",
    );

    expect(result).toBeNull();
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(promises[0]).resolves.toBeUndefined();
    expect(update).toHaveBeenCalled();
  });

  it("allows access and logs when first-use tracking fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { update, where } = makeUpdateChain();
    where.mockRejectedValueOnce(new Error("first-use write failed"));
    const db = {
      select: vi.fn().mockReturnValue(
        makeSelectBuilder([
          {
            userId: "user-1",
            plan: "pro",
            status: "active",
            trialStartedAt: null,
          },
        ]),
      ),
      update,
    };
    const c = makeContext({ weddingId: "wed-1" });

    const result = await requireWeddingFeature(
      db as never,
      c as never,
      "vendors",
    );
    await Promise.resolve();

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[feature-gate] failed to record first use",
      expect.objectContaining({
        feature: "vendors",
        userId: "user-1",
        error: expect.any(Error),
      }),
    );
    warn.mockRestore();
  });

  it("does not call db.update when access is denied", async () => {
    const { update } = makeUpdateChain();
    const db = {
      select: vi.fn().mockReturnValue(
        makeSelectBuilder([
          {
            userId: "user-1",
            plan: "pro",
            status: "past_due",
            trialStartedAt: null,
          },
        ]),
      ),
      update,
    };
    const c = makeContext({ weddingId: "wed-1" });

    const result = await requireWeddingFeature(
      db as never,
      c as never,
      "vendors",
    );

    expect(result).toMatchObject({ status: 402 });
    expect(update).not.toHaveBeenCalled();
  });

  it("calls db.update with extraPlannerFirstUsedAt when extraPlanner access is granted", async () => {
    const { update, set } = makeUpdateChain();
    const db = {
      select: vi.fn().mockReturnValue(
        makeSelectBuilder([
          {
            userId: "user-1",
            plan: "pro",
            status: "active",
            trialStartedAt: null,
          },
        ]),
      ),
      update,
    };
    const c = makeContext({ weddingId: "wed-1" });

    const result = await requireWeddingFeature(
      db as never,
      c as never,
      "extraPlanner",
    );

    expect(result).toBeNull();
    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ extraPlannerFirstUsedAt: expect.any(Date) }),
    );
  });

  it("calls db.update with weddingWebsiteFirstUsedAt when weddingWebsite access is granted", async () => {
    const { update, set } = makeUpdateChain();
    const db = {
      select: vi.fn().mockReturnValue(
        makeSelectBuilder([
          {
            userId: "user-1",
            plan: "pro",
            status: "active",
            trialStartedAt: null,
          },
        ]),
      ),
      update,
    };
    const c = makeContext({ weddingId: "wed-1" });

    const result = await requireWeddingFeature(
      db as never,
      c as never,
      "weddingWebsite",
    );

    expect(result).toBeNull();
    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ weddingWebsiteFirstUsedAt: expect.any(Date) }),
    );
  });

  it("does not call db.update and returns 402 when subscription is null", async () => {
    const { update } = makeUpdateChain();
    const db = {
      select: vi.fn().mockReturnValue(makeSelectBuilder([])),
      update,
    };
    const c = makeContext({ weddingId: "wed-1" });

    const result = await requireWeddingFeature(
      db as never,
      c as never,
      "vendors",
    );

    expect(result).toMatchObject({ status: 402 });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not call db.update when subscription row has no userId even if access is granted", async () => {
    const { update } = makeUpdateChain();
    const db = {
      select: vi
        .fn()
        .mockReturnValue(
          makeSelectBuilder([
            { plan: "pro", status: "active", trialStartedAt: null },
          ]),
        ),
      update,
    };
    const c = makeContext({ weddingId: "wed-1" });

    const result = await requireWeddingFeature(
      db as never,
      c as never,
      "vendors",
    );

    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
