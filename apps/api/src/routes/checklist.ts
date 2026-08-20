import { Hono } from "hono";
import type { Context } from "hono";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import {
  createChecklistTaskSchema,
  updateChecklistTaskSchema,
  MILESTONE_BUCKETS,
} from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import { checklistTask } from "../db/checklist-schema";
import { readJsonBody } from "../lib/json-body";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";
import { SEED_TASKS } from "./checklist-seed-template";

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

type AppEnv = { Bindings: Env; Variables: Variables };

function requireWriter(c: Context<AppEnv>) {
  if (c.get("weddingRole") === "viewer") {
    return c.json({ error: "Viewers cannot modify checklist" }, 403);
  }
  return null;
}

// Build a bucket-order SQL expression so tasks sort by bucket timeline order.
// Uses simple-CASE form: `CASE bucket WHEN '<val>' THEN <n> ... END` — the
// column reference must precede the WHEN clauses so Postgres performs an
// equality check rather than treating the string literal as a boolean.
//
// Safety: all bucket names must come from the MILESTONE_BUCKETS constant.
// Using sql.raw with arbitrary input would be unsafe (SQL injection risk).
export function bucketOrderSql() {
  const cases = MILESTONE_BUCKETS.map((bucket, index) => {
    if (!(MILESTONE_BUCKETS as readonly string[]).includes(bucket)) {
      throw new Error(
        `bucketOrderSql: unsafe bucket name "${bucket}" is not in MILESTONE_BUCKETS`,
      );
    }
    return `WHEN '${bucket}' THEN ${index}`;
  }).join(" ");
  return sql.raw(`CASE bucket ${cases} END`);
}

/**
 * Assert that every entry in `names` is a known MILESTONE_BUCKETS value.
 * Throws if any unknown name is found so that sql.raw is never called with
 * user-supplied or drifted bucket strings.
 */
export function assertAllBucketNames(names: readonly string[]): void {
  const validSet = new Set<string>(MILESTONE_BUCKETS);
  for (const name of names) {
    if (!validSet.has(name)) {
      throw new Error(
        `assertAllBucketNames: unknown bucket name "${name}" — must be one of: ${MILESTONE_BUCKETS.join(", ")}`,
      );
    }
  }
}

export function checklistRoutes(db: Database, auth: Auth) {
  const app = new Hono<AppEnv>();
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  // GET /:weddingId/checklist
  app.get(
    "/:weddingId/checklist",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const tasks = await db
        .select()
        .from(checklistTask)
        .where(eq(checklistTask.weddingId, weddingId))
        .orderBy(bucketOrderSql(), checklistTask.sortOrder);

      const completedCount = tasks.filter(
        (task) => task.completedAt !== null,
      ).length;

      return c.json({
        tasks,
        totalCount: tasks.length,
        completedCount,
      });
    },
  );

  // POST /:weddingId/checklist
  app.post(
    "/:weddingId/checklist",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const user = c.get("user");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = createChecklistTaskSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const [created] = await db
        .insert(checklistTask)
        .values({
          weddingId,
          bucket: parsed.data.bucket,
          title: parsed.data.title,
          notes: parsed.data.notes ?? null,
          dueOffsetDays: parsed.data.dueOffsetDays ?? null,
          sortOrder: parsed.data.sortOrder ?? 0,
          createdBy: user.id,
        })
        .returning();

      return c.json(created, 201);
    },
  );

  // PATCH /:weddingId/checklist/:taskId
  app.patch(
    "/:weddingId/checklist/:taskId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const taskId = c.req.param("taskId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = updateChecklistTaskSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      type ChecklistUpdate = Partial<InferInsertModel<typeof checklistTask>>;

      const { completedAt: completedAtRaw, ...restData } = parsed.data;
      const updateData: ChecklistUpdate = {
        ...restData,
        updatedAt: new Date(),
      };

      // Handle completedAt conversion separately (string → Date or null)
      if (typeof completedAtRaw === "string") {
        updateData.completedAt = new Date(completedAtRaw);
      } else if (completedAtRaw === null) {
        updateData.completedAt = null;
      }

      const [updated] = await db
        .update(checklistTask)
        .set(updateData)
        .where(
          and(
            eq(checklistTask.id, taskId),
            eq(checklistTask.weddingId, weddingId),
          ),
        )
        .returning();

      if (!updated) {
        return c.json({ error: "Task not found" }, 404);
      }

      return c.json(updated);
    },
  );

  // DELETE /:weddingId/checklist/:taskId
  app.delete(
    "/:weddingId/checklist/:taskId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const taskId = c.req.param("taskId");

      const [deleted] = await db
        .delete(checklistTask)
        .where(
          and(
            eq(checklistTask.id, taskId),
            eq(checklistTask.weddingId, weddingId),
          ),
        )
        .returning({ id: checklistTask.id });

      if (!deleted) {
        return c.json({ error: "Task not found" }, 404);
      }

      return c.body(null, 204);
    },
  );

  // POST /:weddingId/checklist/seed
  app.post(
    "/:weddingId/checklist/seed",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      // requireWriter runs FIRST — viewers must not learn seeded=false status.
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const user = c.get("user");

      // Assert all SEED_TASKS bucket names are known so sql.raw stays safe.
      assertAllBucketNames(SEED_TASKS.map((t) => t.bucket));

      // Serialize seed calls on the stable wedding row before counting tasks.
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM wedding WHERE id = ${weddingId} FOR UPDATE`,
        );

        const existing = await tx
          .select({ count: sql<number>`COUNT(*)` })
          .from(checklistTask)
          .where(eq(checklistTask.weddingId, weddingId));

        const existingCount = Number(existing[0]?.count ?? 0);

        if (existingCount > 0) {
          return { seeded: false as const, count: existingCount };
        }

        const insertValues = SEED_TASKS.map((task, index) => ({
          weddingId,
          bucket: task.bucket,
          title: task.title,
          dueOffsetDays: task.dueOffsetDays,
          sortOrder: index,
          createdBy: user.id,
        }));

        await tx.insert(checklistTask).values(insertValues);

        return { seeded: true as const, count: insertValues.length };
      });

      if (!result.seeded) {
        return c.json({ seeded: false, count: result.count });
      }

      return c.json({ seeded: true, count: result.count }, 201);
    },
  );

  // GET /:weddingId/checklist/stats — count completed tasks
  app.get(
    "/:weddingId/checklist/stats",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const [totalRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(checklistTask)
        .where(eq(checklistTask.weddingId, weddingId));

      const [completedRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(checklistTask)
        .where(
          and(
            eq(checklistTask.weddingId, weddingId),
            isNotNull(checklistTask.completedAt),
          ),
        );

      return c.json({
        totalCount: Number(totalRow?.count ?? 0),
        completedCount: Number(completedRow?.count ?? 0),
      });
    },
  );

  return app;
}
