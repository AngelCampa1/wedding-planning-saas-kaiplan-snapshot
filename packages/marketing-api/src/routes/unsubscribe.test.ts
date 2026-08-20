import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { signups } from "../db/schema";
import { createApi, type ApiEnv } from "../app";
import { clearRateLimit, makeDb, makeLocalEnv } from "../integration/setup";

async function makeAppWithDb(overrides: Partial<ApiEnv> = {}) {
  const db = await makeDb();
  const app = createApi({
    ...makeLocalEnv({
      SEQUENCER_BASE_URL: "https://sequencer.example.com",
      SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
      SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
    }),
    _db: db as unknown as ApiEnv["_db"],
    ...overrides,
  });
  return { app, db };
}

describe("GET /api/unsubscribe", () => {
  beforeEach(() => {
    clearRateLimit();
    vi.restoreAllMocks();
  });

  it("rejects malformed tokens", async () => {
    const { app } = await makeAppWithDb();
    const res = await app.request("/api/unsubscribe?token=bad");
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown well-formed tokens", async () => {
    const { app } = await makeAppWithDb();
    const res = await app.request(`/api/unsubscribe?token=${"a".repeat(64)}`);
    expect(res.status).toBe(404);
  });

  it("returns a generic 500 when lookup fails", async () => {
    const app = createApi({
      ...makeLocalEnv(),
      _db: {
        select: () => {
          throw new Error("D1_ERROR: unsubscribe lookup failed");
        },
      } as unknown as ApiEnv["_db"],
    });

    const res = await app.request(`/api/unsubscribe?token=${"2".repeat(64)}`);

    expect(res.status).toBe(500);
    await expect(res.text()).resolves.toBe("Internal server error");
  });

  it("does not persist suppression or call Sequencer on GET", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values({
      email: "preview@example.com",
      sourcePage: "/",
      referralCode: "UNSUBGET",
      surveyToken: "1".repeat(64),
      createdAt: "2026-04-20T00:00:00.000Z",
    });

    const res = await app.request(`/api/unsubscribe?token=${"1".repeat(64)}`);

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const [signup] = await db
      .select({ unsubscribedAt: signups.unsubscribedAt })
      .from(signups)
      .where(eq(signups.email, "preview@example.com"));
    expect(signup!.unsubscribedAt).toBeNull();
  });
});

describe("POST /api/unsubscribe", () => {
  beforeEach(() => {
    clearRateLimit();
    vi.restoreAllMocks();
  });

  it("forwards suppression to Sequencer for a known signup", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values({
      email: "unsub@example.com",
      sourcePage: "/",
      referralCode: "UNSUB001",
      surveyToken: "b".repeat(64),
      createdAt: "2026-04-20T00:00:00.000Z",
    });

    const res = await app.request(`/api/unsubscribe?token=${"b".repeat(64)}`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sequencer.example.com/api/v1/unsubscribe",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "CF-Access-Client-Id": "client-id",
          "CF-Access-Client-Secret": "client-secret",
        }),
        body: JSON.stringify({
          product: "kaiplan",
          email: "unsub@example.com",
          scope: "product",
          reason: "Kaiplan unsubscribe",
        }),
      }),
    );
  });

  it("persists local suppression for a known signup", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values({
      email: "local-unsub@example.com",
      sourcePage: "/",
      referralCode: "UNSUBLOC",
      surveyToken: "e".repeat(64),
      createdAt: "2026-04-20T00:00:00.000Z",
    });

    const res = await app.request(`/api/unsubscribe?token=${"e".repeat(64)}`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const [signup] = await db
      .select({ unsubscribedAt: signups.unsubscribedAt })
      .from(signups)
      .where(eq(signups.email, "local-unsub@example.com"));
    expect(signup!.unsubscribedAt).toMatch(/^20\d\d-/);
  });

  it("persists local suppression for legacy case-variant duplicate rows", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values([
      {
        email: "Case-Unsub@example.com",
        sourcePage: "/legacy-upper",
        referralCode: "UNSUBCA1",
        surveyToken: "f".repeat(64),
        createdAt: "2026-04-20T00:00:00.000Z",
      },
      {
        email: "case-unsub@example.com",
        sourcePage: "/legacy-lower",
        referralCode: "UNSUBCA2",
        surveyToken: "0".repeat(64),
        createdAt: "2026-04-20T00:00:00.000Z",
      },
    ]);

    const res = await app.request(`/api/unsubscribe?token=${"f".repeat(64)}`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const rows = await db
      .select({
        email: signups.email,
        unsubscribedAt: signups.unsubscribedAt,
      })
      .from(signups)
      .where(sql`lower(${signups.email}) = ${"case-unsub@example.com"}`);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.unsubscribedAt?.match(/^20\d\d-/))).toBe(
      true,
    );
  });

  it("returns a generic 500 when local suppression fails", async () => {
    const app = createApi({
      ...makeLocalEnv(),
      _db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([{ email: "db-failure@example.com" }]),
            }),
          }),
        }),
        update: () => {
          throw new Error("D1_ERROR: unsubscribe update failed");
        },
      } as unknown as ApiEnv["_db"],
    });

    const res = await app.request(`/api/unsubscribe?token=${"3".repeat(64)}`, {
      method: "POST",
    });

    expect(res.status).toBe(500);
    await expect(res.text()).resolves.toBe("Internal server error");
  });

  it("returns 502 but keeps local suppression when Sequencer unsubscribe fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream down", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values({
      email: "blocked@example.com",
      sourcePage: "/",
      referralCode: "UNSUB502",
      surveyToken: "c".repeat(64),
      createdAt: "2026-04-20T00:00:00.000Z",
    });

    const res = await app.request(`/api/unsubscribe?token=${"c".repeat(64)}`, {
      method: "POST",
    });

    expect(res.status).toBe(502);
    await expect(res.text()).resolves.toContain(
      "upstream suppression could not be confirmed",
    );
    const [signup] = await db
      .select({ unsubscribedAt: signups.unsubscribedAt })
      .from(signups)
      .where(eq(signups.email, "blocked@example.com"));
    expect(signup!.unsubscribedAt).toMatch(/^20\d\d-/);
  });

  it("returns success and keeps local suppression when Sequencer is not configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { app, db } = await makeAppWithDb({
      SEQUENCER_BASE_URL: undefined,
      SEQUENCER_CF_ACCESS_CLIENT_ID: undefined,
      SEQUENCER_CF_ACCESS_CLIENT_SECRET: undefined,
    });
    await db.insert(signups).values({
      email: "unconfigured@example.com",
      sourcePage: "/",
      referralCode: "UNSUB503",
      surveyToken: "d".repeat(64),
      createdAt: "2026-04-20T00:00:00.000Z",
    });

    const res = await app.request(`/api/unsubscribe?token=${"d".repeat(64)}`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain("unsubscribed");
    expect(fetchMock).not.toHaveBeenCalled();
    const [signup] = await db
      .select({ unsubscribedAt: signups.unsubscribedAt })
      .from(signups)
      .where(eq(signups.email, "unconfigured@example.com"));
    expect(signup!.unsubscribedAt).toMatch(/^20\d\d-/);
  });
});
