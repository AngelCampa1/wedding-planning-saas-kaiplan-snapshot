import { Hono } from "hono";
import type { Context } from "hono";
import { eq, and, sql } from "drizzle-orm";
import {
  createBudgetCategorySchema,
  updateBudgetCategorySchema,
  createBudgetItemSchema,
  updateBudgetItemSchema,
} from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import { wedding } from "../db/schema";
import { budgetCategory, budgetItem } from "../db/budget-schema";
import { readJsonBody } from "../lib/json-body";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

type AppEnv = { Bindings: Env; Variables: Variables };

function requireWriter(c: Context<AppEnv>) {
  if (c.get("weddingRole") === "viewer") {
    return c.json({ error: "Viewers cannot modify budget" }, 403);
  }
  return null;
}

export function isCategoryInUseError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const code = "code" in error ? error.code : null;
    const constraint = "constraint" in error ? error.constraint : null;

    return (
      code === "23503" &&
      (constraint === "vendor_category_category_id_fkey" ||
        constraint === "vendor_category_id_budget_category_id_fk")
    );
  }

  return false;
}

export function isBudgetCategoryNameConflictError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  const code = "code" in error ? error.code : null;
  const constraint = "constraint" in error ? error.constraint : null;
  const message = "message" in error ? error.message : null;

  if (code === "23505" && constraint === "budget_category_wedding_name") {
    return true;
  }

  return (
    typeof code === "string" &&
    code.startsWith("SQLITE_CONSTRAINT") &&
    typeof message === "string" &&
    message.includes("budget_category_wedding_name")
  );
}

export function budgetRoutes(db: Database, auth: Auth) {
  const app = new Hono<AppEnv>();
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  function toNumber(value: number | string | null | undefined) {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        console.warn("[budget] non-finite value coerced to 0:", value);
        return 0;
      }
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        console.warn("[budget] non-finite value coerced to 0:", value);
        return 0;
      }
      return parsed;
    }

    return 0;
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  // List categories with aggregated item totals
  app.get(
    "/:weddingId/budget/categories",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const rows = await db
        .select({
          id: budgetCategory.id,
          weddingId: budgetCategory.weddingId,
          name: budgetCategory.name,
          estimatedCents: budgetCategory.estimatedCents,
          sortOrder: budgetCategory.sortOrder,
          createdAt: budgetCategory.createdAt,
          updatedAt: budgetCategory.updatedAt,
          totalItemEstimatedCents:
            sql<number>`COALESCE(SUM(${budgetItem.estimatedCents}), 0)`.as(
              "totalItemEstimatedCents",
            ),
          totalQuotedCents:
            sql<number>`COALESCE(SUM(${budgetItem.quotedCents}), 0)`.as(
              "totalQuotedCents",
            ),
          totalPaidCents:
            sql<number>`COALESCE(SUM(${budgetItem.paidCents}), 0)`.as(
              "totalPaidCents",
            ),
          itemCount: sql<number>`COALESCE(COUNT(${budgetItem.id}), 0)`.as(
            "itemCount",
          ),
        })
        .from(budgetCategory)
        .leftJoin(budgetItem, eq(budgetItem.categoryId, budgetCategory.id))
        .where(eq(budgetCategory.weddingId, weddingId))
        .groupBy(
          budgetCategory.id,
          budgetCategory.weddingId,
          budgetCategory.name,
          budgetCategory.estimatedCents,
          budgetCategory.sortOrder,
          budgetCategory.createdAt,
          budgetCategory.updatedAt,
        )
        .orderBy(
          budgetCategory.sortOrder,
          budgetCategory.createdAt,
          budgetCategory.id,
        );

      return c.json(rows);
    },
  );

  // Create category
  app.post(
    "/:weddingId/budget/categories",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = createBudgetCategorySchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      let created: typeof budgetCategory.$inferSelect | undefined;
      try {
        [created] = await db
          .insert(budgetCategory)
          .values({
            weddingId,
            name: parsed.data.name,
            estimatedCents: parsed.data.estimatedCents,
          })
          .returning();
      } catch (error) {
        if (isBudgetCategoryNameConflictError(error)) {
          return c.json({ error: "Budget category name already exists." }, 409);
        }
        throw error;
      }

      return c.json(created, 201);
    },
  );

  // Update category
  app.patch(
    "/:weddingId/budget/categories/:categoryId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const categoryId = c.req.param("categoryId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = updateBudgetCategorySchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      let updated: typeof budgetCategory.$inferSelect | undefined;
      try {
        [updated] = await db
          .update(budgetCategory)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(
            and(
              eq(budgetCategory.id, categoryId),
              eq(budgetCategory.weddingId, weddingId),
            ),
          )
          .returning();
      } catch (error) {
        if (isBudgetCategoryNameConflictError(error)) {
          return c.json({ error: "Budget category name already exists." }, 409);
        }
        throw error;
      }

      if (!updated) {
        return c.json({ error: "Category not found" }, 404);
      }

      return c.json(updated);
    },
  );

  // Delete category
  app.delete(
    "/:weddingId/budget/categories/:categoryId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const categoryId = c.req.param("categoryId");

      try {
        const [deleted] = await db
          .delete(budgetCategory)
          .where(
            and(
              eq(budgetCategory.id, categoryId),
              eq(budgetCategory.weddingId, weddingId),
            ),
          )
          .returning({ id: budgetCategory.id });

        if (!deleted) {
          return c.json({ error: "Category not found" }, 404);
        }
      } catch (error) {
        if (isCategoryInUseError(error)) {
          return c.json({ error: "Budget category is still in use." }, 409);
        }

        throw error;
      }

      return c.body(null, 204);
    },
  );

  // -------------------------------------------------------------------------
  // Items
  // -------------------------------------------------------------------------

  // List items for a category
  app.get(
    "/:weddingId/budget/categories/:categoryId/items",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");
      const categoryId = c.req.param("categoryId");

      const rows = await db
        .select({
          id: budgetItem.id,
          categoryId: budgetItem.categoryId,
          name: budgetItem.name,
          estimatedCents: budgetItem.estimatedCents,
          quotedCents: budgetItem.quotedCents,
          paidCents: budgetItem.paidCents,
          notes: budgetItem.notes,
          sortOrder: budgetItem.sortOrder,
          createdAt: budgetItem.createdAt,
          updatedAt: budgetItem.updatedAt,
        })
        .from(budgetItem)
        .innerJoin(budgetCategory, eq(budgetCategory.id, budgetItem.categoryId))
        .where(
          and(
            eq(budgetItem.categoryId, categoryId),
            eq(budgetCategory.weddingId, weddingId),
          ),
        )
        .orderBy(budgetItem.sortOrder, budgetItem.createdAt, budgetItem.id);

      return c.json(rows);
    },
  );

  // Create item
  app.post(
    "/:weddingId/budget/categories/:categoryId/items",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const categoryId = c.req.param("categoryId");

      // Verify category belongs to this wedding
      const [cat] = await db
        .select({ id: budgetCategory.id })
        .from(budgetCategory)
        .where(
          and(
            eq(budgetCategory.id, categoryId),
            eq(budgetCategory.weddingId, weddingId),
          ),
        )
        .limit(1);

      if (!cat) {
        return c.json({ error: "Category not found" }, 404);
      }

      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = createBudgetItemSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const [created] = await db
        .insert(budgetItem)
        .values({
          categoryId,
          name: parsed.data.name,
          estimatedCents: parsed.data.estimatedCents,
          quotedCents: parsed.data.quotedCents,
          paidCents: parsed.data.paidCents,
          notes: parsed.data.notes,
        })
        .returning();

      return c.json(created, 201);
    },
  );

  // Update item
  app.patch(
    "/:weddingId/budget/categories/:categoryId/items/:itemId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const categoryId = c.req.param("categoryId");
      const itemId = c.req.param("itemId");

      // Verify category belongs to this wedding
      const [cat] = await db
        .select({ id: budgetCategory.id })
        .from(budgetCategory)
        .where(
          and(
            eq(budgetCategory.id, categoryId),
            eq(budgetCategory.weddingId, weddingId),
          ),
        )
        .limit(1);

      if (!cat) {
        return c.json({ error: "Category not found" }, 404);
      }

      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = updateBudgetItemSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const [updated] = await db
        .update(budgetItem)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(
          and(eq(budgetItem.id, itemId), eq(budgetItem.categoryId, categoryId)),
        )
        .returning();

      if (!updated) {
        return c.json({ error: "Item not found" }, 404);
      }

      return c.json(updated);
    },
  );

  // Delete item
  app.delete(
    "/:weddingId/budget/categories/:categoryId/items/:itemId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const categoryId = c.req.param("categoryId");
      const itemId = c.req.param("itemId");

      // Verify category belongs to this wedding
      const [cat] = await db
        .select({ id: budgetCategory.id })
        .from(budgetCategory)
        .where(
          and(
            eq(budgetCategory.id, categoryId),
            eq(budgetCategory.weddingId, weddingId),
          ),
        )
        .limit(1);

      if (!cat) {
        return c.json({ error: "Category not found" }, 404);
      }

      const [deleted] = await db
        .delete(budgetItem)
        .where(
          and(eq(budgetItem.id, itemId), eq(budgetItem.categoryId, categoryId)),
        )
        .returning({ id: budgetItem.id });

      if (!deleted) {
        return c.json({ error: "Item not found" }, 404);
      }

      return c.body(null, 204);
    },
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  app.get(
    "/:weddingId/budget/summary",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      // 1. Get wedding budget
      const [weddingRow] = await db
        .select({ budgetCents: wedding.budgetCents })
        .from(wedding)
        .where(eq(wedding.id, weddingId))
        .limit(1);

      // weddingRow?.budgetCents is null when no wedding row found OR when
      // budgetCents is explicitly NULL (no budget configured).
      const configuredBudgetCents = weddingRow?.budgetCents ?? null;

      // 2. Get categories with aggregated item totals
      const categoryRows = await db
        .select({
          id: budgetCategory.id,
          name: budgetCategory.name,
          estimatedCents: budgetCategory.estimatedCents,
          sortOrder: budgetCategory.sortOrder,
          totalItemEstimatedCents:
            sql<number>`COALESCE(SUM(${budgetItem.estimatedCents}), 0)`.as(
              "totalItemEstimatedCents",
            ),
          totalQuotedCents:
            sql<number>`COALESCE(SUM(${budgetItem.quotedCents}), 0)`.as(
              "totalQuotedCents",
            ),
          totalPaidCents:
            sql<number>`COALESCE(SUM(${budgetItem.paidCents}), 0)`.as(
              "totalPaidCents",
            ),
          itemCount: sql<number>`COALESCE(COUNT(${budgetItem.id}), 0)`.as(
            "itemCount",
          ),
        })
        .from(budgetCategory)
        .leftJoin(budgetItem, eq(budgetItem.categoryId, budgetCategory.id))
        .where(eq(budgetCategory.weddingId, weddingId))
        .groupBy(
          budgetCategory.id,
          budgetCategory.name,
          budgetCategory.estimatedCents,
          budgetCategory.sortOrder,
        )
        .orderBy(
          budgetCategory.sortOrder,
          budgetCategory.createdAt,
          budgetCategory.id,
        );

      const categories = categoryRows.map((category) => ({
        ...category,
        estimatedCents: toNumber(category.estimatedCents),
        totalItemEstimatedCents: toNumber(category.totalItemEstimatedCents),
        totalQuotedCents: toNumber(category.totalQuotedCents),
        totalPaidCents: toNumber(category.totalPaidCents),
        itemCount: toNumber(category.itemCount),
      }));

      // 3. Compute totals from category-level estimated (not item-level)
      const totalEstimatedCents = categories.reduce(
        (sum, cat) => sum + cat.estimatedCents,
        0,
      );
      const totalQuotedCents = categories.reduce(
        (sum, cat) => sum + cat.totalQuotedCents,
        0,
      );
      const totalPaidCents = categories.reduce(
        (sum, cat) => sum + cat.totalPaidCents,
        0,
      );

      // NULL means no budget configured — fall back to estimated category totals.
      // 0 is a valid explicit budget of zero.
      const totalBudgetCents =
        configuredBudgetCents !== null
          ? configuredBudgetCents
          : totalEstimatedCents;
      const unallocatedCents = totalBudgetCents - totalEstimatedCents;

      return c.json({
        totalBudgetCents,
        totalEstimatedCents,
        totalQuotedCents,
        totalPaidCents,
        unallocatedCents,
        categories,
      });
    },
  );

  return app;
}
