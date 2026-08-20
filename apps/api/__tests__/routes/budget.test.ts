import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import {
  budgetRoutes,
  isBudgetCategoryNameConflictError,
  isCategoryInUseError,
} from "../../src/routes/budget";
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

const WEDDING_ROW = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "My Wedding",
  date: "2025-06-15",
  budgetCents: 500000,
  currency: "USD",
  timezone: "America/New_York",
  createdBy: TEST_USER.id,
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

const VIEWER_MEMBER = { ...MEMBER_ROW, role: "viewer" as const };
const EDITOR_MEMBER = { ...MEMBER_ROW, role: "editor" as const };

const CATEGORY_ROW = {
  id: "cat-uuid-1",
  weddingId: WEDDING_ROW.id,
  name: "Venue",
  estimatedCents: 200000,
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const ITEM_ROW = {
  id: "item-uuid-1",
  categoryId: CATEGORY_ROW.id,
  name: "Ballroom rental",
  estimatedCents: 100000,
  quotedCents: 95000,
  paidCents: 50000,
  notes: "Deposit paid",
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
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
  builder.values = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockResolvedValue(resolveWith);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  return builder;
}

/**
 * Creates a Database mock with sequential select responses.
 * `selectResponses` is an array of arrays — each entry is what the next
 * `select()` call resolves with. This handles the multi-step
 * middleware -> handler pattern.
 */
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
  const selectBuilders: Record<string, unknown>[] = [];

  db.select = vi.fn().mockImplementation(() => {
    const rows =
      selectIndex < selectResponses.length ? selectResponses[selectIndex] : [];
    selectIndex++;
    const builder = makeSelectBuilder(rows);
    selectBuilders.push(builder);
    return builder;
  });

  db.insert = vi.fn().mockReturnValue(insertBuilder);
  db.update = vi.fn().mockReturnValue(updateBuilder);
  db.delete = vi.fn().mockReturnValue(deleteBuilder);
  (db as Record<string, unknown>).__selectBuilders = selectBuilders;

  return db as unknown as Database;
}

function makeApp(db: Database, auth: Auth) {
  const routes = budgetRoutes(db, auth);
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

describe("budgetRoutes", () => {
  // =========================================================================
  // Categories
  // =========================================================================

  it("returns 400 for malformed budget JSON", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/budget/categories`,
      "{",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
  });

  describe("GET /:weddingId/budget/categories", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a wedding member", async () => {
      const db = makeDb([[]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
      );
      expect(res.status).toBe(403);
    });

    it("returns categories with aggregated totals", async () => {
      const categoryWithTotals = {
        id: CATEGORY_ROW.id,
        weddingId: CATEGORY_ROW.weddingId,
        name: "Venue",
        estimatedCents: 200000,
        sortOrder: 0,
        createdAt: CATEGORY_ROW.createdAt,
        updatedAt: CATEGORY_ROW.updatedAt,
        totalItemEstimatedCents: 100000,
        totalQuotedCents: 95000,
        totalPaidCents: 50000,
        itemCount: 1,
      };

      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [categoryWithTotals], // GET categories handler
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
      );
      expect(res.status).toBe(200);

      const body = (await res.json()) as (typeof categoryWithTotals)[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe("Venue");
      expect(body[0].totalItemEstimatedCents).toBe(100000);
    });

    it("requests categories in stable sort order", async () => {
      const db = makeDb([[MEMBER_ROW], [CATEGORY_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
      );

      expect(res.status).toBe(200);
      const builders = (db as Record<string, unknown>).__selectBuilders as
        | Array<Record<string, ReturnType<typeof vi.fn>>>
        | undefined;
      expect(builders?.[1]?.orderBy).toHaveBeenCalledOnce();
    });

    it("returns empty array when no categories", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // GET categories handler
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
      );
      expect(res.status).toBe(200);

      const body = (await res.json()) as unknown[];
      expect(body).toHaveLength(0);
    });
  });

  describe("POST /:weddingId/budget/categories", () => {
    const validCategory = { name: "Catering", estimatedCents: 150000 };

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
        validCategory,
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
        validCategory,
      );
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
        { name: "" },
      );
      expect(res.status).toBe(400);
    });

    it("creates category and returns 201", async () => {
      const newCategory = { ...CATEGORY_ROW, name: "Catering" };
      const db = makeDb([[MEMBER_ROW]], [newCategory]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
        validCategory,
      );
      expect(res.status).toBe(201);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("Catering");
    });

    it("returns 409 when the category name already exists", async () => {
      const db = makeDb([[MEMBER_ROW]]) as unknown as Record<string, unknown>;
      db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({
            code: "23505",
            constraint: "budget_category_wedding_name",
          }),
        }),
      });
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
        validCategory,
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "Budget category name already exists.",
      });
    });

    it("returns 500 when category creation fails for another database reason", async () => {
      const db = makeDb([[MEMBER_ROW]]) as unknown as Record<string, unknown>;
      db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("database down")),
        }),
      });
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
        validCategory,
      );

      expect(res.status).toBe(500);
    });

    it("allows editor to create category", async () => {
      const newCategory = { ...CATEGORY_ROW, name: "Catering" };
      const db = makeDb([[EDITOR_MEMBER]], [newCategory]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/budget/categories`,
        validCategory,
      );
      expect(res.status).toBe(201);
    });
  });

  describe("PATCH /:weddingId/budget/categories/:categoryId", () => {
    const path = `/weddings/${WEDDING_ROW.id}/budget/categories/${CATEGORY_ROW.id}`;

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { name: "Updated" });
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { estimatedCents: -1 });
      expect(res.status).toBe(400);
    });

    it("updates category and returns 200", async () => {
      const updated = { ...CATEGORY_ROW, name: "Updated Venue" };
      const db = makeDb([[MEMBER_ROW]], [updated]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { name: "Updated Venue" });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("Updated Venue");
    });

    it("returns 409 when the updated category name already exists", async () => {
      const db = makeDb([[MEMBER_ROW]]) as unknown as Record<string, unknown>;
      db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue({
              code: "23505",
              constraint: "budget_category_wedding_name",
            }),
          }),
        }),
      });
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await req(app, "PATCH", path, { name: "Venue" });

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "Budget category name already exists.",
      });
    });

    it("returns 500 when category update fails for another database reason", async () => {
      const db = makeDb([[MEMBER_ROW]]) as unknown as Record<string, unknown>;
      db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error("database down")),
          }),
        }),
      });
      const app = makeApp(db as unknown as Database, makeAuth());

      const res = await req(app, "PATCH", path, { name: "Venue" });

      expect(res.status).toBe(500);
    });

    it("returns 404 when no category rows are updated", async () => {
      const db = makeDb([[MEMBER_ROW]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { name: "Updated Venue" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:weddingId/budget/categories/:categoryId", () => {
    const path = `/weddings/${WEDDING_ROW.id}/budget/categories/${CATEGORY_ROW.id}`;

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(403);
    });

    it("deletes category and returns 204", async () => {
      const db = makeDb([[MEMBER_ROW]], [{ id: CATEGORY_ROW.id }]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(204);
    });

    it("returns 404 when deleting a missing category", async () => {
      const db = makeDb([[MEMBER_ROW]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Category not found",
      });
    });

    it("returns 409 when vendors still reference the category", async () => {
      const deleteResult = {
        returning: vi.fn().mockRejectedValue({
          code: "23503",
          constraint: "vendor_category_id_budget_category_id_fk",
        }),
      };
      const deleteBuilder = {
        where: vi.fn().mockReturnValue(deleteResult),
      };
      const db = makeDb([[MEMBER_ROW]]);
      db.delete = vi.fn().mockReturnValue(deleteBuilder);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "Budget category is still in use.",
      });
    });

    it("returns 409 for the legacy vendor category FK name", async () => {
      const deleteResult = {
        returning: vi.fn().mockRejectedValue({
          code: "23503",
          constraint: "vendor_category_category_id_fkey",
        }),
      };
      const deleteBuilder = {
        where: vi.fn().mockReturnValue(deleteResult),
      };
      const db = makeDb([[MEMBER_ROW]]);
      db.delete = vi.fn().mockReturnValue(deleteBuilder);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);

      expect(res.status).toBe(409);
    });

    it("surfaces unexpected delete failures as 500 responses", async () => {
      const deleteResult = {
        returning: vi.fn().mockRejectedValue(new Error("db down")),
      };
      const deleteBuilder = {
        where: vi.fn().mockReturnValue(deleteResult),
      };
      const db = makeDb([[MEMBER_ROW]]);
      db.delete = vi.fn().mockReturnValue(deleteBuilder);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);

      expect(res.status).toBe(500);
    });

    it("does not classify non-object delete failures as category-in-use errors", () => {
      expect(isCategoryInUseError("db down")).toBe(false);
    });

    it("classifies budget category name conflicts across database drivers", () => {
      expect(
        isBudgetCategoryNameConflictError({
          code: "23505",
          constraint: "budget_category_wedding_name",
        }),
      ).toBe(true);
      expect(
        isBudgetCategoryNameConflictError({
          code: "SQLITE_CONSTRAINT_UNIQUE",
          message: "UNIQUE constraint failed: budget_category_wedding_name",
        }),
      ).toBe(true);
      expect(isBudgetCategoryNameConflictError(null)).toBe(false);
      expect(
        isBudgetCategoryNameConflictError({
          code: "23505",
          constraint: "other_unique_constraint",
        }),
      ).toBe(false);
    });
  });

  // =========================================================================
  // Items
  // =========================================================================

  describe("GET /:weddingId/budget/categories/:categoryId/items", () => {
    const path = `/weddings/${WEDDING_ROW.id}/budget/categories/${CATEGORY_ROW.id}/items`;

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(401);
    });

    it("returns items for the category", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [ITEM_ROW], // GET items handler
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as (typeof ITEM_ROW)[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe("Ballroom rental");
    });

    it("requests items in stable sort order", async () => {
      const db = makeDb([[MEMBER_ROW], [ITEM_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);

      expect(res.status).toBe(200);
      const builders = (db as Record<string, unknown>).__selectBuilders as
        | Array<Record<string, ReturnType<typeof vi.fn>>>
        | undefined;
      expect(builders?.[1]?.orderBy).toHaveBeenCalledOnce();
    });
  });

  describe("POST /:weddingId/budget/categories/:categoryId/items", () => {
    const path = `/weddings/${WEDDING_ROW.id}/budget/categories/${CATEGORY_ROW.id}/items`;
    const validItem = {
      name: "DJ Services",
      estimatedCents: 80000,
      quotedCents: 75000,
      paidCents: 0,
      notes: null,
    };

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, validItem);
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [{ id: CATEGORY_ROW.id }], // category ownership check
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, { name: "" });
      expect(res.status).toBe(400);
    });

    it("creates item and returns 201", async () => {
      const newItem = { ...ITEM_ROW, name: "DJ Services" };
      const db = makeDb(
        [
          [MEMBER_ROW], // wedding-access middleware
          [{ id: CATEGORY_ROW.id }], // category ownership check
        ],
        [newItem],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, validItem);
      expect(res.status).toBe(201);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("DJ Services");
    });

    it("returns 404 when category belongs to a different wedding", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // category ownership check — not found
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, validItem);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /:weddingId/budget/categories/:categoryId/items/:itemId", () => {
    const path = `/weddings/${WEDDING_ROW.id}/budget/categories/${CATEGORY_ROW.id}/items/${ITEM_ROW.id}`;

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { name: "Updated" });
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [{ id: CATEGORY_ROW.id }], // category ownership check
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { estimatedCents: -1 });
      expect(res.status).toBe(400);
    });

    it("updates item and returns 200", async () => {
      const updated = { ...ITEM_ROW, name: "Updated rental" };
      const db = makeDb(
        [
          [MEMBER_ROW], // wedding-access middleware
          [{ id: CATEGORY_ROW.id }], // category ownership check
        ],
        [updated],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { name: "Updated rental" });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("Updated rental");
    });

    it("returns 404 when category belongs to a different wedding", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // category ownership check — not found
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { name: "Updated rental" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:weddingId/budget/categories/:categoryId/items/:itemId", () => {
    const path = `/weddings/${WEDDING_ROW.id}/budget/categories/${CATEGORY_ROW.id}/items/${ITEM_ROW.id}`;

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(403);
    });

    it("deletes item and returns 204", async () => {
      const db = makeDb(
        [
          [MEMBER_ROW], // wedding-access middleware
          [{ id: CATEGORY_ROW.id }], // category ownership check
        ],
        [{ id: ITEM_ROW.id }],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(204);
    });

    it("returns 404 when deleting a missing item", async () => {
      const db = makeDb(
        [
          [MEMBER_ROW], // wedding-access middleware
          [{ id: CATEGORY_ROW.id }], // category ownership check
        ],
        [],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: "Item not found" });
    });

    it("returns 404 when category belongs to a different wedding", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // category ownership check — not found
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Summary
  // =========================================================================

  describe("GET /:weddingId/budget/summary", () => {
    const path = `/weddings/${WEDDING_ROW.id}/budget/summary`;

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member", async () => {
      const db = makeDb([[]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(403);
    });

    it("returns zeros when no categories exist", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access
        [WEDDING_ROW], // wedding query
        [], // categories query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalBudgetCents: number;
        totalEstimatedCents: number;
        totalQuotedCents: number;
        totalPaidCents: number;
        unallocatedCents: number;
        categories: unknown[];
      };
      expect(body.totalBudgetCents).toBe(500000);
      expect(body.totalEstimatedCents).toBe(0);
      expect(body.totalQuotedCents).toBe(0);
      expect(body.totalPaidCents).toBe(0);
      expect(body.unallocatedCents).toBe(500000);
      expect(body.categories).toHaveLength(0);
    });

    it("returns correct aggregation with categories and items", async () => {
      const catRow1 = {
        id: "cat-1",
        name: "Venue",
        estimatedCents: 200000,
        sortOrder: 0,
        totalItemEstimatedCents: 100000,
        totalQuotedCents: 95000,
        totalPaidCents: 50000,
        itemCount: 1,
      };
      const catRow2 = {
        id: "cat-2",
        name: "Catering",
        estimatedCents: 150000,
        sortOrder: 1,
        totalItemEstimatedCents: 80000,
        totalQuotedCents: 70000,
        totalPaidCents: 30000,
        itemCount: 2,
      };

      const db = makeDb([
        [MEMBER_ROW], // wedding-access
        [WEDDING_ROW], // wedding query
        [catRow1, catRow2], // categories query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalBudgetCents: number;
        totalEstimatedCents: number;
        totalQuotedCents: number;
        totalPaidCents: number;
        unallocatedCents: number;
        categories: unknown[];
      };
      expect(body.totalBudgetCents).toBe(500000);
      // totalEstimatedCents = category-level: 200000 + 150000
      expect(body.totalEstimatedCents).toBe(350000);
      expect(body.totalQuotedCents).toBe(165000);
      expect(body.totalPaidCents).toBe(80000);
      // unallocatedCents = totalBudgetCents - totalEstimatedCents (category-level)
      expect(body.unallocatedCents).toBe(150000);
      expect(body.categories).toHaveLength(2);
    });

    it("defaults to zero when wedding row is missing", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access
        [], // wedding query returns nothing
        [], // categories query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalBudgetCents: number;
        unallocatedCents: number;
      };
      expect(body.totalBudgetCents).toBe(0);
      expect(body.unallocatedCents).toBe(0);
    });

    it("uses category estimates as the effective budget when wedding budget is null (unset)", async () => {
      const uncappedWedding = {
        ...WEDDING_ROW,
        budgetCents: null,
      };
      const catRow = {
        id: "cat-1",
        name: "Venue",
        estimatedCents: 200000,
        sortOrder: 0,
        totalItemEstimatedCents: 0,
        totalQuotedCents: 95000,
        totalPaidCents: 50000,
        itemCount: 1,
      };

      const db = makeDb([
        [MEMBER_ROW], // wedding-access
        [uncappedWedding], // wedding query
        [catRow], // categories query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalBudgetCents: number;
        totalEstimatedCents: number;
        totalQuotedCents: number;
        totalPaidCents: number;
        unallocatedCents: number;
      };
      expect(body.totalBudgetCents).toBe(200000);
      expect(body.totalEstimatedCents).toBe(200000);
      expect(body.totalQuotedCents).toBe(95000);
      expect(body.totalPaidCents).toBe(50000);
      expect(body.unallocatedCents).toBe(0);
    });

    it("treats budgetCents of 0 as explicitly set to zero (not unset)", async () => {
      const zeroWedding = {
        ...WEDDING_ROW,
        budgetCents: 0,
      };
      const catRow = {
        id: "cat-1",
        name: "Venue",
        estimatedCents: 200000,
        sortOrder: 0,
        totalItemEstimatedCents: 0,
        totalQuotedCents: 0,
        totalPaidCents: 0,
        itemCount: 0,
      };

      const db = makeDb([
        [MEMBER_ROW], // wedding-access
        [zeroWedding], // wedding query — budgetCents explicitly 0
        [catRow], // categories query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalBudgetCents: number;
        unallocatedCents: number;
      };
      // 0 is explicitly set, so totalBudgetCents should be 0, not the estimate
      expect(body.totalBudgetCents).toBe(0);
      expect(body.unallocatedCents).toBe(-200000);
    });

    it("coerces aggregate totals to numbers when the database returns strings", async () => {
      const catRow = {
        id: "cat-1",
        name: "Venue",
        estimatedCents: 200000,
        sortOrder: 0,
        totalItemEstimatedCents: "150000",
        totalQuotedCents: "95000",
        totalPaidCents: "50000",
        itemCount: "1",
      };

      const db = makeDb([
        [MEMBER_ROW], // wedding-access
        [WEDDING_ROW], // wedding query
        [catRow], // categories query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalBudgetCents: number;
        totalEstimatedCents: number;
        totalQuotedCents: number;
        totalPaidCents: number;
        unallocatedCents: number;
        categories: Array<{
          totalItemEstimatedCents: number;
          totalQuotedCents: number;
          totalPaidCents: number;
          itemCount: number;
        }>;
      };
      expect(body.totalBudgetCents).toBe(500000);
      expect(body.totalEstimatedCents).toBe(200000);
      expect(body.totalQuotedCents).toBe(95000);
      expect(body.totalPaidCents).toBe(50000);
      expect(body.unallocatedCents).toBe(300000);
      expect(body.categories[0]).toMatchObject({
        totalItemEstimatedCents: 150000,
        totalQuotedCents: 95000,
        totalPaidCents: 50000,
        itemCount: 1,
      });
    });

    it("handles categories with null aggregated values", async () => {
      const catWithNulls = {
        id: "cat-1",
        name: "Venue",
        estimatedCents: null,
        sortOrder: 0,
        totalItemEstimatedCents: null,
        totalQuotedCents: null,
        totalPaidCents: null,
        itemCount: 0,
      };

      const db = makeDb([
        [MEMBER_ROW], // wedding-access
        [WEDDING_ROW], // wedding query
        [catWithNulls], // categories query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalEstimatedCents: number;
        totalQuotedCents: number;
        totalPaidCents: number;
      };
      expect(body.totalEstimatedCents).toBe(0);
      expect(body.totalQuotedCents).toBe(0);
      expect(body.totalPaidCents).toBe(0);
    });
  });

  describe("GET /:weddingId/budget/summary - toNumber non-finite guard", () => {
    const path = `/weddings/${WEDDING_ROW.id}/budget/summary`;

    it("coerces NaN string values to 0 and logs a warning", async () => {
      const catWithNaN = {
        id: "cat-1",
        name: "Venue",
        estimatedCents: "NaN",
        sortOrder: 0,
        totalItemEstimatedCents: "NaN",
        totalQuotedCents: "NaN",
        totalPaidCents: "NaN",
        itemCount: 0,
      };

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const db = makeDb([
        [MEMBER_ROW], // wedding-access
        [WEDDING_ROW], // wedding query
        [catWithNaN], // categories query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalEstimatedCents: number;
        totalQuotedCents: number;
        totalPaidCents: number;
      };
      expect(body.totalEstimatedCents).toBe(0);
      expect(body.totalQuotedCents).toBe(0);
      expect(body.totalPaidCents).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        "[budget] non-finite value coerced to 0:",
        "NaN",
      );
      warnSpy.mockRestore();
    });

    it("coerces Infinity number values to 0 and logs a warning", async () => {
      const catWithInfinity = {
        id: "cat-1",
        name: "Venue",
        estimatedCents: Infinity,
        sortOrder: 0,
        totalItemEstimatedCents: 0,
        totalQuotedCents: 0,
        totalPaidCents: 0,
        itemCount: 0,
      };

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const db = makeDb([
        [MEMBER_ROW], // wedding-access
        [WEDDING_ROW], // wedding query
        [catWithInfinity], // categories query
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as { totalEstimatedCents: number };
      expect(body.totalEstimatedCents).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        "[budget] non-finite value coerced to 0:",
        Infinity,
      );
      warnSpy.mockRestore();
    });
  });

  describe("PATCH /:weddingId/budget/categories/:categoryId/items/:itemId - missing rows", () => {
    const path = `/weddings/${WEDDING_ROW.id}/budget/categories/${CATEGORY_ROW.id}/items/${ITEM_ROW.id}`;

    it("returns 404 when no item rows are updated", async () => {
      const db = makeDb(
        [
          [MEMBER_ROW], // wedding-access middleware
          [{ id: CATEGORY_ROW.id }], // category ownership check
        ],
        [],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { name: "Updated rental" });
      expect(res.status).toBe(404);
    });
  });
});
