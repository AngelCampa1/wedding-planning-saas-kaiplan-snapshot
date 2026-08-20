import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { weddingAccessMiddleware } from "../../src/middleware/wedding-access";
import type { Database } from "../../src/db/client";

type MockRow = {
  memberId: string;
  weddingId: string;
  userId: string | null;
  role: string;
  weddingStatus: string;
  billingGateRequiredAt?: Date | null;
  plan?: string | null;
  status?: string | null;
};

function makeDb(rowResult: MockRow | undefined): Database {
  const builder = {
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    then: vi.fn(),
  };

  // Chain: db.select().from().innerJoin().where().limit().then()
  builder.select.mockReturnValue(builder);
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  builder.leftJoin.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.limit.mockReturnValue({
    then: (fn: (rows: MockRow[]) => MockRow | undefined) =>
      Promise.resolve(fn(rowResult ? [rowResult] : [])),
  });

  return builder as unknown as Database;
}

function makeDynamicDb(getRowResult: () => MockRow | undefined): Database {
  const builder = {
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    then: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  builder.leftJoin.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.limit.mockImplementation(() => ({
    then: (fn: (rows: MockRow[]) => MockRow | undefined) => {
      const rowResult = getRowResult();
      return Promise.resolve(fn(rowResult ? [rowResult] : []));
    },
  }));

  return builder as unknown as Database;
}

function makeApp(db: Database) {
  const app = new Hono();

  // Pre-set the user on context (simulates session middleware running first)
  app.use("*", (c, next) => {
    c.set("user" as never, {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
    });
    return next();
  });

  const mw = weddingAccessMiddleware(db);

  app.get("/weddings/:weddingId", mw, (c) => {
    const role = c.get("weddingRole" as never);
    return c.json({ role });
  });

  app.post("/weddings/:weddingId", mw, (c) => {
    return c.json({ ok: true });
  });

  // Route without :weddingId param to exercise the !weddingId guard
  app.get("/no-param", mw, (c) => c.json({ ok: true }));

  return app;
}

function makePlanningRow(role = "owner"): MockRow {
  return {
    memberId: "member-1",
    weddingId: "00000000-0000-4000-8000-000000000101",
    userId: "user-1",
    role,
    weddingStatus: "planning",
  };
}

function makeArchivedRow(role = "owner"): MockRow {
  return {
    memberId: "member-1",
    weddingId: "00000000-0000-4000-8000-000000000101",
    userId: "user-1",
    role,
    weddingStatus: "archived",
  };
}

describe("weddingAccessMiddleware", () => {
  it("returns 400 when weddingId param is missing", async () => {
    const db = makeDb(undefined);
    const app = makeApp(db);

    const res = await app.request("/no-param");
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Wedding ID required");
  });

  it("returns 403 when user is not a member", async () => {
    const db = makeDb(undefined);
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000101");
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Not a member of this wedding");
  });

  it("returns 400 for malformed weddingId params before querying access", async () => {
    const db = makeDb(makePlanningRow("owner"));
    const app = makeApp(db);

    const res = await app.request("/weddings/not-a-uuid");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid wedding ID",
    });
    expect(
      (db as unknown as { select: ReturnType<typeof vi.fn> }).select,
    ).not.toHaveBeenCalled();
  });

  it("sets weddingRole and calls next when user is a member (planning)", async () => {
    const db = makeDb(makePlanningRow("owner"));
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000101");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("owner");
  });

  it("correctly passes editor role through", async () => {
    const db = makeDb(makePlanningRow("editor"));
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000102");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("editor");
  });

  it("correctly passes viewer role through", async () => {
    const db = makeDb(makePlanningRow("viewer"));
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000103");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("viewer");
  });

  it("re-reads membership role on each request so stale sessions cannot keep old privileges", async () => {
    let currentRole = "editor";
    const db = makeDynamicDb(() => makePlanningRow(currentRole));
    const app = makeApp(db);

    const beforeRoleChange = await app.request("/weddings/00000000-0000-4000-8000-000000000101");
    expect(beforeRoleChange.status).toBe(200);
    await expect(beforeRoleChange.json()).resolves.toEqual({
      role: "editor",
    });

    currentRole = "viewer";
    const afterRoleChange = await app.request("/weddings/00000000-0000-4000-8000-000000000101");
    expect(afterRoleChange.status).toBe(200);
    await expect(afterRoleChange.json()).resolves.toEqual({
      role: "viewer",
    });

    expect(
      (db as unknown as { select: ReturnType<typeof vi.fn> }).select,
    ).toHaveBeenCalledTimes(2);
  });

  // --- archived wedding guard ---

  it("returns 423 for POST requests on an archived wedding", async () => {
    const db = makeDb(makeArchivedRow("owner"));
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000101", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(423);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Wedding is archived and read-only");
  });

  it("allows GET requests on an archived wedding", async () => {
    const db = makeDb(makeArchivedRow("owner"));
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000101");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("owner");
  });

  it("returns 403 (not 423) when user is not a member of an archived wedding", async () => {
    const db = makeDb(undefined);
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000101", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Not a member of this wedding");
  });

  it("returns 402 when the member still has an active billing gate", async () => {
    const db = makeDb({
      ...makePlanningRow("owner"),
      plan: "free",
      status: "inactive",
      billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
    });
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000101");

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      error: "Complete billing setup to continue.",
      plan: "free",
      status: "inactive",
      effectivePlan: "free",
      billingGateRequired: true,
    });
  });

  it("allows GET requests on archived weddings even when the owner is billing-gated", async () => {
    const db = makeDb({
      ...makeArchivedRow("owner"),
      plan: "free",
      status: "inactive",
      billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
    });
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000101");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ role: "owner" });
  });

  it("allows collaborators when the wedding owner is already paid", async () => {
    const db = makeDb({
      ...makePlanningRow("editor"),
      plan: "pro",
      status: "active",
      billingGateRequiredAt: null,
    });
    const app = makeApp(db);

    const res = await app.request("/weddings/00000000-0000-4000-8000-000000000101");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ role: "editor" });
  });
});
