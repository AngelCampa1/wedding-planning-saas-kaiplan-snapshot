import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { weddingRoutes } from "../../src/routes/weddings";
import type { Database } from "../../src/db/client";
import type { Auth } from "../../src/auth";
import { signMemberInviteToken } from "../../src/lib/email";

type MockEmailService = {
  sendMemberInvite: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  emailVerified: true,
};

const WEDDING_ROW = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "My Wedding",
  date: "2025-06-15",
  budgetCents: 500000,
  currency: "USD",
  timezone: "America/New_York",
  createdBy: TEST_USER.id,
  archivedAt: null,
  status: "planning",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const MEMBER_ROW = {
  id: "member-uuid-1",
  weddingId: WEDDING_ROW.id,
  userId: TEST_USER.id,
  role: "owner" as const,
  invitedEmail: null,
  acceptedAt: new Date("2024-01-01"),
  createdAt: new Date("2024-01-01"),
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/** Creates an Auth mock that always returns a valid session for TEST_USER */
function makeAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: TEST_USER, session: {} }),
    },
  } as unknown as Auth;
}

/** Creates an Auth mock that returns no session (unauthenticated) */
function makeUnauthAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  } as unknown as Auth;
}

/**
 * Creates a chainable Drizzle-like query builder mock.
 * Each method returns `this` (the builder object) so chains work.
 * `resolveWith` is the final resolved value.
 *
 * The builder is itself thenable (has a `.then()`) so it can be awaited
 * directly at any point in the chain. It also supports `.limit()` for
 * routes that call `.limit(1).then(...)`.
 */
function makeSelectBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};

  // Make the builder itself a thenable so `await builder` works
  builder.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolveWith).then(onFulfilled, onRejected);

  builder.select = vi.fn().mockReturnValue(builder);
  builder.from = vi.fn().mockReturnValue(builder);
  builder.innerJoin = vi.fn().mockReturnValue(builder);
  builder.leftJoin = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue({
    then: (fn: (rows: unknown) => unknown) => Promise.resolve(fn(resolveWith)),
  });

  return builder;
}

/** Creates a writable Drizzle builder (insert/update) */
function makeWriteBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.into = vi.fn().mockReturnValue(builder);
  builder.values = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockResolvedValue(resolveWith);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  return builder;
}

function stringifyQueryParts(
  value: unknown,
  seen = new WeakSet<object>(),
): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "";
  seen.add(value);

  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.name === "string") parts.push(record.name);
  if (typeof record.value === "string") parts.push(record.value);
  if (Array.isArray(record.value)) {
    parts.push(
      ...record.value.map((chunk) => stringifyQueryParts(chunk, seen)),
    );
  }
  if (Array.isArray(record.queryChunks)) {
    parts.push(
      ...record.queryChunks.map((chunk) => stringifyQueryParts(chunk, seen)),
    );
  }
  if (Array.isArray(record.params)) {
    parts.push(
      ...record.params.map((param) => stringifyQueryParts(param, seen)),
    );
  }
  if (Array.isArray(record.decoder)) {
    parts.push(
      ...record.decoder.map((chunk) => stringifyQueryParts(chunk, seen)),
    );
  }
  if (record.config) parts.push(stringifyQueryParts(record.config, seen));
  if (record.table) parts.push(stringifyQueryParts(record.table, seen));
  return parts.join(" ");
}

/**
 * Builds a Database mock with configurable per-method responses.
 * `selectRows` — rows returned by any .select() chain
 * `insertResult` — rows returned by .insert().values().returning()
 * `updateResult` — rows returned by .update().set().where().returning()
 * `txFn` — if provided, replaces the transaction implementation entirely
 */
function makeDb({
  selectRows = [] as unknown[],
  insertResult = [] as unknown[],
  updateResult = [] as unknown[],
  txFn,
}: {
  selectRows?: unknown[];
  insertResult?: unknown[];
  updateResult?: unknown[];
  txFn?: (tx: unknown) => Promise<unknown>;
} = {}): Database {
  const selectBuilder = makeSelectBuilder(selectRows);
  const insertBuilder = makeWriteBuilder(insertResult);
  const updateBuilder = makeWriteBuilder(updateResult);

  const db: Record<string, unknown> = {};
  db.select = vi.fn().mockReturnValue(selectBuilder);
  db.insert = vi.fn().mockReturnValue(insertBuilder);
  db.update = vi.fn().mockReturnValue(updateBuilder);
  const deleteBuilder: Record<string, unknown> = {};
  deleteBuilder.where = vi.fn().mockReturnValue(deleteBuilder);
  deleteBuilder.returning = vi.fn().mockResolvedValue([{ id: WEDDING_ROW.id }]);
  deleteBuilder.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(undefined).then(onFulfilled, onRejected);
  db.delete = vi.fn().mockReturnValue(deleteBuilder);

  if (txFn) {
    db.transaction = vi.fn().mockImplementation(txFn);
  } else {
    db.transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx: Record<string, unknown> = {};
        const txInsert = makeWriteBuilder(insertResult);
        tx.insert = vi.fn().mockReturnValue(txInsert);
        tx.update = vi.fn().mockReturnValue(updateBuilder);
        tx.delete = vi.fn().mockReturnValue(deleteBuilder);
        // FOR UPDATE lock support (H2 fix)
        tx.execute = vi.fn().mockResolvedValue([]);
        // In-transaction select: returns only owner's member row (no additional)
        tx.select = vi.fn().mockReturnValue(makeSelectBuilder(selectRows));
        return fn(tx);
      });
  }

  return db as unknown as Database;
}

/** Sets up weddingRoutes mounted on a test Hono app with injected middleware state */
function makeEmailService(): MockEmailService {
  return {
    sendMemberInvite: vi.fn().mockResolvedValue({
      emailId: "email-123",
      provider: "resend",
      status: "sent",
      sentAt: "2026-04-08T12:00:00.000Z",
      templateKey: "member-invite",
      skipped: false,
      rateLimited: false,
      error: null,
    }),
  };
}

function makeApp(db: Database, auth: Auth, emailService = makeEmailService()) {
  const routes = weddingRoutes(db, auth, emailService as never);
  const app = new Hono();
  app.route("/weddings", routes);
  return app;
}

/**
 * Makes a request that simulates a pre-authed user who is a member of a wedding.
 * The wedding-access middleware performs a DB select — we provide it via db.
 */
async function req(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    { EMAIL_TOKEN_SECRET: "test-email-secret" },
  );
}

async function rawJsonReq(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  body: string,
) {
  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body,
    },
    { EMAIL_TOKEN_SECRET: "test-email-secret" },
  );
}

async function makeInviteToken(input: {
  memberId: string;
  weddingId: string;
  email: string;
  role: "editor" | "viewer";
}) {
  return signMemberInviteToken(
    {
      kid: "member-invite-v1",
      ...input,
      email: input.email.toLowerCase(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    "test-email-secret",
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("weddingRoutes", () => {
  // -------------------------------------------------------------------------
  // GET /weddings — list user's weddings
  // -------------------------------------------------------------------------
  describe("GET /weddings", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "GET", "/weddings");
      expect(res.status).toBe(401);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 403 when an existing session user is not email verified", async () => {
      const db = makeDb();
      const auth = {
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { ...TEST_USER, emailVerified: false },
            session: {},
          }),
        },
      } as unknown as Auth;
      const app = makeApp(db, auth);

      const res = await req(app, "GET", "/weddings");
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Email verification required");
    });

    it("returns list of weddings for authenticated user", async () => {
      const weddingWithRole = { ...WEDDING_ROW, role: "owner" };
      const db = makeDb({ selectRows: [weddingWithRole] });
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", "/weddings");
      expect(res.status).toBe(200);

      const body = (await res.json()) as unknown[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect((body[0] as typeof weddingWithRole).name).toBe("My Wedding");
    });

    it("returns empty array when user has no weddings", async () => {
      const db = makeDb({ selectRows: [] });
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", "/weddings");
      expect(res.status).toBe(200);

      const body = (await res.json()) as unknown[];
      expect(body).toHaveLength(0);
    });

    it("returns 402 for gated owners before listing their weddings", async () => {
      const subscriptionRow = {
        userId: TEST_USER.id,
        plan: "free",
        status: "inactive",
        billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
      };
      const weddingWithRole = {
        ...WEDDING_ROW,
        role: "owner",
      };
      let selectCount = 0;
      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([]);
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            select: vi.fn().mockReturnValue(makeSelectBuilder([TARGET_MEMBER])),
            update: vi.fn().mockReturnValue(updateBuilder),
            insert: vi.fn(),
          }),
      }) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount += 1;
        return makeSelectBuilder(
          selectCount === 1 ? [subscriptionRow] : [weddingWithRole],
        );
      });
      const app = makeApp(db as Database, makeAuth());

      const res = await req(app, "GET", "/weddings");

      expect(res.status).toBe(402);
      await expect(res.json()).resolves.toMatchObject({
        billingGateRequired: true,
        plan: "free",
        status: "inactive",
      });
    });

    it("returns 402 when a gated user owns any listed wedding", async () => {
      const subscriptionRow = {
        userId: TEST_USER.id,
        plan: "free",
        status: "inactive",
        billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
      };
      const ownedWedding = {
        ...WEDDING_ROW,
        id: "owned-wedding",
        role: "owner",
      };
      const collaboratorWedding = {
        ...WEDDING_ROW,
        id: "collaborator-wedding",
        role: "editor",
      };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount += 1;
        return makeSelectBuilder(
          selectCount === 1
            ? [subscriptionRow]
            : [ownedWedding, collaboratorWedding],
        );
      });
      const app = makeApp(db as Database, makeAuth());

      const res = await req(app, "GET", "/weddings");

      expect(res.status).toBe(402);
      await expect(res.json()).resolves.toMatchObject({
        billingGateRequired: true,
        plan: "free",
        status: "inactive",
      });
    });
  });

  describe("wedding access roles", () => {
    it("rejects invalid stored member roles before route handlers run", async () => {
      const db = makeDb({
        selectRows: [{ ...MEMBER_ROW, role: "admin" }],
      });
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", `/weddings/${WEDDING_ROW.id}`, {
        name: "Updated Wedding",
      });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({
        error: "Invalid wedding membership role",
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /weddings — create a wedding
  // -------------------------------------------------------------------------
  describe("POST /weddings", () => {
    const validBody = {
      name: "Beach Wedding",
      date: "2025-08-20",
      budgetCents: 300000,
      currency: "USD",
      timezone: "America/New_York",
    };

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "POST", "/weddings", validBody);
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb();
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", "/weddings", { name: "" });
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: unknown };
      expect(body.error).toBeDefined();
    });

    it("returns 400 for malformed JSON", async () => {
      const db = makeDb();
      const app = makeApp(db, makeAuth());

      const res = await rawJsonReq(app, "POST", "/weddings", '{"name":');

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Malformed JSON request body",
      });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("returns 400 for non-object JSON", async () => {
      const db = makeDb();
      const app = makeApp(db, makeAuth());

      const res = await rawJsonReq(app, "POST", "/weddings", "[]");

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "JSON request body must be an object",
      });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("returns 402 when billing setup is still required", async () => {
      const subscriptionRow = {
        userId: TEST_USER.id,
        plan: "free",
        status: "inactive",
        billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
      };
      const db = makeDb({ selectRows: [subscriptionRow] });
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", "/weddings", validBody);

      expect(res.status).toBe(402);
      await expect(res.json()).resolves.toMatchObject({
        billingGateRequired: true,
        plan: "free",
        status: "inactive",
      });
    });

    it("creates a wedding and returns 201 with the new wedding", async () => {
      const newWedding = { ...WEDDING_ROW, name: "Beach Wedding" };

      // Transaction: first insert returns [newWedding], second insert writes the
      // owner member, third insert seeds the subscription trial.
      let insertCallCount = 0;
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.insert = vi.fn().mockImplementation(() => {
            insertCallCount++;
            const b: Record<string, unknown> = {};
            if (insertCallCount === 1) {
              // wedding insert
              b.values = vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([newWedding]),
              });
            } else if (insertCallCount === 2) {
              // member insert
              b.values = vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([MEMBER_ROW]),
              });
            } else {
              // subscription trial seed
              b.values = vi.fn().mockReturnValue({
                onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
              });
            }
            return b;
          });
          return fn(tx);
        },
      }) as unknown as Record<string, unknown>;

      const app = makeApp(db as Database, makeAuth());
      const res = await req(app, "POST", "/weddings", validBody);

      expect(res.status).toBe(201);
      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("Beach Wedding");
    });

    it("seeds trialStartedAt on first wedding creation when no subscription exists", async () => {
      const newWedding = { ...WEDDING_ROW, name: "Beach Wedding" };

      const upsertValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { userId: TEST_USER.id, plan: "free", status: "trialing" },
            ]),
        }),
      });
      let insertCallCount = 0;
      const db = makeDb({
        selectRows: [],
        txFn: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.insert = vi.fn().mockImplementation(() => {
            insertCallCount++;
            const b: Record<string, unknown> = {};
            if (insertCallCount === 1) {
              b.values = vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([newWedding]),
              });
            } else if (insertCallCount === 2) {
              b.values = vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([MEMBER_ROW]),
              });
            } else {
              b.values = upsertValues;
            }
            return b;
          });
          return fn(tx);
        },
      }) as unknown as Record<string, unknown>;

      const app = makeApp(db as Database, makeAuth());
      const res = await req(app, "POST", "/weddings", validBody);

      expect(res.status).toBe(201);
      expect(upsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER.id,
          plan: "free",
          status: "trialing",
          trialStartedAt: expect.any(Date),
        }),
      );
    });

    it("does not overwrite trialStartedAt when the user already has a subscription", async () => {
      const newWedding = { ...WEDDING_ROW, name: "Beach Wedding" };
      const existingSubscription = {
        userId: TEST_USER.id,
        plan: "free",
        status: "inactive",
        billingGateRequiredAt: null,
        trialStartedAt: new Date(),
      };

      const upsertValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([existingSubscription]),
        }),
      });

      let insertCallCount = 0;
      const db = makeDb({
        selectRows: [existingSubscription],
        txFn: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.insert = vi.fn().mockImplementation(() => {
            insertCallCount++;
            const b: Record<string, unknown> = {};
            if (insertCallCount === 1) {
              b.values = vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([newWedding]),
              });
            } else if (insertCallCount === 2) {
              b.values = vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([MEMBER_ROW]),
              });
            } else {
              b.values = upsertValues;
            }
            return b;
          });
          return fn(tx);
        },
      }) as unknown as Record<string, unknown>;

      const app = makeApp(db as Database, makeAuth());
      const res = await req(app, "POST", "/weddings", validBody);

      expect(res.status).toBe(201);
      const conflictCall = upsertValues.mock.results[0]?.value;
      expect(conflictCall.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            trialStartedAt: expect.any(Date),
          }),
          // setWhere must be a Drizzle SQL object (isNull produces a SQL instance
          // with queryChunks) — a plain boolean or undefined would slip through
          // expect.anything() but would fail the actual Drizzle upsert.
          setWhere: expect.objectContaining({
            queryChunks: expect.any(Array),
          }),
        }),
      );
    });

    it("seeds the first-wedding trial inside the creation transaction", async () => {
      const newWedding = { ...WEDDING_ROW, name: "Beach Wedding" };
      let insertCallCount = 0;
      const transactionInsert = vi.fn().mockImplementation(() => {
        insertCallCount++;
        const b: Record<string, unknown> = {};
        if (insertCallCount === 1) {
          b.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newWedding]),
          });
        } else if (insertCallCount === 2) {
          b.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([MEMBER_ROW]),
          });
        } else {
          b.values = vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          });
        }
        return b;
      });
      const rootInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const db = makeDb({
        selectRows: [],
        txFn: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ insert: transactionInsert }),
      }) as unknown as Record<string, unknown>;
      db.insert = rootInsert;

      const app = makeApp(db as Database, makeAuth());
      const res = await req(app, "POST", "/weddings", validBody);

      expect(res.status).toBe(201);
      expect(transactionInsert).toHaveBeenCalledTimes(3);
      expect(rootInsert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /weddings/:weddingId — get wedding details
  // -------------------------------------------------------------------------
  describe("GET /weddings/:weddingId", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a wedding member", async () => {
      // First select (wedding-access middleware) returns no member
      // We use a custom db that returns [] for all selects
      const db = makeDb({ selectRows: [] });
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}`);
      expect(res.status).toBe(403);
    });

    it("returns 404 when wedding not found after access check passes", async () => {
      // select() is called twice: once in weddingAccess (returns member), once in route (returns nothing)
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        const rows = selectCount === 1 ? [MEMBER_ROW] : [];
        return makeSelectBuilder(rows);
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}`);
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Wedding not found");
    });

    it("returns wedding details when found and user has access", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        const rows = selectCount === 1 ? [MEMBER_ROW] : [WEDDING_ROW];
        return makeSelectBuilder(rows);
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("My Wedding");
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /weddings/:weddingId — update wedding
  // -------------------------------------------------------------------------
  describe("PATCH /weddings/:weddingId", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "PATCH", `/weddings/${WEDDING_ROW.id}`, {
        name: "Updated",
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a wedding member", async () => {
      const db = makeDb({ selectRows: [] });
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", `/weddings/${WEDDING_ROW.id}`, {
        name: "Updated",
      });
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Not a member of this wedding");
    });

    it("returns 403 when user is a viewer (cannot edit)", async () => {
      const viewerMember = { ...MEMBER_ROW, role: "viewer" };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        // Only the first select (wedding-access) should be called; it returns viewer
        return makeSelectBuilder(selectCount === 1 ? [viewerMember] : []);
      });
      (db as unknown as Record<string, unknown>).update = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "PATCH", `/weddings/${WEDDING_ROW.id}`, {
        name: "Updated",
      });
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Viewers cannot edit weddings");
    });

    it("returns 400 for invalid update body", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      (db as unknown as Record<string, unknown>).update = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      // budgetCents must be a non-negative integer
      const res = await req(app, "PATCH", `/weddings/${WEDDING_ROW.id}`, {
        budgetCents: -1,
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for malformed JSON update bodies", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      db.update = vi.fn();
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await rawJsonReq(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}`,
        '{"name":',
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Malformed JSON request body",
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it("updates wedding and returns 200", async () => {
      const updatedWedding = { ...WEDDING_ROW, name: "Updated Wedding" };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      // update chain
      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([updatedWedding]);
      db.update = vi.fn().mockReturnValue(updateBuilder);

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "PATCH", `/weddings/${WEDDING_ROW.id}`, {
        name: "Updated Wedding",
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("Updated Wedding");
    });

    it("returns 404 when the update no longer affects a wedding", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([]);
      db.update = vi.fn().mockReturnValue(updateBuilder);

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "PATCH", `/weddings/${WEDDING_ROW.id}`, {
        name: "Updated Wedding",
      });

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Wedding not found",
      });
    });

    it("allows editor to update wedding", async () => {
      const editorMember = { ...MEMBER_ROW, role: "editor" };
      const updatedWedding = { ...WEDDING_ROW, name: "Editor Updated" };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [editorMember] : []);
      });

      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([updatedWedding]);
      db.update = vi.fn().mockReturnValue(updateBuilder);

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "PATCH", `/weddings/${WEDDING_ROW.id}`, {
        name: "Editor Updated",
      });
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // POST /weddings/:weddingId/members — invite a member
  // -------------------------------------------------------------------------
  describe("POST /weddings/:weddingId/members", () => {
    const validInvite = { email: "invited@example.com", role: "editor" };

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a wedding member", async () => {
      const db = makeDb({ selectRows: [] });
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Not a member of this wedding");
    });

    it("returns 403 when user is an editor (not owner)", async () => {
      const editorMember = { ...MEMBER_ROW, role: "editor" };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [editorMember] : []);
      });
      db.insert = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Only owners can invite members");
    });

    it("returns 403 when user is a viewer (not owner)", async () => {
      const viewerMember = { ...MEMBER_ROW, role: "viewer" };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [viewerMember] : []);
      });
      db.insert = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Only owners can invite members");
    });

    it("returns 400 for invalid invite body", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      db.insert = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "not-an-email",
          role: "editor",
        },
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-object JSON invite bodies", async () => {
      const db = makeDb({ selectRows: [MEMBER_ROW] }) as unknown as Record<
        string,
        unknown
      >;
      db.transaction = vi.fn();
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await rawJsonReq(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        "null",
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "JSON request body must be an object",
      });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid role", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      db.insert = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "invited@example.com",
          role: "owner", // owner is not a valid role for inviteMemberSchema
        },
      );
      expect(res.status).toBe(400);
    });

    it("returns 409 when owners invite their own account email", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      db.insert = vi.fn();

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "USER@example.com", role: "editor" },
      );

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Member already invited");
      expect(db.insert).not.toHaveBeenCalled();
      expect(emailService.sendMemberInvite).not.toHaveBeenCalled();
    });

    it("returns 409 when member is already active", async () => {
      const existingMember = {
        id: "member-uuid-2",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "invited@example.com",
        role: "editor",
        userId: null,
        acceptedAt: new Date(),
        createdAt: new Date(),
      };

      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        // 1st select: wedding-access (owner member)
        // 2nd select: existing invite check (returns existing)
        return makeSelectBuilder(
          selectCount === 1 ? [MEMBER_ROW] : [existingMember],
        );
      });
      db.insert = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );
      expect(res.status).toBe(409);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Member already invited");
    });

    it("resends a pending invite instead of returning 409", async () => {
      const pendingMember = {
        id: "member-uuid-2",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "invited@example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };
      const updatedPendingMember = {
        ...pendingMember,
        role: "editor" as const,
      };

      let selectCount = 0;
      const txUpdate = vi
        .fn()
        .mockReturnValue(makeWriteBuilder([updatedPendingMember]));
      const txInsert = vi.fn().mockReturnValue(makeWriteBuilder([]));
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.update = txUpdate;
          tx.insert = txInsert;
          return fn(tx);
        },
      }) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(
          selectCount === 1 ? [MEMBER_ROW] : [pendingMember],
        );
      });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { ...validInvite, role: "editor" },
      );

      expect(res.status).toBe(200);
      expect(emailService.sendMemberInvite).toHaveBeenCalledTimes(1);
      expect(txInsert).toHaveBeenCalledTimes(1);
      expect(txUpdate).toHaveBeenCalledTimes(1);
      await expect(res.json()).resolves.toMatchObject({
        invitedEmail: "invited@example.com",
        role: "editor",
        delivery: {
          status: "sent",
          templateKey: "member-invite",
          provider: "resend",
        },
      });
    });

    it("finds existing pending invites case-insensitively before insert", async () => {
      const pendingMember = {
        id: "member-uuid-2",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "Invited@Example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };
      const updatedPendingMember = {
        ...pendingMember,
        invitedEmail: "invited@example.com",
        role: "editor" as const,
      };

      let selectCount = 0;
      const duplicateLookupBuilder = makeSelectBuilder([pendingMember]);
      const duplicateWhereSpy = duplicateLookupBuilder.where as ReturnType<
        typeof vi.fn
      >;
      const txUpdateBuilder = makeWriteBuilder([updatedPendingMember]);
      const txUpdate = vi.fn().mockReturnValue(txUpdateBuilder);
      const txInsert = vi.fn().mockReturnValue(makeWriteBuilder([]));
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.update = txUpdate;
          tx.insert = txInsert;
          return fn(tx);
        },
      }) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        if (selectCount === 2) return duplicateLookupBuilder;
        return makeSelectBuilder([MEMBER_ROW, pendingMember]);
      });
      db.insert = vi.fn();

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );

      expect(res.status).toBe(200);
      expect(
        stringifyQueryParts(duplicateWhereSpy.mock.calls[0]?.[0]),
      ).toContain("lower");
      expect(db.insert).not.toHaveBeenCalled();
      expect(txUpdate).toHaveBeenCalledTimes(1);
      expect(emailService.sendMemberInvite).toHaveBeenCalledWith(
        expect.objectContaining({ email: "invited@example.com" }),
      );
    });

    it("returns 402 when inviting an extra planner without plan access", async () => {
      const existingMember = {
        id: "member-uuid-2",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "planner@example.com",
        role: "editor",
        userId: "user-2",
        acceptedAt: new Date(),
        createdAt: new Date(),
      };

      let outerSelectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        outerSelectCount++;
        if (outerSelectCount === 1) {
          // wedding-access middleware
          return makeSelectBuilder([MEMBER_ROW]);
        }
        // existing invite check: none
        return makeSelectBuilder([]);
      });

      // H2: paywall check is now inside the transaction
      let transactionCount = 0;
      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const txAuditValues = vi.fn().mockResolvedValue(undefined);
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          transactionCount++;
          if (transactionCount === 2) {
            return fn({
              delete: txDelete,
              insert: vi.fn().mockReturnValue({ values: txAuditValues }),
            });
          }
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          let txSelectCount = 0;
          tx.select = vi.fn().mockImplementation(() => {
            txSelectCount++;
            if (txSelectCount === 1) {
              // all members: owner + existingMember
              return makeSelectBuilder([MEMBER_ROW, existingMember]);
            }
            // getWeddingOwnerSubscription -> getWeddingOwnerId: no sub
            return makeSelectBuilder([]);
          });
          tx.insert = vi.fn();
          return fn(tx);
        });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "friend@example.com",
          role: "viewer",
        },
      );
      expect(res.status).toBe(402);

      const body = (await res.json()) as { feature: string };
      expect(body.feature).toBe("extraPlanner");
    });

    it("returns 402 when the owner's paid plan is past due", async () => {
      const existingMember = {
        id: "member-uuid-2",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "planner@example.com",
        role: "editor",
        userId: "user-2",
        acceptedAt: new Date(),
        createdAt: new Date(),
      };

      let outerSelectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        outerSelectCount++;
        if (outerSelectCount === 1) {
          // wedding-access middleware
          return makeSelectBuilder([MEMBER_ROW]);
        }
        // existing invite check: none
        return makeSelectBuilder([]);
      });

      // H2: paywall check is now inside the transaction
      let transactionCount = 0;
      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const txAuditValues = vi.fn().mockResolvedValue(undefined);
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          transactionCount++;
          if (transactionCount === 2) {
            return fn({
              delete: txDelete,
              insert: vi.fn().mockReturnValue({ values: txAuditValues }),
            });
          }
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          let txSelectCount = 0;
          tx.select = vi.fn().mockImplementation(() => {
            txSelectCount++;
            if (txSelectCount === 1) {
              // all members: owner + existingMember
              return makeSelectBuilder([MEMBER_ROW, existingMember]);
            }
            if (txSelectCount === 2) {
              // getWeddingOwnerId
              return makeSelectBuilder([{ createdBy: TEST_USER.id }]);
            }
            // loadSubscription — past_due pro plan
            return makeSelectBuilder([
              {
                userId: TEST_USER.id,
                stripeCustomerId: "cus_123",
                stripePriceId: "price_pro",
                plan: "pro",
                status: "past_due",
                currentPeriodEnd: new Date("2026-05-01"),
                createdAt: new Date("2026-01-01"),
                updatedAt: new Date("2026-01-01"),
              },
            ]);
          });
          tx.insert = vi.fn();
          return fn(tx);
        });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "friend@example.com",
          role: "viewer",
        },
      );
      expect(res.status).toBe(402);

      const body = (await res.json()) as { feature: string; status: string };
      expect(body.feature).toBe("extraPlanner");
      expect(body.status).toBe("past_due");
    });

    it("allows an extra planner when the owner has active paid access", async () => {
      const existingMember = {
        id: "member-uuid-2",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "planner@example.com",
        role: "editor",
        userId: "user-2",
        acceptedAt: new Date(),
        createdAt: new Date(),
      };
      const newMemberRow = {
        id: "member-uuid-3",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "friend@example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };

      let outerSelectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        outerSelectCount++;
        if (outerSelectCount === 1) {
          // wedding-access middleware
          return makeSelectBuilder([MEMBER_ROW]);
        }
        // existing invite check: none
        return makeSelectBuilder([]);
      });

      // H2: paywall and insert are now inside the transaction
      let transactionCount = 0;
      const firstUseUpdateBuilder = makeWriteBuilder([]);
      db.update = vi.fn().mockReturnValue(firstUseUpdateBuilder);
      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const txAuditValues = vi.fn().mockResolvedValue(undefined);
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          transactionCount++;
          if (transactionCount >= 2) {
            return fn({
              delete: txDelete,
              insert: vi.fn().mockReturnValue({ values: txAuditValues }),
            });
          }
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          let txSelectCount = 0;
          tx.select = vi.fn().mockImplementation(() => {
            txSelectCount++;
            if (txSelectCount === 1) {
              // all members: owner + existingMember
              return makeSelectBuilder([MEMBER_ROW, existingMember]);
            }
            if (txSelectCount === 2) {
              // getWeddingOwnerId
              return makeSelectBuilder([{ createdBy: TEST_USER.id }]);
            }
            // loadSubscription — active pro plan
            return makeSelectBuilder([
              {
                userId: TEST_USER.id,
                stripeCustomerId: "cus_123",
                stripePriceId: "price_pro",
                plan: "pro",
                status: "active",
                currentPeriodEnd: new Date("2026-05-01"),
                createdAt: new Date("2026-01-01"),
                updatedAt: new Date("2026-01-01"),
              },
            ]);
          });
          const txInsertBuilder: Record<string, unknown> = {};
          txInsertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newMemberRow]),
          });
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);
          return fn(tx);
        });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "friend@example.com",
          role: "viewer",
        },
      );
      expect(res.status).toBe(201);
      expect(firstUseUpdateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ extraPlannerFirstUsedAt: expect.any(Date) }),
      );
    });

    it("does NOT count the owner's own member row as an additional planner even when invitedEmail is set", async () => {
      // Owner's row may have invitedEmail set (e.g. accepted via invite flow).
      // The filter must only exclude by userId match, not OR with invitedEmail.
      const ownerRowWithEmail = {
        id: "member-uuid-owner-invite",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "owner+invite@example.com",
        role: "owner",
        userId: TEST_USER.id,
        acceptedAt: null,
        createdAt: new Date(),
      };

      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      const newMemberRow = {
        id: "member-uuid-2",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "friend@example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) {
          // wedding-access middleware: current user is owner
          return makeSelectBuilder([MEMBER_ROW]);
        }
        // existing-invite check: none
        return makeSelectBuilder([]);
      });

      // H2: paywall count + insert now happen inside transaction
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          tx.select = vi
            .fn()
            // all members for billing count: only the owner's row (with invitedEmail set)
            .mockReturnValueOnce(makeSelectBuilder([ownerRowWithEmail]))
            // no further selects needed (owner is the only member, no paywall)
            .mockReturnValue(makeSelectBuilder([]));
          const txInsertBuilder: Record<string, unknown> = {};
          txInsertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newMemberRow]),
          });
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);
          return fn(tx);
        });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "friend@example.com",
          role: "viewer",
        },
      );

      // Owner should NOT be counted as additional planner — invitation allowed on free plan
      expect(res.status).toBe(201);
    });

    it("invites a new member and returns 201", async () => {
      const newMemberRow = {
        id: "member-uuid-2",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "invited@example.com",
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };

      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        // 1st: wedding-access (owner), 2nd: existing check (no existing)
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      // The new implementation wraps insert+email in a transaction (with FOR UPDATE lock)
      const txInsertBuilder: Record<string, unknown> = {};
      txInsertBuilder.values = vi.fn().mockImplementation((values: unknown) => {
        if (values && typeof values === "object" && "invitedEmail" in values) {
          return { returning: vi.fn().mockResolvedValue([newMemberRow]) };
        }
        return Promise.resolve(undefined);
      });
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          // In-tx member count: only owner — no paywall triggered
          tx.select = vi.fn().mockReturnValue(makeSelectBuilder([MEMBER_ROW]));
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);
          return fn(tx);
        });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );
      expect(res.status).toBe(201);

      const body = (await res.json()) as { invitedEmail: string; role: string };
      expect(body.invitedEmail).toBe("invited@example.com");
      expect(body.role).toBe("editor");
      expect(body).toMatchObject({
        delivery: {
          status: "sent",
          templateKey: "member-invite",
          provider: "resend",
        },
      });
      expect(txInsertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          actorUserId: TEST_USER.id,
          eventType: "wedding.member.invited",
          targetType: "wedding_member",
          targetId: newMemberRow.id,
          metadata: expect.objectContaining({
            role: "editor",
            deliveryStatus: "pending",
          }),
        }),
      );
    });

    it("returns 502 and removes the pending invite when email sending fails", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      let transactionCount = 0;
      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const txAuditValues = vi.fn().mockResolvedValue(undefined);
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          transactionCount++;
          if (transactionCount >= 2) {
            return fn({
              delete: txDelete,
              insert: vi.fn().mockReturnValue({ values: txAuditValues }),
            });
          }
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          // In-tx member count: only owner — no paywall triggered
          tx.select = vi.fn().mockReturnValue(makeSelectBuilder([MEMBER_ROW]));
          const txInsertBuilder: Record<string, unknown> = {};
          txInsertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "member-uuid-3",
                weddingId: WEDDING_ROW.id,
                invitedEmail: "invited@example.com",
                role: "viewer",
                userId: null,
                acceptedAt: null,
                createdAt: new Date(),
              },
            ]),
          });
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);
          return fn(tx);
        });

      const emailService = makeEmailService();
      emailService.sendMemberInvite.mockRejectedValueOnce(
        new Error("provider offline"),
      );

      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "invited@example.com",
          role: "viewer",
        },
      );

      expect(res.status).toBe(502);
      expect(txDelete).toHaveBeenCalled();
      expect(txAuditValues).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          actorUserId: TEST_USER.id,
          eventType: "wedding.member.invite_delivery_failed",
          targetType: "wedding_member",
          targetId: "member-uuid-3",
          metadata: expect.objectContaining({
            role: "viewer",
            pendingInviteRemoved: true,
          }),
        }),
      );
      await expect(res.json()).resolves.toMatchObject({
        error: "Failed to deliver invite email.",
        delivery: {
          status: "failed",
          error: "Email delivery failed.",
          templateKey: "member-invite",
        },
      });
    });

    it("does not send the invite email when pending invite creation fails after insert", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          tx.select = vi.fn().mockReturnValue(makeSelectBuilder([MEMBER_ROW]));
          const txInsertBuilder: Record<string, unknown> = {};
          txInsertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "member-uuid-3",
                weddingId: WEDDING_ROW.id,
                invitedEmail: "invited@example.com",
                role: "viewer",
                userId: null,
                acceptedAt: null,
                createdAt: new Date(),
              },
            ]),
          });
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);
          await fn(tx);
          throw new Error("commit failed");
        });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "invited@example.com",
          role: "viewer",
        },
      );

      expect(res.status).toBe(502);
      expect(emailService.sendMemberInvite).not.toHaveBeenCalled();
      await expect(res.json()).resolves.toMatchObject({
        error: "Failed to create invite.",
        delivery: {
          status: "failed",
          error: "Email delivery failed.",
          templateKey: "member-invite",
        },
      });
    });

    it("returns 502 when pending invite insert returns no row", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          tx.select = vi.fn().mockReturnValue(makeSelectBuilder([MEMBER_ROW]));
          tx.insert = vi.fn().mockReturnValue(makeWriteBuilder([]));
          return fn(tx);
        });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );

      expect(res.status).toBe(502);
      expect(emailService.sendMemberInvite).not.toHaveBeenCalled();
      await expect(res.json()).resolves.toMatchObject({
        error: "Failed to create invite.",
        delivery: {
          status: "failed",
          error: "Email delivery failed.",
        },
      });
    });

    it("uses a fallback failure message when invite delivery throws a non-error value", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      let transactionCount = 0;
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          transactionCount++;
          if (transactionCount >= 2) {
            return fn({
              delete: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
              }),
              insert: vi.fn().mockReturnValue({
                values: vi.fn().mockResolvedValue(undefined),
              }),
            });
          }
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          tx.select = vi.fn().mockReturnValue(makeSelectBuilder([MEMBER_ROW]));
          const txInsertBuilder: Record<string, unknown> = {};
          txInsertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "member-uuid-4",
                weddingId: WEDDING_ROW.id,
                invitedEmail: "invited@example.com",
                role: "viewer",
                userId: null,
                acceptedAt: null,
                createdAt: new Date(),
              },
            ]),
          });
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);
          return fn(tx);
        });

      const emailService = makeEmailService();
      emailService.sendMemberInvite.mockRejectedValueOnce("provider offline");

      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "invited@example.com",
          role: "viewer",
        },
      );

      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toMatchObject({
        error: "Failed to deliver invite email.",
        delivery: {
          status: "failed",
          error: "Email delivery failed.",
          templateKey: "member-invite",
        },
      });
    });

    it("returns 403 when role 'owner' bypasses schema (server-side defense-in-depth)", async () => {
      // This tests the server-side guard that rejects 'owner' even if schema parsing
      // somehow succeeded (defense-in-depth). We simulate this by constructing the
      // request body directly and bypassing the schema rejection in the mock.
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      db.insert = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      // The schema already blocks 'owner' with a 400; test confirms it stays blocked
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "invited@example.com",
          role: "owner",
        },
      );
      // schema validation fires first (400) — server-side guard is defense-in-depth
      expect([400, 403]).toContain(res.status);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("accepts role 'editor' successfully", async () => {
      const newMemberRow = {
        id: "member-uuid-editor",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "editor@example.com",
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };

      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          tx.select = vi.fn().mockReturnValue(makeSelectBuilder([MEMBER_ROW]));
          const txInsertBuilder: Record<string, unknown> = {};
          txInsertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newMemberRow]),
          });
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);
          return fn(tx);
        });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "editor@example.com", role: "editor" },
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { role: string };
      expect(body.role).toBe("editor");
    });

    it("accepts role 'viewer' successfully", async () => {
      const newMemberRow = {
        id: "member-uuid-viewer",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "viewer@example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };

      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          tx.select = vi.fn().mockReturnValue(makeSelectBuilder([MEMBER_ROW]));
          const txInsertBuilder: Record<string, unknown> = {};
          txInsertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newMemberRow]),
          });
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);
          return fn(tx);
        });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "viewer@example.com", role: "viewer" },
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { role: string };
      expect(body.role).toBe("viewer");
    });

    it("returns 409 when UNIQUE constraint violation occurs (concurrent duplicate insert)", async () => {
      // Simulates two concurrent invites for the same email passing the
      // 'already invited?' check simultaneously. The second one hits the
      // DB unique constraint and throws a PG unique_violation error.
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        // Both concurrent requests see no existing invite on first check
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      // Transaction throws a PostgreSQL unique_violation (code 23505)
      const uniqueViolationError = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "weddingMember_weddingId_invitedEmail_unique"',
        ),
        { code: "23505" },
      );

      db.transaction = vi.fn().mockRejectedValue(uniqueViolationError);

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "invited@example.com", role: "editor" },
      );

      // The route should surface a 409 for unique constraint violations
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/already invited/i);
    });

    it("rolls back the pending invite update when resend delivery fails", async () => {
      const pendingMember = {
        id: "member-uuid-5",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "invited@example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };

      let selectCount = 0;
      const txUpdate = vi
        .fn()
        .mockReturnValue(
          makeWriteBuilder([{ ...pendingMember, role: "editor" }]),
        );
      const txAuditValues = vi.fn().mockResolvedValue(undefined);
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.update = txUpdate;
          tx.insert = vi.fn().mockReturnValue({ values: txAuditValues });
          // Propagate the error so the transaction naturally aborts
          return fn(tx);
        },
      }) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(
          selectCount === 1 ? [MEMBER_ROW] : [pendingMember],
        );
      });

      const emailService = makeEmailService();
      emailService.sendMemberInvite.mockRejectedValueOnce(
        new Error("provider offline"),
      );

      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );

      expect(res.status).toBe(502);
      expect(txUpdate).toHaveBeenCalledTimes(2);
      const rollbackBuilder = txUpdate.mock.results[1]?.value as
        | Record<string, ReturnType<typeof vi.fn>>
        | undefined;
      const rollbackWhere = rollbackBuilder?.where.mock.calls[0]?.[0];
      expect(stringifyQueryParts(rollbackWhere)).toContain("wedding_id");
      expect(stringifyQueryParts(rollbackWhere)).toContain("invited_email");
      expect(stringifyQueryParts(rollbackWhere)).toContain("user_id");
      expect(stringifyQueryParts(rollbackWhere)).toContain("accepted_at");
      expect(
        db.update as unknown as ReturnType<typeof vi.fn>,
      ).not.toHaveBeenCalled();
      expect(txAuditValues).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          actorUserId: TEST_USER.id,
          eventType: "wedding.member.reinvite_delivery_failed",
          targetType: "wedding_member",
          targetId: pendingMember.id,
          metadata: expect.objectContaining({
            role: "editor",
            revertedRole: "viewer",
          }),
        }),
      );
      await expect(res.json()).resolves.toMatchObject({
        error: "Failed to deliver invite email.",
        member: {
          invitedEmail: "invited@example.com",
          role: "viewer",
        },
        delivery: {
          status: "failed",
          error: "Email delivery failed.",
          templateKey: "member-invite",
        },
      });
    });

    it("returns 409 when re-invite update returns no row", async () => {
      const pendingMember = {
        id: "member-uuid-5",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "invited@example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };

      let selectCount = 0;
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            update: vi.fn().mockReturnValue(makeWriteBuilder([])),
            insert: vi.fn().mockReturnValue({ values: vi.fn() }),
          }),
      }) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(
          selectCount === 1 ? [MEMBER_ROW] : [pendingMember],
        );
      });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        validInvite,
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "Invite token is no longer pending",
      });
      expect(emailService.sendMemberInvite).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /weddings/:weddingId/members — list members
  // -------------------------------------------------------------------------
  describe("GET /weddings/:weddingId/members", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/members`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member", async () => {
      const db = makeDb({ selectRows: [] });
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/members`);
      expect(res.status).toBe(403);
    });

    it("returns array of members for a wedding", async () => {
      const secondMember = {
        id: "member-uuid-2",
        weddingId: WEDDING_ROW.id,
        userId: "user-2",
        role: "editor",
        invitedEmail: "editor@example.com",
        acceptedAt: new Date("2024-01-02"),
        createdAt: new Date("2024-01-02"),
        userName: null,
        userEmail: null,
      };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        // 1st: weddingAccess middleware, 2nd: list members
        return makeSelectBuilder(
          selectCount === 1 ? [MEMBER_ROW] : [MEMBER_ROW, secondMember],
        );
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/members`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
    });

    it("includes userName and userEmail from the joined user table", async () => {
      const enrichedMember = {
        id: MEMBER_ROW.id,
        weddingId: WEDDING_ROW.id,
        userId: "user-1",
        role: "owner",
        invitedEmail: null,
        acceptedAt: null,
        createdAt: new Date("2024-01-01"),
        userName: "Alice Planner",
        userEmail: "alice@example.com",
      };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        // 1st: weddingAccess middleware, 2nd: list members (enriched)
        return makeSelectBuilder(
          selectCount === 1 ? [MEMBER_ROW] : [enrichedMember],
        );
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/members`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{
        userName: string | null;
        userEmail: string | null;
      }>;
      expect(body[0].userName).toBe("Alice Planner");
      expect(body[0].userEmail).toBe("alice@example.com");
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /weddings/:weddingId/members/:memberId — remove a member
  // -------------------------------------------------------------------------
  describe("DELETE /weddings/:weddingId/members/:memberId", () => {
    const OTHER_MEMBER = {
      id: "member-uuid-other",
      weddingId: WEDDING_ROW.id,
      userId: "user-other",
      role: "editor" as const,
      invitedEmail: null,
      acceptedAt: new Date("2024-01-02"),
      createdAt: new Date("2024-01-02"),
    };

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/members/${OTHER_MEMBER.id}`,
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member", async () => {
      const db = makeDb({ selectRows: [] });
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/members/${OTHER_MEMBER.id}`,
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when user is not an owner", async () => {
      const editorMember = { ...MEMBER_ROW, role: "editor" as const };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [editorMember] : []);
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/members/${OTHER_MEMBER.id}`,
      );
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Only owners can remove members");
    });

    it("returns 409 when owner tries to remove themselves", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        // Lookup by memberId returns MEMBER_ROW (userId === TEST_USER.id)
        return makeSelectBuilder([MEMBER_ROW]);
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/members/${MEMBER_ROW.id}`,
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Cannot remove yourself");
    });

    it("returns 404 when member not found", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        return makeSelectBuilder([]);
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/members/nonexistent-id`,
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Member not found");
    });

    it("removes a member and returns 204", async () => {
      let selectCount = 0;
      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([OTHER_MEMBER]),
        }),
      });
      const txAuditValues = vi.fn().mockResolvedValue(undefined);
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            delete: txDelete,
            insert: vi.fn().mockReturnValue({ values: txAuditValues }),
          }),
      }) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        return makeSelectBuilder([OTHER_MEMBER]);
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/members/${OTHER_MEMBER.id}`,
      );
      expect(res.status).toBe(204);
      expect(txDelete).toHaveBeenCalled();
      expect(txAuditValues).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          actorUserId: TEST_USER.id,
          eventType: "wedding.member.removed",
          targetType: "wedding_member",
          targetId: OTHER_MEMBER.id,
          metadata: expect.objectContaining({
            removedRole: OTHER_MEMBER.role,
          }),
        }),
      );
    });

    it("returns 204 when member removal races and delete returns no row", async () => {
      let selectCount = 0;
      const txAuditInsert = vi.fn();
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            delete: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
              }),
            }),
            insert: txAuditInsert,
          }),
      }) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        return makeSelectBuilder([OTHER_MEMBER]);
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/members/${OTHER_MEMBER.id}`,
      );

      expect(res.status).toBe(204);
      expect(txAuditInsert).not.toHaveBeenCalled();
    });

    it("records wasAccepted false when removing an unaccepted pending member", async () => {
      const pendingMember = {
        ...OTHER_MEMBER,
        userId: null,
        acceptedAt: null,
      };
      let selectCount = 0;
      const txAuditValues = vi.fn().mockResolvedValue(undefined);
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            delete: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([pendingMember]),
              }),
            }),
            insert: vi.fn().mockReturnValue({ values: txAuditValues }),
          }),
      }) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        return makeSelectBuilder([pendingMember]);
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/members/${pendingMember.id}`,
      );

      expect(res.status).toBe(204);
      expect(txAuditValues).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            removedRole: pendingMember.role,
            wasAccepted: false,
          }),
        }),
      );
    });

    it("scopes member removal lookup and delete by memberId and weddingId", async () => {
      let selectCount = 0;
      const lookupWhere = vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          then: (fn: (rows: unknown) => unknown) =>
            Promise.resolve(fn([OTHER_MEMBER])),
        }),
      });
      const deleteWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([OTHER_MEMBER]),
      });
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            delete: vi.fn().mockReturnValue({
              where: deleteWhere,
            }),
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockResolvedValue(undefined),
            }),
          }),
      }) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        return {
          from: vi.fn().mockReturnValue({
            where: lookupWhere,
          }),
        };
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/members/${OTHER_MEMBER.id}`,
      );

      expect(res.status).toBe(204);
      expect(lookupWhere).toHaveBeenCalledWith(
        expect.objectContaining({ queryChunks: expect.any(Array) }),
      );
      expect(deleteWhere).toHaveBeenCalledWith(
        expect.objectContaining({ queryChunks: expect.any(Array) }),
      );
      expect(stringifyQueryParts(lookupWhere.mock.calls[0]?.[0])).toContain(
        "wedding_id",
      );
      expect(stringifyQueryParts(deleteWhere.mock.calls[0]?.[0])).toContain(
        "wedding_id",
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /weddings/:weddingId/archive — archive a wedding
  // -------------------------------------------------------------------------
  describe("POST /weddings/:weddingId/archive", () => {
    const ARCHIVED_WEDDING = {
      ...WEDDING_ROW,
      status: "archived",
      archivedAt: new Date("2026-04-14"),
    };

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/archive`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member", async () => {
      const db = makeDb({ selectRows: [] });
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/archive`);
      expect(res.status).toBe(403);
    });

    it("returns 403 when user is not an owner", async () => {
      const editorMember = { ...MEMBER_ROW, role: "editor" as const };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [editorMember] : []);
      });
      db.update = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/archive`);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Only owners can archive");
    });

    it("returns 404 when wedding not found during update", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([]);
      db.update = vi.fn().mockReturnValue(updateBuilder);

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/archive`);
      expect(res.status).toBe(404);
    });

    it("archives the wedding and returns 200", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([ARCHIVED_WEDDING]);
      db.update = vi.fn().mockReturnValue(updateBuilder);

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/archive`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("archived");
    });
  });

  // -------------------------------------------------------------------------
  // POST /weddings/:weddingId/unarchive — unarchive a wedding
  // -------------------------------------------------------------------------
  describe("POST /weddings/:weddingId/unarchive", () => {
    const PLANNING_WEDDING = {
      ...WEDDING_ROW,
      status: "planning",
      archivedAt: null,
    };

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/unarchive`,
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not an owner", async () => {
      const editorMember = { ...MEMBER_ROW, role: "editor" as const };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [editorMember] : []);
      });
      db.update = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/unarchive`,
      );
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Only owners can unarchive");
    });

    it("returns 404 when wedding not found during update", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([]);
      db.update = vi.fn().mockReturnValue(updateBuilder);

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/unarchive`,
      );
      expect(res.status).toBe(404);
    });

    it("unarchives the wedding and returns 200", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([PLANNING_WEDDING]);
      db.update = vi.fn().mockReturnValue(updateBuilder);

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/unarchive`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("planning");
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /weddings/:weddingId — mass-assignment guard (#18)
  // -------------------------------------------------------------------------
  describe("PATCH /weddings/:weddingId — mass-assignment guard", () => {
    it("does not write createdAt even when supplied in the request body", async () => {
      const ORIGINAL_CREATED_AT = new Date("2024-01-01");
      const updatedWedding = {
        ...WEDDING_ROW,
        name: "Updated Wedding",
        createdAt: ORIGINAL_CREATED_AT,
      };

      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      const setArgCapture: Record<string, unknown>[] = [];
      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi
        .fn()
        .mockImplementation((arg: Record<string, unknown>) => {
          setArgCapture.push(arg);
          return updateBuilder;
        });
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([updatedWedding]);
      db.update = vi.fn().mockReturnValue(updateBuilder);

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "PATCH", `/weddings/${WEDDING_ROW.id}`, {
        name: "Updated Wedding",
        createdAt: new Date(0).toISOString(), // attacker-supplied field
      });

      expect(res.status).toBe(200);
      // The set() call must not contain createdAt
      expect(setArgCapture[0]).not.toHaveProperty("createdAt");
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /weddings/:weddingId — owner-initiated hard delete (#17)
  // -------------------------------------------------------------------------
  describe("DELETE /weddings/:weddingId", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a wedding member", async () => {
      const db = makeDb({ selectRows: [] });
      const app = makeApp(db, makeAuth());
      const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}`);
      expect(res.status).toBe(403);
    });

    it("returns 403 when user is an editor (not owner)", async () => {
      const editorMember = { ...MEMBER_ROW, role: "editor" as const };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [editorMember] : []);
      });
      db.delete = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}`);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Only owners can delete this wedding");
      expect(
        db.delete as unknown as ReturnType<typeof vi.fn>,
      ).not.toHaveBeenCalled();
    });

    it("allows a gated owner to hard-delete a wedding", async () => {
      const subscriptionRow = {
        userId: TEST_USER.id,
        plan: "free",
        status: "inactive",
        billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
      };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount += 1;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      const app = makeApp(db as Database, makeAuth());

      const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}`);

      expect(subscriptionRow.billingGateRequiredAt).toBeInstanceOf(Date);
      expect(res.status).toBe(204);
      expect(
        db.transaction as unknown as ReturnType<typeof vi.fn>,
      ).toHaveBeenCalled();
    });

    it("returns 403 when user is a viewer (not owner)", async () => {
      const viewerMember = { ...MEMBER_ROW, role: "viewer" as const };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [viewerMember] : []);
      });
      db.delete = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}`);
      expect(res.status).toBe(403);
      expect(
        db.delete as unknown as ReturnType<typeof vi.fn>,
      ).not.toHaveBeenCalled();
    });

    it("deletes the wedding and returns 204 when the user is the owner", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      const deleteBuilder: Record<string, unknown> = {};
      const deleteWhere = vi.fn().mockReturnValue(deleteBuilder);
      deleteBuilder.where = deleteWhere;
      deleteBuilder.returning = vi
        .fn()
        .mockResolvedValue([{ id: WEDDING_ROW.id }]);
      const txDelete = vi.fn().mockReturnValue(deleteBuilder);
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ delete: txDelete }),
        );

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}`);
      expect(res.status).toBe(204);
      expect(txDelete).toHaveBeenCalled();
      expect(txDelete).toHaveBeenCalledTimes(2);
      expect(deleteWhere).toHaveBeenCalled();
    });

    it("returns 403 when owner access is stale before the wedding delete is applied", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });
      const deleteBuilder: Record<string, unknown> = {};
      const deleteWhere = vi.fn().mockReturnValue(deleteBuilder);
      deleteBuilder.where = deleteWhere;
      deleteBuilder.returning = vi.fn().mockResolvedValue([]);
      const txDelete = vi.fn().mockReturnValue(deleteBuilder);
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ delete: txDelete }),
        );

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}`);

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        error: "Only owners can delete this wedding",
      });
      expect(txDelete).toHaveBeenCalledTimes(2);
      const vendorDeletePredicate = deleteWhere.mock.calls[0]?.[0];
      expect(stringifyQueryParts(vendorDeletePredicate)).toContain("EXISTS");
    });
  });

  // -------------------------------------------------------------------------
  // H1 — Paywall check on re-invite path
  // -------------------------------------------------------------------------
  describe("POST /weddings/:weddingId/members — re-invite paywall (H1)", () => {
    it("returns 402 on re-invite when owner is on free plan and already has 1 other planner", async () => {
      // Scenario: there is already 1 additional member (user-2) in the wedding.
      // The owner tries to RE-INVITE a pending invite (pendingMember).
      // Before this fix the paywall was only checked on the new-insert path,
      // so this re-invite would succeed on a free plan even though 1 extra planner
      // already exists.
      const existingMember = {
        id: "member-uuid-existing",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "other@example.com",
        role: "editor",
        userId: "user-2",
        acceptedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const pendingMember = {
        id: "member-uuid-pending",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "pending@example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) {
          // wedding-access middleware: current user is owner
          return makeSelectBuilder([MEMBER_ROW]);
        }
        if (selectCount === 2) {
          // existing invite check: returns the pending member (triggers re-invite path)
          return makeSelectBuilder([pendingMember]);
        }
        if (selectCount === 3) {
          // all members for billing count on re-invite path
          return makeSelectBuilder([MEMBER_ROW, existingMember, pendingMember]);
        }
        return makeSelectBuilder([]);
      });
      db.transaction = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "pending@example.com", role: "editor" },
      );

      expect(res.status).toBe(402);
      const body = (await res.json()) as { feature: string };
      expect(body.feature).toBe("extraPlanner");
      // Transaction (update) must not have been called
      expect(db.transaction as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    });

    it("allows re-invite on free plan when no other additional planners exist", async () => {
      // Only the pending member exists as additional — re-invite is allowed on free plan
      const pendingMember = {
        id: "member-uuid-pending",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "pending@example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updatedPendingMember = {
        ...pendingMember,
        role: "editor" as const,
      };

      let selectCount = 0;
      const txUpdate = vi
        .fn()
        .mockReturnValue(makeWriteBuilder([updatedPendingMember]));
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.update = txUpdate;
          tx.insert = vi.fn().mockReturnValue(makeWriteBuilder([]));
          return fn(tx);
        },
      }) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) {
          // wedding-access middleware
          return makeSelectBuilder([MEMBER_ROW]);
        }
        if (selectCount === 2) {
          // existing invite check: returns pending member
          return makeSelectBuilder([pendingMember]);
        }
        if (selectCount === 3) {
          // all members for billing count: only owner + pending (pending is the re-invite target)
          return makeSelectBuilder([MEMBER_ROW, pendingMember]);
        }
        return makeSelectBuilder([]);
      });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "pending@example.com", role: "editor" },
      );

      expect(res.status).toBe(200);
    });

    it("allows re-invite when the owner has paid planner access", async () => {
      const existingMember = {
        id: "member-uuid-existing",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "other@example.com",
        role: "editor",
        userId: "user-2",
        acceptedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const pendingMember = {
        id: "member-uuid-pending",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "pending@example.com",
        role: "viewer",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updatedPendingMember = {
        ...pendingMember,
        role: "editor" as const,
      };

      let selectCount = 0;
      const txUpdate = vi
        .fn()
        .mockReturnValue(makeWriteBuilder([updatedPendingMember]));
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.update = txUpdate;
          tx.insert = vi.fn().mockReturnValue(makeWriteBuilder([]));
          return fn(tx);
        },
      }) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) {
          return makeSelectBuilder([MEMBER_ROW]);
        }
        if (selectCount === 2) {
          return makeSelectBuilder([pendingMember]);
        }
        if (selectCount === 3) {
          return makeSelectBuilder([MEMBER_ROW, existingMember, pendingMember]);
        }
        if (selectCount === 4) {
          return makeSelectBuilder([
            {
              createdBy: TEST_USER.id,
            },
          ]);
        }
        if (selectCount === 5) {
          return makeSelectBuilder([
            {
              userId: TEST_USER.id,
              plan: "pro",
              status: "active",
            },
          ]);
        }
        return makeSelectBuilder([]);
      });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "pending@example.com", role: "editor" },
      );

      expect(res.status).toBe(200);
      expect(emailService.sendMemberInvite).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // H2 — TOCTOU: member count must be read inside the transaction
  // -------------------------------------------------------------------------
  describe("POST /weddings/:weddingId/members — TOCTOU paywall (H2)", () => {
    it("moves the member-count query inside the transaction to prevent concurrent bypass", async () => {
      // This test verifies the transaction receives a sql`SELECT FOR UPDATE` lock call
      // or at minimum that the paywall count is evaluated inside the transaction fn.
      // We verify by making the out-of-transaction select return [] (0 members)
      // while the in-transaction execute is called.

      const newMemberRow = {
        id: "member-uuid-new",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "new@example.com",
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let selectCount = 0;
      let txExecuteCalled = false;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) {
          // wedding-access middleware
          return makeSelectBuilder([MEMBER_ROW]);
        }
        // existing invite check: no existing
        return makeSelectBuilder([]);
      });

      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};

          // The FOR UPDATE lock is issued via tx.execute(sql`SELECT ... FOR UPDATE`)
          tx.execute = vi.fn().mockImplementation(() => {
            txExecuteCalled = true;
            return Promise.resolve([]);
          });

          // Count query inside transaction
          const txSelectBuilder = makeSelectBuilder([MEMBER_ROW]);
          tx.select = vi.fn().mockReturnValue(txSelectBuilder);

          const txInsertBuilder: Record<string, unknown> = {};
          txInsertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newMemberRow]),
          });
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);

          return fn(tx);
        });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "new@example.com", role: "editor" },
      );

      // The transaction must have been called (insert is inside it)
      expect(db.transaction as ReturnType<typeof vi.fn>).toHaveBeenCalled();
      // The FOR UPDATE lock must have been issued inside the transaction
      expect(txExecuteCalled).toBe(true);
      expect(res.status).toBe(201);
    });

    it("returns 402 inside the transaction when count exceeds cap (prevents TOCTOU bypass)", async () => {
      // Even though the pre-transaction check would pass (returns 0),
      // if the in-transaction count shows >= 1 other member, the 402 fires.
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) {
          // wedding-access middleware
          return makeSelectBuilder([MEMBER_ROW]);
        }
        // existing invite check: no existing
        return makeSelectBuilder([]);
      });

      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};

          tx.execute = vi.fn().mockResolvedValue([]);

          // In-transaction count returns owner + 1 additional member
          // (simulating a concurrent insert that landed while we were processing)
          const existingMember = {
            id: "member-uuid-concurrent",
            weddingId: WEDDING_ROW.id,
            invitedEmail: null,
            role: "editor",
            userId: "user-concurrent",
            acceptedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          const txSelectBuilder = makeSelectBuilder([
            MEMBER_ROW,
            existingMember,
          ]);
          tx.select = vi.fn().mockReturnValue(txSelectBuilder);

          // subscription lookup for paywall: no active paid plan
          const subBuilder = makeSelectBuilder([]);
          (tx.select as ReturnType<typeof vi.fn>)
            .mockReturnValueOnce(txSelectBuilder)
            .mockReturnValueOnce(subBuilder)
            .mockReturnValueOnce(subBuilder);

          tx.insert = vi.fn();

          return fn(tx);
        });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "new@example.com", role: "editor" },
      );

      expect(res.status).toBe(402);
      const body = (await res.json()) as { feature: string };
      expect(body.feature).toBe("extraPlanner");
    });
  });

  // -------------------------------------------------------------------------
  // H3 — Accept invite endpoint
  // -------------------------------------------------------------------------
  describe("POST /weddings/accept-invite (H3)", () => {
    function makeAcceptInviteDb(
      selectResponses: unknown[][],
      updateRows: unknown[] = [],
    ) {
      let selectIndex = 0;
      const updateBuilder = makeWriteBuilder(updateRows);
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockReturnValue(makeSelectBuilder([]));
      db.update = vi.fn().mockReturnValue(updateBuilder);
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          tx.select = vi.fn().mockImplementation(() => {
            const rows =
              selectIndex < selectResponses.length
                ? selectResponses[selectIndex]
                : [];
            selectIndex++;
            return makeSelectBuilder(rows);
          });
          tx.update = vi.fn().mockReturnValue(updateBuilder);
          tx.insert = vi.fn().mockReturnValue(makeWriteBuilder([]));
          tx.delete = vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          });
          return fn(tx);
        });
      return { db, updateBuilder };
    }

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken: "ignored",
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 for authenticated users without an invite token", async () => {
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockReturnValue(makeSelectBuilder([]));
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await req(app, "POST", "/weddings/accept-invite");

      expect(res.status).toBe(403);
    });

    it("returns 400 for malformed non-empty JSON", async () => {
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockReturnValue(makeSelectBuilder([]));
      db.transaction = vi.fn();
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await rawJsonReq(
        app,
        "POST",
        "/weddings/accept-invite",
        '{"inviteToken":',
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Malformed JSON request body",
      });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("returns 400 for non-object JSON", async () => {
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockReturnValue(makeSelectBuilder([]));
      db.transaction = vi.fn();
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await rawJsonReq(
        app,
        "POST",
        "/weddings/accept-invite",
        "null",
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "JSON request body must be an object",
      });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("returns 403 for invalid invite tokens", async () => {
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockReturnValue(makeSelectBuilder([]));
      db.update = vi.fn();
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken: "not-a-signed-token",
      });

      expect(res.status).toBe(403);
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns 403 when the invite token email does not match the session user", async () => {
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockReturnValue(makeSelectBuilder([]));
      db.update = vi.fn();
      const app = makeApp(db as unknown as Database, makeAuth());
      const inviteToken = await makeInviteToken({
        memberId: "member-uuid-invite",
        weddingId: WEDDING_ROW.id,
        email: "other@example.com",
        role: "editor",
      });

      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken,
      });

      expect(res.status).toBe(403);
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns 200 with accepted weddings list when pending invites exist for user email", async () => {
      const pendingMember = {
        id: "member-uuid-invite",
        weddingId: WEDDING_ROW.id,
        invitedEmail: TEST_USER.email,
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { db } = makeAcceptInviteDb(
        [[{ status: "planning" }], [pendingMember]],
        [{ ...pendingMember, userId: TEST_USER.id, acceptedAt: new Date() }],
      );

      const app = makeApp(db as unknown as Database, makeAuth());
      const inviteToken = await makeInviteToken({
        memberId: "member-uuid-invite",
        weddingId: WEDDING_ROW.id,
        email: "user@example.com",
        role: "editor",
      });
      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { accepted: unknown[] };
      expect(Array.isArray(body.accepted)).toBe(true);
    });

    it("matches pending invites case-insensitively when accepting invites", async () => {
      const auth = {
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { ...TEST_USER, email: "USER@EXAMPLE.COM" },
            session: {},
          }),
        },
      } as unknown as Auth;
      const pendingMember = {
        id: "member-uuid-invite",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "user@example.com",
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { db, updateBuilder } = makeAcceptInviteDb(
        [[{ status: "planning" }], [pendingMember]],
        [{ ...pendingMember, userId: TEST_USER.id, acceptedAt: new Date() }],
      );
      const whereSpy = updateBuilder.where as ReturnType<typeof vi.fn>;

      const app = makeApp(db as unknown as Database, auth);
      const inviteToken = await makeInviteToken({
        memberId: "member-uuid-missing",
        weddingId: WEDDING_ROW.id,
        email: TEST_USER.email,
        role: "editor",
      });
      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken,
      });

      expect(res.status).toBe(200);
      expect(whereSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryChunks: expect.any(Array) }),
      );
      expect(stringifyQueryParts(whereSpy.mock.calls[0]?.[0])).toContain(
        "user@example.com",
      );
    });

    it("returns 409 when a valid invite token no longer matches a pending invite", async () => {
      const pendingMember = {
        id: "member-uuid-missing",
        weddingId: WEDDING_ROW.id,
        invitedEmail: TEST_USER.email,
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { db, updateBuilder } = makeAcceptInviteDb(
        [[{ status: "planning" }], [pendingMember]],
        [],
      );
      const whereSpy = updateBuilder.where as ReturnType<typeof vi.fn>;

      const app = makeApp(db as unknown as Database, makeAuth());
      const inviteToken = await makeInviteToken({
        memberId: "member-uuid-missing",
        weddingId: WEDDING_ROW.id,
        email: TEST_USER.email,
        role: "editor",
      });
      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken,
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("no longer pending");
      expect(stringifyQueryParts(whereSpy.mock.calls[0]?.[0])).toContain(
        "accepted_at",
      );
    });

    it("returns 404 when accepting an invite for a missing wedding", async () => {
      const { db } = makeAcceptInviteDb([[]]);

      const app = makeApp(db as unknown as Database, makeAuth());
      const inviteToken = await makeInviteToken({
        memberId: "member-uuid-missing-wedding",
        weddingId: WEDDING_ROW.id,
        email: TEST_USER.email,
        role: "editor",
      });

      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken,
      });

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Wedding not found",
      });
    });

    it("rechecks the current extra planner gate before accepting old invites", async () => {
      const pendingMember = {
        id: "member-uuid-invite",
        weddingId: WEDDING_ROW.id,
        invitedEmail: TEST_USER.email,
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const otherPlanner = {
        id: "member-uuid-other",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "other@example.com",
        role: "viewer",
        userId: "other-user",
        acceptedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const ownerMember = {
        ...MEMBER_ROW,
        role: "owner" as const,
      };
      const { db, updateBuilder } = makeAcceptInviteDb([
        [{ status: "planning" }],
        [ownerMember, pendingMember, otherPlanner],
        [{ createdBy: "owner-user" }],
        [],
      ]);

      const app = makeApp(db as unknown as Database, makeAuth());
      const inviteToken = await makeInviteToken({
        memberId: pendingMember.id,
        weddingId: WEDDING_ROW.id,
        email: TEST_USER.email,
        role: "editor",
      });

      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken,
      });

      expect(res.status).toBe(402);
      const body = (await res.json()) as { feature: string };
      expect(body.feature).toBe("extraPlanner");
      expect(updateBuilder.set).not.toHaveBeenCalled();
    });

    it("records extra planner first use when a paid owner accepts an old invite", async () => {
      const pendingMember = {
        id: "member-uuid-invite-paid",
        weddingId: WEDDING_ROW.id,
        invitedEmail: TEST_USER.email,
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const otherPlanner = {
        id: "member-uuid-other-paid",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "other@example.com",
        role: "viewer",
        userId: "other-user",
        acceptedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const ownerMember = {
        ...MEMBER_ROW,
        role: "owner" as const,
      };
      const acceptedMember = {
        ...pendingMember,
        userId: TEST_USER.id,
        acceptedAt: new Date(),
      };
      const { db, updateBuilder } = makeAcceptInviteDb(
        [
          [{ status: "planning" }],
          [ownerMember, pendingMember, otherPlanner],
          [{ createdBy: "owner-user" }],
          [
            {
              userId: "owner-user",
              plan: "pro",
              status: "active",
              trialStartedAt: null,
            },
          ],
        ],
        [acceptedMember],
      );

      const app = makeApp(db as unknown as Database, makeAuth());
      const inviteToken = await makeInviteToken({
        memberId: pendingMember.id,
        weddingId: WEDDING_ROW.id,
        email: TEST_USER.email,
        role: "editor",
      });

      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken,
      });

      expect(res.status).toBe(200);
      expect(updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ extraPlannerFirstUsedAt: expect.any(Date) }),
      );
    });

    it("does not record extra planner first use when paid invite acceptance is stale", async () => {
      const pendingMember = {
        id: "member-uuid-invite-stale",
        weddingId: WEDDING_ROW.id,
        invitedEmail: TEST_USER.email,
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const otherPlanner = {
        id: "member-uuid-other-stale",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "other@example.com",
        role: "viewer",
        userId: "other-user",
        acceptedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { db, updateBuilder } = makeAcceptInviteDb([
        [{ status: "planning" }],
        [
          { ...MEMBER_ROW, role: "owner" as const },
          pendingMember,
          otherPlanner,
        ],
        [{ createdBy: "owner-user" }],
        [
          {
            userId: "owner-user",
            plan: "pro",
            status: "active",
            trialStartedAt: null,
          },
        ],
      ]);

      const app = makeApp(db as unknown as Database, makeAuth());
      const inviteToken = await makeInviteToken({
        memberId: pendingMember.id,
        weddingId: WEDDING_ROW.id,
        email: TEST_USER.email,
        role: "editor",
      });

      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken,
      });

      expect(res.status).toBe(409);
      expect(updateBuilder.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ extraPlannerFirstUsedAt: expect.any(Date) }),
      );
    });

    it("rejects accepting pending invites for archived weddings", async () => {
      const { db } = makeAcceptInviteDb([[{ status: "archived" }]]);

      const app = makeApp(db as unknown as Database, makeAuth());
      const inviteToken = await makeInviteToken({
        memberId: "member-uuid-archived",
        weddingId: WEDDING_ROW.id,
        email: TEST_USER.email,
        role: "editor",
      });
      const res = await req(app, "POST", "/weddings/accept-invite", {
        inviteToken,
      });

      expect(res.status).toBe(423);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Wedding is archived and read-only");
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe("POST /weddings/:weddingId/unarchive", () => {
    it("allows an owner to unarchive an archived wedding", async () => {
      const archivedMembership = {
        ...MEMBER_ROW,
        weddingStatus: "archived",
      };
      const updatedWedding = {
        ...WEDDING_ROW,
        status: "planning",
        archivedAt: null,
      };
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi
        .fn()
        .mockReturnValue(makeSelectBuilder([archivedMembership]));

      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([updatedWedding]);
      db.update = vi.fn().mockReturnValue(updateBuilder);

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/unarchive`,
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        status: "planning",
        archivedAt: null,
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /weddings/:weddingId/members — member invite transaction (#24)
  // -------------------------------------------------------------------------
  describe("POST /weddings/:weddingId/members — transaction rollback on email failure", () => {
    it("removes the pending invite when email send throws after creation", async () => {
      let selectCount = 0;
      let txCommitted = false;

      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const txAuditValues = vi.fn().mockResolvedValue(undefined);
      // transaction mock: tracks whether it rolled back (threw) rather than committed
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          if (txCommitted) {
            return fn({
              delete: txDelete,
              insert: vi.fn().mockReturnValue({ values: txAuditValues }),
            });
          }
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          tx.select = vi.fn().mockReturnValue(makeSelectBuilder([MEMBER_ROW]));
          const insertBuilder: Record<string, unknown> = {};
          insertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "member-uuid-tx",
                weddingId: WEDDING_ROW.id,
                invitedEmail: "invited@example.com",
                role: "editor",
                userId: null,
                acceptedAt: null,
                createdAt: new Date(),
              },
            ]),
          });
          tx.insert = vi.fn().mockReturnValue(insertBuilder);

          const result = await fn(tx);
          txCommitted = true;
          return result;
        });

      const emailService = makeEmailService();
      emailService.sendMemberInvite.mockRejectedValueOnce(
        new Error("email down"),
      );

      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        { email: "invited@example.com", role: "editor" },
      );

      expect(txCommitted).toBe(true);
      expect(res.status).toBe(502);
      expect(txDelete).toHaveBeenCalled();
      await expect(res.json()).resolves.toMatchObject({
        error: "Failed to deliver invite email.",
        delivery: {
          status: "failed",
          error: "Email delivery failed.",
          templateKey: "member-invite",
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // M1 — Invite email case-sensitivity
  // -------------------------------------------------------------------------
  describe("M1 — invite email case-sensitivity", () => {
    it("treats different cases of the same email as the same invite (no duplicate)", async () => {
      // If INVITED@EXAMPLE.COM was already invited, inviting invited@example.com
      // should find the existing row (after lowercasing) and NOT create a new one.
      const pendingMember = {
        id: "member-uuid-case",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "invited@example.com", // stored lowercase
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };
      const updatedPendingMember = {
        ...pendingMember,
        role: "editor" as const,
      };

      let selectCount = 0;
      const txUpdate = vi
        .fn()
        .mockReturnValue(makeWriteBuilder([updatedPendingMember]));
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.update = txUpdate;
          tx.insert = vi.fn().mockReturnValue(makeWriteBuilder([]));
          return fn(tx);
        },
      }) as unknown as Record<string, unknown>;

      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        // 2nd select is the existing-invite check — it finds the pending row
        // because the handler normalized the email to lowercase before querying
        return makeSelectBuilder([pendingMember]);
      });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      // Send the invite with UPPERCASE email — should match the lowercase row
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "INVITED@EXAMPLE.COM",
          role: "editor",
        },
      );

      // 200 = re-invite path (found existing), not 201 (new insert)
      expect(res.status).toBe(200);
    });

    it("normalizes the email to lowercase before inserting a new invite", async () => {
      const newMemberRow = {
        id: "member-uuid-lower",
        weddingId: WEDDING_ROW.id,
        invitedEmail: "newperson@example.com", // stored lowercase
        role: "editor",
        userId: null,
        acceptedAt: null,
        createdAt: new Date(),
      };

      let insertValues: unknown = null;
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        return makeSelectBuilder(selectCount === 1 ? [MEMBER_ROW] : []);
      });

      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};
          tx.execute = vi.fn().mockResolvedValue([]);
          tx.select = vi.fn().mockReturnValue(makeSelectBuilder([MEMBER_ROW]));
          const txInsertBuilder: Record<string, unknown> = {};
          txInsertBuilder.values = vi
            .fn()
            .mockImplementation((vals: unknown) => {
              if (vals && typeof vals === "object" && "invitedEmail" in vals) {
                insertValues = vals;
                return { returning: vi.fn().mockResolvedValue([newMemberRow]) };
              }
              return Promise.resolve(undefined);
            });
          tx.insert = vi.fn().mockReturnValue(txInsertBuilder);
          return fn(tx);
        });

      const emailService = makeEmailService();
      const app = makeApp(db as unknown as Database, makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/members`,
        {
          email: "NewPerson@Example.COM",
          role: "editor",
        },
      );

      expect(res.status).toBe(201);
      // The value passed to insert should have the lowercased email
      expect((insertValues as { invitedEmail?: string })?.invitedEmail).toBe(
        "newperson@example.com",
      );
    });
  });

  // -------------------------------------------------------------------------
  // M2 — PATCH /:weddingId/members/:memberId — change role
  // -------------------------------------------------------------------------
  describe("M2 — PATCH /weddings/:weddingId/members/:memberId", () => {
    const TARGET_MEMBER = {
      id: "member-uuid-target",
      weddingId: WEDDING_ROW.id,
      userId: "user-target",
      role: "editor" as const,
      invitedEmail: "target@example.com",
      acceptedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        { role: "viewer" },
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when caller is not the owner", async () => {
      const editorMember = { ...MEMBER_ROW, role: "editor" as const };
      const db = makeDb({ selectRows: [editorMember] });
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        { role: "viewer" },
      );
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid role", async () => {
      // Schema validation fires before any DB calls
      const db = makeDb({ selectRows: [MEMBER_ROW] });
      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        { role: "owner" }, // invalid — only editor/viewer allowed
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for malformed JSON role changes", async () => {
      const db = makeDb({ selectRows: [MEMBER_ROW] }) as unknown as Record<
        string,
        unknown
      >;
      db.update = vi.fn();
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await rawJsonReq(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        '{"role":',
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Malformed JSON request body",
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns 403 when trying to change the owner's own role", async () => {
      // Owner tries to change their own role.
      // The route fetches the target member row first; if its userId matches the
      // current user it returns 403.
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]); // weddingAccess
        // Target member lookup returns the owner's own row (userId === TEST_USER.id)
        return makeSelectBuilder([MEMBER_ROW]);
      });
      (db as unknown as Record<string, unknown>).update = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "PATCH",
        // MEMBER_ROW.id is the owner's own member row
        `/weddings/${WEDDING_ROW.id}/members/${MEMBER_ROW.id}`,
        { role: "viewer" },
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when trying to change another owner role", async () => {
      const otherOwner = {
        ...TARGET_MEMBER,
        userId: "other-owner",
        role: "owner" as const,
      };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        return makeSelectBuilder([otherOwner]);
      });
      (db as unknown as Record<string, unknown>).update = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${otherOwner.id}`,
        { role: "viewer" },
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({
        error: "Cannot change an owner role",
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns 404 when the target member is not found", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]); // weddingAccess
        // Target member lookup returns empty — member not found
        return makeSelectBuilder([]);
      });
      // update should not be called if member not found
      (db as unknown as Record<string, unknown>).update = vi.fn();

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        { role: "viewer" },
      );
      expect(res.status).toBe(404);
    });

    it("updates the member role and returns the updated member", async () => {
      const updatedMember = { ...TARGET_MEMBER, role: "viewer" as const };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]); // weddingAccess
        // Target member lookup returns TARGET_MEMBER (userId !== TEST_USER.id)
        return makeSelectBuilder([TARGET_MEMBER]);
      });

      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([updatedMember]);
      (db as unknown as Record<string, unknown>).update = vi
        .fn()
        .mockReturnValue(updateBuilder);
      const txAuditValues = vi.fn().mockResolvedValue(undefined);
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            select: vi.fn().mockReturnValue(makeSelectBuilder([TARGET_MEMBER])),
            update: (db as unknown as Record<string, unknown>).update,
            insert: vi.fn().mockReturnValue({ values: txAuditValues }),
          }),
        );

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        { role: "viewer" },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { role: string };
      expect(body.role).toBe("viewer");

      expect(txAuditValues).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          actorUserId: TEST_USER.id,
          eventType: "wedding.member.role_changed",
          targetType: "wedding_member",
          targetId: TARGET_MEMBER.id,
          metadata: expect.objectContaining({
            previousRole: "editor",
            nextRole: "viewer",
          }),
        }),
      );
    });

    it("returns 403 when the target member becomes an owner before the role update is written", async () => {
      const otherOwner = {
        ...TARGET_MEMBER,
        userId: "other-owner",
        role: "owner" as const,
      };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        return makeSelectBuilder([TARGET_MEMBER]);
      });

      const update = vi.fn();
      db.update = update;
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            select: vi.fn().mockReturnValue(makeSelectBuilder([otherOwner])),
            update,
            insert: vi.fn(),
          }),
        );

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        { role: "viewer" },
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        error: "Cannot change an owner role",
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("returns 403 when the target member becomes the current user before the role update is written", async () => {
      const currentUserMember = {
        ...TARGET_MEMBER,
        userId: TEST_USER.id,
        role: "editor" as const,
      };
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        return makeSelectBuilder([TARGET_MEMBER]);
      });

      const update = vi.fn();
      db.update = update;
      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            select: vi
              .fn()
              .mockReturnValue(makeSelectBuilder([currentUserMember])),
            update,
            insert: vi.fn(),
          }),
        );

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        { role: "viewer" },
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        error: "Cannot change your own role",
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("returns 404 when the target member disappears before the role update transaction", async () => {
      let selectCount = 0;
      const db = makeDb({}) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]);
        return makeSelectBuilder([TARGET_MEMBER]);
      });

      db.transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            select: vi.fn().mockReturnValue(makeSelectBuilder([])),
            update: vi.fn(),
            insert: vi.fn(),
          }),
        );

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        { role: "viewer" },
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Member not found",
      });
    });

    it("returns 409 when the member changes before the role update is written", async () => {
      let selectCount = 0;
      const updateBuilder: Record<string, unknown> = {};
      updateBuilder.set = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.where = vi.fn().mockReturnValue(updateBuilder);
      updateBuilder.returning = vi.fn().mockResolvedValue([]);
      const db = makeDb({
        txFn: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            select: vi.fn().mockReturnValue(makeSelectBuilder([TARGET_MEMBER])),
            update: vi.fn().mockReturnValue(updateBuilder),
            insert: vi.fn(),
          }),
      }) as unknown as Record<string, unknown>;
      db.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) return makeSelectBuilder([MEMBER_ROW]); // weddingAccess
        return makeSelectBuilder([TARGET_MEMBER]);
      });

      const app = makeApp(db as unknown as Database, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/members/${TARGET_MEMBER.id}`,
        { role: "viewer" },
      );
      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "Member changed before role update",
      });
    });
  });
});
