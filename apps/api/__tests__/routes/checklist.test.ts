import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import {
  checklistRoutes,
  bucketOrderSql,
  assertAllBucketNames,
} from "../../src/routes/checklist";
import { MILESTONE_BUCKETS } from "@kaiplan/shared";
import type { Database } from "../../src/db/client";
import type { Auth } from "../../src/auth";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  emailVerified: true,
};

const WEDDING_ID = "00000000-0000-4000-8000-000000000101";

const MEMBER_ROW = {
  id: "member-uuid-1",
  weddingId: WEDDING_ID,
  userId: TEST_USER.id,
  role: "owner" as const,
  invitedEmail: null,
  acceptedAt: new Date("2024-01-01"),
  createdAt: new Date("2024-01-01"),
};

const VIEWER_MEMBER = { ...MEMBER_ROW, role: "viewer" as const };

const TASK_ROW = {
  id: "task-uuid-1",
  weddingId: WEDDING_ID,
  bucket: "3_to_6mo",
  title: "Book venue",
  notes: null,
  dueOffsetDays: null,
  completedAt: null,
  sortOrder: 0,
  createdBy: TEST_USER.id,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const COMPLETED_TASK_ROW = {
  ...TASK_ROW,
  id: "task-uuid-2",
  completedAt: new Date("2024-06-01"),
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: TEST_USER, session: {} }),
    },
  } as unknown as Auth;
}

function makeUnauthAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  } as unknown as Auth;
}

function makeSelectBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};

  builder.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolveWith).then(onFulfilled, onRejected);

  builder.select = vi.fn().mockReturnValue(builder);
  builder.from = vi.fn().mockReturnValue(builder);
  builder.innerJoin = vi.fn().mockReturnValue(builder);
  builder.leftJoin = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.groupBy = vi.fn().mockReturnValue(builder);
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue({
    then: (fn: (rows: unknown) => unknown) => Promise.resolve(fn(resolveWith)),
  });

  return builder;
}

function makeWriteBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.into = vi.fn().mockReturnValue(builder);
  // values must return builder (chained with .returning()) AND be awaitable (for seed insert)
  builder.values = vi.fn().mockReturnValue({
    ...builder,
    returning: vi.fn().mockResolvedValue(resolveWith),
    then: (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(undefined).then(onFulfilled, onRejected),
  });
  builder.returning = vi.fn().mockResolvedValue(resolveWith);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  return builder;
}

function makeDb(
  selectResponses: unknown[][] = [[]],
  writeResult: unknown[] = [],
): Database {
  let selectIndex = 0;
  const insertBuilder = makeWriteBuilder(writeResult);
  const updateBuilder = makeWriteBuilder(writeResult);

  const deleteBuilder: Record<string, unknown> = {};
  deleteBuilder.where = vi.fn().mockReturnValue(deleteBuilder);
  deleteBuilder.returning = vi.fn().mockResolvedValue(writeResult);
  deleteBuilder.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(undefined).then(onFulfilled, onRejected);

  const db: Record<string, unknown> = {};

  db.select = vi.fn().mockImplementation(() => {
    const rows =
      selectIndex < selectResponses.length ? selectResponses[selectIndex] : [];
    selectIndex++;
    return makeSelectBuilder(rows);
  });

  db.insert = vi.fn().mockReturnValue(insertBuilder);
  db.update = vi.fn().mockReturnValue(updateBuilder);
  db.execute = vi.fn().mockResolvedValue([]);
  db.delete = vi.fn().mockReturnValue(deleteBuilder);
  db.transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) =>
      fn(db),
    );

  return db as unknown as Database;
}

function makeApp(db: Database, auth: Auth) {
  const routes = checklistRoutes(db, auth);
  const app = new Hono();
  app.route("/weddings", routes);
  return app;
}

async function req(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function rawJsonReq(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  body: string,
) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checklistRoutes", () => {
  it("returns 400 for malformed checklist JSON", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "POST",
      `/weddings/${WEDDING_ID}/checklist`,
      "{",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
  });

  // =========================================================================
  // GET /
  // =========================================================================

  describe("GET /:weddingId/checklist", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/checklist`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a wedding member", async () => {
      const db = makeDb([[]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/checklist`);
      expect(res.status).toBe(403);
    });

    it("returns tasks with totalCount and completedCount", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [TASK_ROW, COMPLETED_TASK_ROW], // GET handler
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/checklist`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        tasks: (typeof TASK_ROW)[];
        totalCount: number;
        completedCount: number;
      };
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(body.tasks).toHaveLength(2);
      expect(body.totalCount).toBe(2);
      expect(body.completedCount).toBe(1);
    });

    it("returns empty list and zero counts when no tasks", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // GET handler
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/checklist`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        tasks: unknown[];
        totalCount: number;
        completedCount: number;
      };
      expect(body.tasks).toHaveLength(0);
      expect(body.totalCount).toBe(0);
      expect(body.completedCount).toBe(0);
    });
  });

  // =========================================================================
  // POST /
  // =========================================================================

  describe("POST /:weddingId/checklist", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/checklist`, {
        title: "Book photographer",
        bucket: "6_to_9mo",
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 when viewer tries to create", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/checklist`, {
        title: "Book photographer",
        bucket: "6_to_9mo",
      });
      expect(res.status).toBe(403);
    });

    it("creates a task and returns 201", async () => {
      const db = makeDb([[MEMBER_ROW]], [TASK_ROW]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/checklist`, {
        title: "Book venue",
        bucket: "3_to_6mo",
      });
      expect(res.status).toBe(201);

      const body = (await res.json()) as typeof TASK_ROW;
      expect(body.id).toBe(TASK_ROW.id);
    });

    it("returns 400 for invalid body (empty title)", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/checklist`, {
        title: "",
        bucket: "3_to_6mo",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing bucket", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/checklist`, {
        title: "Book venue",
      });
      expect(res.status).toBe(400);
    });

    it("creates task with optional notes and dueOffsetDays", async () => {
      const taskWithNotes = {
        ...TASK_ROW,
        notes: "Get referrals first",
        dueOffsetDays: -270,
        sortOrder: 5,
      };
      const db = makeDb([[MEMBER_ROW]], [taskWithNotes]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/checklist`, {
        title: "Book venue",
        bucket: "3_to_6mo",
        notes: "Get referrals first",
        dueOffsetDays: -270,
        sortOrder: 5,
      });
      expect(res.status).toBe(201);
    });
  });

  // =========================================================================
  // PATCH /:taskId
  // =========================================================================

  describe("PATCH /:weddingId/checklist/:taskId", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/checklist/task-1`,
        { title: "Updated" },
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when viewer tries to update", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/checklist/task-1`,
        { title: "Updated" },
      );
      expect(res.status).toBe(403);
    });

    it("returns 404 when task not found", async () => {
      const db = makeDb([[MEMBER_ROW]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/checklist/nonexistent`,
        { title: "Updated" },
      );
      expect(res.status).toBe(404);
    });

    it("updates and returns the task", async () => {
      const updatedTask = { ...TASK_ROW, title: "Updated venue booking" };
      const db = makeDb([[MEMBER_ROW]], [updatedTask]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/checklist/${TASK_ROW.id}`,
        { title: "Updated venue booking" },
      );
      expect(res.status).toBe(200);

      const body = (await res.json()) as typeof TASK_ROW;
      expect(body.title).toBe("Updated venue booking");
    });

    it("marks task as completed when completedAt is set", async () => {
      const completedTask = {
        ...TASK_ROW,
        completedAt: new Date("2024-06-01"),
      };
      const db = makeDb([[MEMBER_ROW]], [completedTask]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/checklist/${TASK_ROW.id}`,
        { completedAt: "2024-06-01T10:00:00.000Z" },
      );
      expect(res.status).toBe(200);
    });

    it("unmarks task when completedAt is null", async () => {
      const uncheckedTask = { ...TASK_ROW, completedAt: null };
      const db = makeDb([[MEMBER_ROW]], [uncheckedTask]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/checklist/${TASK_ROW.id}`,
        { completedAt: null },
      );
      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid body (empty title)", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/checklist/task-1`,
        { title: "" },
      );
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // DELETE /:taskId
  // =========================================================================

  describe("DELETE /:weddingId/checklist/:taskId", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ID}/checklist/task-1`,
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when viewer tries to delete", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ID}/checklist/task-1`,
      );
      expect(res.status).toBe(403);
    });

    it("deletes task and returns 204", async () => {
      const db = makeDb([[MEMBER_ROW]], [{ id: TASK_ROW.id }]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ID}/checklist/${TASK_ROW.id}`,
      );
      expect(res.status).toBe(204);
    });

    it("returns 404 when deleting a missing task", async () => {
      const db = makeDb([[MEMBER_ROW]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ID}/checklist/missing-task`,
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: "Task not found" });
    });
  });

  // =========================================================================
  // POST /seed
  // =========================================================================

  describe("POST /:weddingId/checklist/seed", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ID}/checklist/seed`,
      );
      expect(res.status).toBe(401);
    });

    it("seeds tasks on empty wedding and returns 201", async () => {
      // selectResponses: [memberRow for access check, count=0 for seed check]
      const db = makeDb([[MEMBER_ROW], [{ count: "0" }]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ID}/checklist/seed`,
      );
      expect(res.status).toBe(201);

      const body = (await res.json()) as { seeded: boolean; count: number };
      expect(body.seeded).toBe(true);
      expect(body.count).toBeGreaterThan(0);
    });

    it("returns 200 (idempotent) when tasks already exist", async () => {
      const db = makeDb([[MEMBER_ROW], [{ count: "5" }]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ID}/checklist/seed`,
      );
      expect(res.status).toBe(200);

      const body = (await res.json()) as { seeded: boolean; count: number };
      expect(body.seeded).toBe(false);
      expect(body.count).toBe(5);
    });

    it("viewer cannot seed → 403 (requireWriter runs before any DB access)", async () => {
      // requireWriter runs FIRST so viewer is denied before any count query.
      const db = makeDb([[VIEWER_MEMBER]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ID}/checklist/seed`,
      );
      expect(res.status).toBe(403);
    });

    it("viewer always gets 403 — requireWriter runs before count query", async () => {
      // requireWriter now runs BEFORE count query to prevent information
      // disclosure (viewer learning seeded=false status).
      const db = makeDb([[VIEWER_MEMBER], [{ count: "60" }]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ID}/checklist/seed`,
      );
      expect(res.status).toBe(403);
    });

    it("seeds when count query returns empty array (treats as 0)", async () => {
      // When the DB returns no rows from count query inside the transaction
      const db = makeDb([[MEMBER_ROW], []], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ID}/checklist/seed`,
      );
      expect(res.status).toBe(201);

      const body = (await res.json()) as { seeded: boolean; count: number };
      expect(body.seeded).toBe(true);
    });

    it("seed is idempotent under concurrent calls by locking the wedding row", async () => {
      // The transaction locks the wedding row before counting tasks so
      // concurrent seed calls serialize in real Postgres.
      const db = makeDb([[MEMBER_ROW], [{ count: "0" }]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ID}/checklist/seed`,
      );
      expect(res.status).toBe(201);
      expect((db as Record<string, unknown>).transaction).toHaveBeenCalledTimes(
        1,
      );
      expect((db as Record<string, unknown>).execute).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // GET /stats
  // =========================================================================

  describe("GET /:weddingId/checklist/stats", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/checklist/stats`,
      );
      expect(res.status).toBe(401);
    });

    it("returns totalCount and completedCount", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [{ count: "10" }], // total count query
        [{ count: "4" }], // completed count query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/checklist/stats`,
      );
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalCount: number;
        completedCount: number;
      };
      expect(body.totalCount).toBe(10);
      expect(body.completedCount).toBe(4);
    });

    it("returns zeros when count queries return no rows", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // total count query - empty
        [], // completed count query - empty
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/checklist/stats`,
      );
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalCount: number;
        completedCount: number;
      };
      expect(body.totalCount).toBe(0);
      expect(body.completedCount).toBe(0);
    });
  });

  // =========================================================================
  // bucketOrderSql
  // =========================================================================

  describe("bucketOrderSql", () => {
    function extractRawSql(result: ReturnType<typeof bucketOrderSql>): string {
      // sql.raw stores content in queryChunks[0].value[0] (StringChunk internal)
      const chunk = result.queryChunks[0] as { value: string[] };
      return chunk.value[0] ?? "";
    }

    it("starts with CASE bucket, not bare CASE WHEN", () => {
      const rawSql = extractRawSql(bucketOrderSql());
      expect(rawSql).toMatch(/^CASE bucket /i);
    });

    it("includes a WHEN clause for every MILESTONE_BUCKET value", () => {
      const rawSql = extractRawSql(bucketOrderSql());
      for (const bucket of MILESTONE_BUCKETS) {
        expect(rawSql).toContain(`WHEN '${bucket}'`);
      }
    });

    it("does not use searched-CASE form (no bare CASE WHEN at start)", () => {
      const rawSql = extractRawSql(bucketOrderSql());
      // Searched CASE is "CASE WHEN <bool>"; simple CASE is "CASE <col> WHEN <val>"
      expect(rawSql).not.toMatch(/^CASE\s+WHEN/i);
    });
  });

  // =========================================================================
  // assertAllBucketNames
  // =========================================================================

  describe("assertAllBucketNames", () => {
    it("does not throw when all names are valid MILESTONE_BUCKETS", () => {
      expect(() => assertAllBucketNames([...MILESTONE_BUCKETS])).not.toThrow();
    });

    it("does not throw for an empty array", () => {
      expect(() => assertAllBucketNames([])).not.toThrow();
    });

    it("throws when an unknown bucket name is included", () => {
      expect(() => assertAllBucketNames(["unknown_bucket"])).toThrowError(
        /unknown bucket name/i,
      );
    });

    it("throws when a valid name is mixed with an invalid one", () => {
      expect(() =>
        assertAllBucketNames([MILESTONE_BUCKETS[0], "INJECTED'; DROP TABLE"]),
      ).toThrowError(/unknown bucket name/i);
    });

    it("includes the bad name in the error message", () => {
      const badName = "DROP_TABLE";
      expect(() => assertAllBucketNames([badName])).toThrowError(
        new RegExp(badName),
      );
    });
  });
});
