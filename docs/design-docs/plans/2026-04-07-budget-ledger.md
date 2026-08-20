# Budget Ledger Implementation Plan


**Goal:** Build the Budget Ledger feature — budget categories with line items, aggregation summaries, card-grid UI with slide-over panel, and a dashboard widget.

**Architecture:** Two new DB tables (`budget_category`, `budget_item`) with flat CRUD and SQL aggregation at query time. Hono API routes nested under `/api/weddings/:weddingId/budget`, using existing session + wedding-access middleware. React frontend with card grid, Shadcn Sheet slide-over, and TanStack Query hooks.

**Tech Stack:** Drizzle ORM, Hono, Zod, React 19, TanStack Query, TanStack Router, Shadcn/UI (Sheet, Dialog, Card), Vitest, Testing Library.

**Spec:** `docs/design-docs/specs/2026-04-07-budget-ledger-design.md`

---

## File Map

### New Files

**Shared package (`packages/shared/src/`):**
- `budget-schemas.ts` — Zod schemas for budget category and item create/update

**API (`apps/api/src/`):**
- `db/budget-schema.ts` — Drizzle table definitions for `budget_category` and `budget_item`
- `routes/budget.ts` — All budget endpoints (categories, items, summary)

**App (`apps/app/src/`):**
- `hooks/use-budget.ts` — TanStack Query hooks for budget data and mutations
- `lib/format-money.ts` — `formatMoney(cents, currency)` utility
- `components/budget/budget-summary-bar.tsx` — Top-of-page summary stats
- `components/budget/budget-category-grid.tsx` — Card grid layout
- `components/budget/budget-category-card.tsx` — Individual category card with progress bar
- `components/budget/budget-category-panel.tsx` — Shadcn Sheet slide-over with items table
- `components/budget/budget-item-form.tsx` — Inline create/edit form for items
- `components/budget/budget-category-form.tsx` — Dialog for creating/editing categories
- `components/budget/budget-widget.tsx` — Dashboard summary widget
- `components/ui/sheet.tsx` — Shadcn Sheet component (via CLI or manual)
- `components/ui/progress.tsx` — Shadcn Progress component (via CLI or manual)

**Tests:**
- `packages/shared/__tests__/budget-schemas.test.ts`
- `apps/api/__tests__/routes/budget.test.ts`
- `apps/app/__tests__/lib/format-money.test.ts`
- `apps/app/__tests__/hooks/use-budget.test.ts`
- `apps/app/__tests__/components/budget/budget-summary-bar.test.tsx`
- `apps/app/__tests__/components/budget/budget-category-card.test.tsx`
- `apps/app/__tests__/components/budget/budget-category-panel.test.tsx`
- `apps/app/__tests__/components/budget/budget-item-form.test.tsx`
- `apps/app/__tests__/components/budget/budget-category-form.test.tsx`
- `apps/app/__tests__/components/budget/budget-widget.test.tsx`

### Modified Files

- `apps/api/src/db/schema.ts` — Re-export budget tables
- `apps/api/src/index.ts` — Mount budget routes
- `packages/shared/src/schemas.ts` — Re-export budget schemas
- `packages/shared/src/types.ts` — Add budget TypeScript interfaces
- `packages/shared/src/index.ts` — May need explicit re-export if barrel changes
- `apps/app/src/routes/_authenticated/budget.tsx` — Replace placeholder with real budget page
- `apps/app/src/routes/_authenticated/dashboard.tsx` — Replace "coming soon" Budget ModuleCard with BudgetWidget
- `apps/app/package.json` — Add `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `vitest`
- `apps/app/tsconfig.json` — Add vitest types if needed

---

## Task 1: Shared Zod Schemas

**Files:**
- Create: `packages/shared/src/budget-schemas.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/types.ts`
- Test: `packages/shared/__tests__/budget-schemas.test.ts`

- [ ] **Step 1: Write failing tests for budget category schemas**

```typescript
// packages/shared/__tests__/budget-schemas.test.ts
import { describe, it, expect } from "vitest";
import {
  createBudgetCategorySchema,
  updateBudgetCategorySchema,
  createBudgetItemSchema,
  updateBudgetItemSchema,
} from "../src/budget-schemas";

describe("createBudgetCategorySchema", () => {
  it("accepts valid input", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Photography",
      estimatedCents: 500000,
    });
    expect(result.success).toBe(true);
  });

  it("defaults estimatedCents to 0", () => {
    const result = createBudgetCategorySchema.safeParse({ name: "Venue" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCents).toBe(0);
    }
  });

  it("rejects empty name", () => {
    const result = createBudgetCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 200 characters", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative estimatedCents", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer estimatedCents", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: 100.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects estimatedCents exceeding max bound", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: 1_000_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts estimatedCents at max bound", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: 999_999_999,
    });
    expect(result.success).toBe(true);
  });

  it("accepts estimatedCents at zero", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateBudgetCategorySchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateBudgetCategorySchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with estimatedCents only", () => {
    const result = updateBudgetCategorySchema.safeParse({
      estimatedCents: 300000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with sortOrder only", () => {
    const result = updateBudgetCategorySchema.safeParse({ sortOrder: 2 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateBudgetCategorySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid estimatedCents in update", () => {
    const result = updateBudgetCategorySchema.safeParse({
      estimatedCents: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("createBudgetItemSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Jane Doe Photography",
      estimatedCents: 500000,
      quotedCents: 420000,
      paidCents: 150000,
      notes: "Includes engagement shoot",
    });
    expect(result.success).toBe(true);
  });

  it("accepts name only, defaults cents to 0", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Photographer",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCents).toBe(0);
      expect(result.data.quotedCents).toBe(0);
      expect(result.data.paidCents).toBe(0);
      expect(result.data.notes).toBeNull();
    }
  });

  it("rejects empty name", () => {
    const result = createBudgetItemSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 200 characters", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quotedCents", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Item",
      quotedCents: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer paidCents", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Item",
      paidCents: 99.99,
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes exceeding 1000 characters", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Item",
      notes: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts notes at max length", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Item",
      notes: "a".repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it("accepts null notes", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Item",
      notes: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateBudgetItemSchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateBudgetItemSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with quotedCents only", () => {
    const result = updateBudgetItemSchema.safeParse({ quotedCents: 350000 });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with sortOrder only", () => {
    const result = updateBudgetItemSchema.safeParse({ sortOrder: 3 });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with notes", () => {
    const result = updateBudgetItemSchema.safeParse({ notes: "Updated note" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateBudgetItemSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid paidCents in update", () => {
    const result = updateBudgetItemSchema.safeParse({ paidCents: -1 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kaiplan/shared test -- __tests__/budget-schemas.test.ts`
Expected: FAIL — module `../src/budget-schemas` not found

- [ ] **Step 3: Write the budget schemas**

```typescript
// packages/shared/src/budget-schemas.ts
import { z } from "zod";

const centsField = z.number().int().min(0).max(999_999_999);

export const createBudgetCategorySchema = z.object({
  name: z.string().min(1).max(200),
  estimatedCents: centsField.default(0),
});

export const updateBudgetCategorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  estimatedCents: centsField.optional(),
  sortOrder: z.number().int().optional(),
});

export const createBudgetItemSchema = z.object({
  name: z.string().min(1).max(200),
  estimatedCents: centsField.default(0),
  quotedCents: centsField.default(0),
  paidCents: centsField.default(0),
  notes: z.string().max(1000).nullable().default(null),
});

export const updateBudgetItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  estimatedCents: centsField.optional(),
  quotedCents: centsField.optional(),
  paidCents: centsField.optional(),
  notes: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateBudgetCategoryInput = z.infer<typeof createBudgetCategorySchema>;
export type UpdateBudgetCategoryInput = z.infer<typeof updateBudgetCategorySchema>;
export type CreateBudgetItemInput = z.infer<typeof createBudgetItemSchema>;
export type UpdateBudgetItemInput = z.infer<typeof updateBudgetItemSchema>;
```

- [ ] **Step 4: Add re-export to schemas.ts**

Add to end of `packages/shared/src/schemas.ts`:

```typescript
export * from "./budget-schemas";
```

- [ ] **Step 5: Add TypeScript interfaces to types.ts**

Add to end of `packages/shared/src/types.ts`:

```typescript
export interface BudgetCategory {
  id: string;
  weddingId: string;
  name: string;
  estimatedCents: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetItem {
  id: string;
  categoryId: string;
  name: string;
  estimatedCents: number;
  quotedCents: number;
  paidCents: number;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCategoryWithTotals extends BudgetCategory {
  totalItemEstimatedCents: number;
  totalQuotedCents: number;
  totalPaidCents: number;
  itemCount: number;
}

export interface BudgetSummary {
  totalBudgetCents: number;
  totalEstimatedCents: number;
  totalQuotedCents: number;
  totalPaidCents: number;
  unallocatedCents: number;
  categories: BudgetCategoryWithTotals[];
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @kaiplan/shared test -- __tests__/budget-schemas.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Run coverage to verify threshold**

Run: `pnpm --filter @kaiplan/shared test:coverage`
Expected: PASS with ≥95% coverage on `budget-schemas.ts`

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/budget-schemas.ts packages/shared/src/schemas.ts packages/shared/src/types.ts packages/shared/__tests__/budget-schemas.test.ts
git commit -m "feat(shared): add budget category and item Zod schemas and types"
```

---

## Task 2: Database Schema

**Files:**
- Create: `apps/api/src/db/budget-schema.ts`
- Modify: `apps/api/src/db/schema.ts`

No test file — Drizzle schema definitions are declarative table configs (excluded from coverage in vitest config). The schema is validated indirectly through the route tests in Task 3.

- [ ] **Step 1: Create budget schema file**

```typescript
// apps/api/src/db/budget-schema.ts
import { pgTable, uuid, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { wedding } from "./schema";

export const budgetCategory = pgTable(
  "budget_category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => wedding.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    estimatedCents: integer("estimated_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("budget_category_wedding_name").on(table.weddingId, table.name)]
);

export const budgetItem = pgTable("budget_item", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => budgetCategory.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  estimatedCents: integer("estimated_cents").notNull().default(0),
  quotedCents: integer("quoted_cents").notNull().default(0),
  paidCents: integer("paid_cents").notNull().default(0),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Re-export from schema.ts**

Add to end of `apps/api/src/db/schema.ts`:

```typescript
export { budgetCategory, budgetItem } from "./budget-schema";
```

- [ ] **Step 3: Generate Drizzle migration**

Run: `pnpm --filter @kaiplan/api run db:generate`
Expected: New migration file created in `apps/api/drizzle/` directory

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm --filter @kaiplan/api typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/budget-schema.ts apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(api): add budget_category and budget_item database tables"
```

---

## Task 3: Budget API Routes

**Files:**
- Create: `apps/api/src/routes/budget.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/__tests__/routes/budget.test.ts`

This is the largest task. The route file handles all budget endpoints. Tests mock the DB following the existing pattern from `weddings.test.ts`.

- [ ] **Step 1: Write failing tests for budget category CRUD**

Create `apps/api/__tests__/routes/budget.test.ts`. This test file follows the same mock patterns as `weddings.test.ts` — `makeAuth()`, `makeUnauthAuth()`, chainable Drizzle builders, `makeApp()` wrapping the routes.

```typescript
// apps/api/__tests__/routes/budget.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { budgetRoutes } from "../../src/routes/budget";
import type { Database } from "../../src/db/client";
import type { Auth } from "../../src/auth";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const TEST_USER = { id: "user-1", email: "user@example.com", name: "Test User" };
const WEDDING_ID = "wedding-uuid-1";

const MEMBER_ROW = {
  id: "member-uuid-1",
  weddingId: WEDDING_ID,
  userId: TEST_USER.id,
  role: "owner" as const,
  invitedEmail: null,
  acceptedAt: new Date("2024-01-01"),
  createdAt: new Date("2024-01-01"),
};

const CATEGORY_ROW = {
  id: "cat-uuid-1",
  weddingId: WEDDING_ID,
  name: "Photography",
  estimatedCents: 500000,
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const ITEM_ROW = {
  id: "item-uuid-1",
  categoryId: CATEGORY_ROW.id,
  name: "Jane Doe Photography",
  estimatedCents: 500000,
  quotedCents: 420000,
  paidCents: 150000,
  notes: "Includes engagement shoot",
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

// ---------------------------------------------------------------------------
// Mock factories (same pattern as weddings.test.ts)
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
    onRejected?: (e: unknown) => unknown
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
  builder.delete = vi.fn().mockReturnValue(builder);
  return builder;
}

/**
 * Budget routes need multi-step select chains:
 * 1st select: wedding-access middleware (membership check)
 * Subsequent selects: budget route handlers
 *
 * `selectResponses` is an array of responses for each successive select() call.
 */
function makeDb(selectResponses: unknown[][], writeResult: unknown[] = []): Database {
  let selectCount = 0;
  const db: Record<string, unknown> = {};

  db.select = vi.fn().mockImplementation((...args: unknown[]) => {
    const rows = selectResponses[selectCount] ?? [];
    selectCount++;
    return makeSelectBuilder(rows);
  });

  const writeBuilder = makeWriteBuilder(writeResult);
  db.insert = vi.fn().mockReturnValue(writeBuilder);
  db.update = vi.fn().mockReturnValue(writeBuilder);
  db.delete = vi.fn().mockReturnValue(writeBuilder);

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
  body?: unknown
) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tests — Categories
// ---------------------------------------------------------------------------

describe("budgetRoutes — categories", () => {
  describe("GET /weddings/:weddingId/budget/categories", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb([]);
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/budget/categories`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a wedding member", async () => {
      const db = makeDb([[]]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/budget/categories`);
      expect(res.status).toBe(403);
    });

    it("returns categories with aggregated totals", async () => {
      const categoryWithTotals = {
        ...CATEGORY_ROW,
        totalItemEstimatedCents: 500000,
        totalQuotedCents: 420000,
        totalPaidCents: 150000,
        itemCount: 1,
      };
      const db = makeDb([[MEMBER_ROW], [categoryWithTotals]]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/budget/categories`);
      expect(res.status).toBe(200);
      const body = await res.json() as unknown[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
    });

    it("returns empty array when no categories exist", async () => {
      const db = makeDb([[MEMBER_ROW], []]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/budget/categories`);
      expect(res.status).toBe(200);
      const body = await res.json() as unknown[];
      expect(body).toHaveLength(0);
    });
  });

  describe("POST /weddings/:weddingId/budget/categories", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb([]);
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/budget/categories`, { name: "Venue" });
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is a viewer", async () => {
      const viewerMember = { ...MEMBER_ROW, role: "viewer" };
      const db = makeDb([[viewerMember]]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/budget/categories`, { name: "Venue" });
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/budget/categories`, { name: "" });
      expect(res.status).toBe(400);
    });

    it("creates a category and returns 201", async () => {
      const db = makeDb([[MEMBER_ROW]], [CATEGORY_ROW]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/budget/categories`, {
        name: "Photography",
        estimatedCents: 500000,
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { name: string };
      expect(body.name).toBe("Photography");
    });

    it("allows editor to create a category", async () => {
      const editorMember = { ...MEMBER_ROW, role: "editor" };
      const db = makeDb([[editorMember]], [CATEGORY_ROW]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/budget/categories`, {
        name: "Photography",
      });
      expect(res.status).toBe(201);
    });
  });

  describe("PATCH /weddings/:weddingId/budget/categories/:categoryId", () => {
    it("returns 403 when user is a viewer", async () => {
      const viewerMember = { ...MEMBER_ROW, role: "viewer" };
      const db = makeDb([[viewerMember]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "PATCH",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}`,
        { name: "Updated" }
      );
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "PATCH",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}`,
        { estimatedCents: -1 }
      );
      expect(res.status).toBe(400);
    });

    it("updates a category and returns 200", async () => {
      const updated = { ...CATEGORY_ROW, name: "Updated" };
      const db = makeDb([[MEMBER_ROW]], [updated]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "PATCH",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}`,
        { name: "Updated" }
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { name: string };
      expect(body.name).toBe("Updated");
    });
  });

  describe("DELETE /weddings/:weddingId/budget/categories/:categoryId", () => {
    it("returns 403 when user is a viewer", async () => {
      const viewerMember = { ...MEMBER_ROW, role: "viewer" };
      const db = makeDb([[viewerMember]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "DELETE",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}`
      );
      expect(res.status).toBe(403);
    });

    it("deletes a category and returns 204", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "DELETE",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}`
      );
      expect(res.status).toBe(204);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — Items
// ---------------------------------------------------------------------------

describe("budgetRoutes — items", () => {
  describe("GET /weddings/:weddingId/budget/categories/:categoryId/items", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb([]);
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(
        app, "GET",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}/items`
      );
      expect(res.status).toBe(401);
    });

    it("returns items for a category", async () => {
      const db = makeDb([[MEMBER_ROW], [ITEM_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "GET",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}/items`
      );
      expect(res.status).toBe(200);
      const body = await res.json() as unknown[];
      expect(body).toHaveLength(1);
    });
  });

  describe("POST /weddings/:weddingId/budget/categories/:categoryId/items", () => {
    it("returns 403 when user is a viewer", async () => {
      const viewerMember = { ...MEMBER_ROW, role: "viewer" };
      const db = makeDb([[viewerMember]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "POST",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}/items`,
        { name: "DJ" }
      );
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "POST",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}/items`,
        { name: "" }
      );
      expect(res.status).toBe(400);
    });

    it("creates an item and returns 201", async () => {
      const db = makeDb([[MEMBER_ROW]], [ITEM_ROW]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "POST",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}/items`,
        { name: "Jane Doe Photography", estimatedCents: 500000 }
      );
      expect(res.status).toBe(201);
      const body = await res.json() as { name: string };
      expect(body.name).toBe("Jane Doe Photography");
    });
  });

  describe("PATCH /weddings/:weddingId/budget/categories/:categoryId/items/:itemId", () => {
    it("returns 403 when user is a viewer", async () => {
      const viewerMember = { ...MEMBER_ROW, role: "viewer" };
      const db = makeDb([[viewerMember]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "PATCH",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}/items/${ITEM_ROW.id}`,
        { quotedCents: 400000 }
      );
      expect(res.status).toBe(403);
    });

    it("updates an item and returns 200", async () => {
      const updated = { ...ITEM_ROW, quotedCents: 400000 };
      const db = makeDb([[MEMBER_ROW]], [updated]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "PATCH",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}/items/${ITEM_ROW.id}`,
        { quotedCents: 400000 }
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { quotedCents: number };
      expect(body.quotedCents).toBe(400000);
    });
  });

  describe("DELETE /weddings/:weddingId/budget/categories/:categoryId/items/:itemId", () => {
    it("returns 403 when user is a viewer", async () => {
      const viewerMember = { ...MEMBER_ROW, role: "viewer" };
      const db = makeDb([[viewerMember]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "DELETE",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}/items/${ITEM_ROW.id}`
      );
      expect(res.status).toBe(403);
    });

    it("deletes an item and returns 204", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app, "DELETE",
        `/weddings/${WEDDING_ID}/budget/categories/${CATEGORY_ROW.id}/items/${ITEM_ROW.id}`
      );
      expect(res.status).toBe(204);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — Summary
// ---------------------------------------------------------------------------

describe("budgetRoutes — summary", () => {
  describe("GET /weddings/:weddingId/budget/summary", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb([]);
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/budget/summary`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member", async () => {
      const db = makeDb([[]]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/budget/summary`);
      expect(res.status).toBe(403);
    });

    it("returns summary with zeros when no categories exist", async () => {
      const weddingRow = { budgetCents: 3000000 };
      // select 1: member check, select 2: wedding row, select 3: categories
      const db = makeDb([[MEMBER_ROW], [weddingRow], []]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/budget/summary`);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        totalBudgetCents: number;
        totalEstimatedCents: number;
        totalQuotedCents: number;
        totalPaidCents: number;
        unallocatedCents: number;
        categories: unknown[];
      };
      expect(body.totalBudgetCents).toBe(3000000);
      expect(body.totalEstimatedCents).toBe(0);
      expect(body.totalQuotedCents).toBe(0);
      expect(body.totalPaidCents).toBe(0);
      expect(body.unallocatedCents).toBe(3000000);
      expect(body.categories).toHaveLength(0);
    });

    it("returns summary with correct aggregation", async () => {
      const weddingRow = { budgetCents: 3000000 };
      const catSummary = {
        id: CATEGORY_ROW.id,
        name: "Photography",
        estimatedCents: 500000,
        totalItemEstimatedCents: 500000,
        totalQuotedCents: 420000,
        totalPaidCents: 150000,
        itemCount: 1,
      };
      const db = makeDb([[MEMBER_ROW], [weddingRow], [catSummary]]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/budget/summary`);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        totalBudgetCents: number;
        totalEstimatedCents: number;
        totalQuotedCents: number;
        totalPaidCents: number;
        unallocatedCents: number;
        categories: Array<{ name: string; totalQuotedCents: number }>;
      };
      expect(body.totalBudgetCents).toBe(3000000);
      expect(body.totalEstimatedCents).toBe(500000);
      expect(body.totalQuotedCents).toBe(420000);
      expect(body.totalPaidCents).toBe(150000);
      expect(body.unallocatedCents).toBe(2500000);
      expect(body.categories).toHaveLength(1);
      expect(body.categories[0].name).toBe("Photography");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kaiplan/api test -- __tests__/routes/budget.test.ts`
Expected: FAIL — module `../../src/routes/budget` not found

- [ ] **Step 3: Implement budget routes**

```typescript
// apps/api/src/routes/budget.ts
import { Hono } from "hono";
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
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

export function budgetRoutes(db: Database, auth: Auth) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  // Reusable role guard for write operations
  function requireWriter(c: { get: (key: "weddingRole") => string; json: (body: unknown, status: number) => Response }) {
    const role = c.get("weddingRole");
    if (role === "viewer") {
      return c.json({ error: "Viewers cannot modify budget" }, 403);
    }
    return null;
  }

  // --- Categories ---

  // List categories with aggregated item totals
  app.get("/:weddingId/budget/categories", requireSession, requireWeddingAccess, async (c) => {
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
        totalItemEstimatedCents: sql<number>`coalesce(sum(${budgetItem.estimatedCents}), 0)`,
        totalQuotedCents: sql<number>`coalesce(sum(${budgetItem.quotedCents}), 0)`,
        totalPaidCents: sql<number>`coalesce(sum(${budgetItem.paidCents}), 0)`,
        itemCount: sql<number>`count(${budgetItem.id})`,
      })
      .from(budgetCategory)
      .leftJoin(budgetItem, eq(budgetItem.categoryId, budgetCategory.id))
      .where(eq(budgetCategory.weddingId, weddingId))
      .groupBy(budgetCategory.id)
      .orderBy(budgetCategory.sortOrder);

    return c.json(rows);
  });

  // Create category
  app.post("/:weddingId/budget/categories", requireSession, requireWeddingAccess, async (c) => {
    const blocked = requireWriter(c);
    if (blocked) return blocked;

    const weddingId = c.req.param("weddingId");
    const body = await c.req.json();
    const parsed = createBudgetCategorySchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [created] = await db
      .insert(budgetCategory)
      .values({
        weddingId,
        name: parsed.data.name,
        estimatedCents: parsed.data.estimatedCents,
      })
      .returning();

    return c.json(created, 201);
  });

  // Update category
  app.patch("/:weddingId/budget/categories/:categoryId", requireSession, requireWeddingAccess, async (c) => {
    const blocked = requireWriter(c);
    if (blocked) return blocked;

    const weddingId = c.req.param("weddingId");
    const categoryId = c.req.param("categoryId");
    const body = await c.req.json();
    const parsed = updateBudgetCategorySchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [updated] = await db
      .update(budgetCategory)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(budgetCategory.id, categoryId), eq(budgetCategory.weddingId, weddingId)))
      .returning();

    return c.json(updated);
  });

  // Delete category
  app.delete("/:weddingId/budget/categories/:categoryId", requireSession, requireWeddingAccess, async (c) => {
    const blocked = requireWriter(c);
    if (blocked) return blocked;

    const weddingId = c.req.param("weddingId");
    const categoryId = c.req.param("categoryId");

    await db
      .delete(budgetCategory)
      .where(and(eq(budgetCategory.id, categoryId), eq(budgetCategory.weddingId, weddingId)));

    return c.body(null, 204);
  });

  // --- Items ---

  // List items in a category
  app.get("/:weddingId/budget/categories/:categoryId/items", requireSession, requireWeddingAccess, async (c) => {
    const categoryId = c.req.param("categoryId");
    const weddingId = c.req.param("weddingId");

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
      .innerJoin(budgetCategory, eq(budgetItem.categoryId, budgetCategory.id))
      .where(and(eq(budgetItem.categoryId, categoryId), eq(budgetCategory.weddingId, weddingId)))
      .orderBy(budgetItem.sortOrder);

    return c.json(rows);
  });

  // Create item
  app.post("/:weddingId/budget/categories/:categoryId/items", requireSession, requireWeddingAccess, async (c) => {
    const blocked = requireWriter(c);
    if (blocked) return blocked;

    const categoryId = c.req.param("categoryId");
    const body = await c.req.json();
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
  });

  // Update item
  app.patch("/:weddingId/budget/categories/:categoryId/items/:itemId", requireSession, requireWeddingAccess, async (c) => {
    const blocked = requireWriter(c);
    if (blocked) return blocked;

    const itemId = c.req.param("itemId");
    const body = await c.req.json();
    const parsed = updateBudgetItemSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [updated] = await db
      .update(budgetItem)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(budgetItem.id, itemId))
      .returning();

    return c.json(updated);
  });

  // Delete item
  app.delete("/:weddingId/budget/categories/:categoryId/items/:itemId", requireSession, requireWeddingAccess, async (c) => {
    const blocked = requireWriter(c);
    if (blocked) return blocked;

    const itemId = c.req.param("itemId");

    await db.delete(budgetItem).where(eq(budgetItem.id, itemId));

    return c.body(null, 204);
  });

  // --- Summary ---

  app.get("/:weddingId/budget/summary", requireSession, requireWeddingAccess, async (c) => {
    const weddingId = c.req.param("weddingId");

    // Get wedding total budget
    const [weddingRow] = await db
      .select({ budgetCents: wedding.budgetCents })
      .from(wedding)
      .where(eq(wedding.id, weddingId))
      .limit(1);

    const totalBudgetCents = weddingRow?.budgetCents ?? 0;

    // Get categories with aggregated item totals
    const categories = await db
      .select({
        id: budgetCategory.id,
        name: budgetCategory.name,
        estimatedCents: budgetCategory.estimatedCents,
        totalItemEstimatedCents: sql<number>`coalesce(sum(${budgetItem.estimatedCents}), 0)`,
        totalQuotedCents: sql<number>`coalesce(sum(${budgetItem.quotedCents}), 0)`,
        totalPaidCents: sql<number>`coalesce(sum(${budgetItem.paidCents}), 0)`,
        itemCount: sql<number>`count(${budgetItem.id})`,
      })
      .from(budgetCategory)
      .leftJoin(budgetItem, eq(budgetItem.categoryId, budgetCategory.id))
      .where(eq(budgetCategory.weddingId, weddingId))
      .groupBy(budgetCategory.id)
      .orderBy(budgetCategory.sortOrder);

    const totalEstimatedCents = categories.reduce((sum, c) => sum + Number(c.estimatedCents), 0);
    const totalQuotedCents = categories.reduce((sum, c) => sum + Number(c.totalQuotedCents), 0);
    const totalPaidCents = categories.reduce((sum, c) => sum + Number(c.totalPaidCents), 0);
    const unallocatedCents = totalBudgetCents - totalEstimatedCents;

    return c.json({
      totalBudgetCents,
      totalEstimatedCents,
      totalQuotedCents,
      totalPaidCents,
      unallocatedCents,
      categories,
    });
  });

  return app;
}
```

- [ ] **Step 4: Mount budget routes in index.ts**

Add to `apps/api/src/index.ts` — after the weddings route block, add:

```typescript
app.route(
  "/api/weddings",
  (() => {
    const router = new Hono<{ Bindings: Env }>();
    router.all("/:weddingId/budget/*", (c) => {
      const db = createDb(c.env.HYPERDRIVE.connectionString);
      const auth = createAuth(db, c.env);
      const routes = budgetRoutes(db, auth);
      return routes.fetch(c.req.raw, c.env);
    });
    return router;
  })()
);
```

Also add the import at the top:

```typescript
import { budgetRoutes } from "./routes/budget";
```

**Routing conflict resolution:** The existing code mounts weddings at `/api/weddings` with a catch-all `/*`. Budget routes also live under `/api/weddings/:weddingId/budget/*`. Place the budget route block **before** the weddings block in `index.ts` so the more specific `/budget/*` paths match first. Both blocks use the same pattern (create db/auth per-request, delegate to sub-router). If Hono's routing doesn't distinguish them correctly, the fallback is to merge both into a single router function that creates the sub-routers and mounts them on the same Hono instance. The implementer must verify the chosen approach by running both the budget and wedding test suites.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @kaiplan/api test -- __tests__/routes/budget.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Run full API test suite and coverage**

Run: `pnpm --filter @kaiplan/api test:coverage`
Expected: PASS with ≥95% coverage on `routes/budget.ts`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/budget.ts apps/api/src/index.ts apps/api/__tests__/routes/budget.test.ts
git commit -m "feat(api): add budget category, item, and summary API routes"
```

---

## Task 4: Frontend Test Infrastructure

**Files:**
- Modify: `apps/app/package.json` (add devDependencies)
- Create: `apps/app/vitest.config.ts`
- Create: `apps/app/__tests__/setup.ts`

No test code yet — this task sets up the test runner so subsequent tasks can write tests.

- [ ] **Step 1: Install testing dependencies**

Run:
```bash
pnpm --filter @kaiplan/app add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/coverage-v8
```

- [ ] **Step 2: Create vitest config**

```typescript
// apps/app/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/routes/**/*.tsx",
        "src/components/ui/**/*.tsx",
        "src/main.tsx",
        "src/routeTree.gen.ts",
        "src/lib/auth-client.ts",
        "src/lib/query-client.ts",
        "src/lib/utils.ts",
      ],
      thresholds: {
        perFile: true,
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
```

- [ ] **Step 3: Create test setup file**

```typescript
// apps/app/__tests__/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test scripts to package.json**

Add to `apps/app/package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 5: Verify vitest runs (no tests yet is OK)**

Run: `pnpm --filter @kaiplan/app test`
Expected: Exits with "No test files found" or similar — confirms the runner works.

- [ ] **Step 6: Commit**

```bash
git add apps/app/vitest.config.ts apps/app/__tests__/setup.ts apps/app/package.json pnpm-lock.yaml
git commit -m "chore(app): set up Vitest + Testing Library for frontend tests"
```

---

## Task 5: Money Formatting Utility

**Files:**
- Create: `apps/app/src/lib/format-money.ts`
- Test: `apps/app/__tests__/lib/format-money.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/app/__tests__/lib/format-money.test.ts
import { describe, it, expect } from "vitest";
import { formatMoney } from "../../src/lib/format-money";

describe("formatMoney", () => {
  it("formats cents to dollars with currency symbol", () => {
    expect(formatMoney(500000, "USD")).toBe("$5,000.00");
  });

  it("formats zero cents", () => {
    expect(formatMoney(0, "USD")).toBe("$0.00");
  });

  it("formats cents with fractional dollars", () => {
    expect(formatMoney(420050, "USD")).toBe("$4,200.50");
  });

  it("formats single cent", () => {
    expect(formatMoney(1, "USD")).toBe("$0.01");
  });

  it("formats large amounts", () => {
    expect(formatMoney(999999999, "USD")).toBe("$9,999,999.99");
  });

  it("defaults currency to USD", () => {
    expect(formatMoney(100)).toBe("$1.00");
  });

  it("formats EUR currency", () => {
    const result = formatMoney(500000, "EUR");
    expect(result).toContain("5,000");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kaiplan/app test -- __tests__/lib/format-money.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement formatMoney**

```typescript
// apps/app/src/lib/format-money.ts
export function formatMoney(cents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kaiplan/app test -- __tests__/lib/format-money.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/format-money.ts apps/app/__tests__/lib/format-money.test.ts
git commit -m "feat(app): add formatMoney utility for cents-to-currency formatting"
```

---

## Task 6: TanStack Query Hooks

**Files:**
- Create: `apps/app/src/hooks/use-budget.ts`
- Test: `apps/app/__tests__/hooks/use-budget.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/app/__tests__/hooks/use-budget.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useBudgetSummary, useBudgetCategories, useBudgetItems } from "../../src/hooks/use-budget";

// Mock apiFetch
vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useBudgetSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches budget summary for a wedding", async () => {
    const summary = {
      totalBudgetCents: 3000000,
      totalEstimatedCents: 500000,
      totalQuotedCents: 420000,
      totalPaidCents: 150000,
      unallocatedCents: 2500000,
      categories: [],
    };
    mockedApiFetch.mockResolvedValue(summary);

    const { result } = renderHook(
      () => useBudgetSummary("wedding-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(summary);
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/weddings/wedding-1/budget/summary");
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue({});

    renderHook(
      () => useBudgetSummary(null),
      { wrapper: createWrapper() }
    );

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("useBudgetCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches categories for a wedding", async () => {
    const categories = [{ id: "cat-1", name: "Photography" }];
    mockedApiFetch.mockResolvedValue(categories);

    const { result } = renderHook(
      () => useBudgetCategories("wedding-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(categories);
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/weddings/wedding-1/budget/categories");
  });
});

describe("useBudgetItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches items for a category", async () => {
    const items = [{ id: "item-1", name: "Photographer" }];
    mockedApiFetch.mockResolvedValue(items);

    const { result } = renderHook(
      () => useBudgetItems("wedding-1", "cat-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(items);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/categories/cat-1/items"
    );
  });

  it("does not fetch when categoryId is null", () => {
    mockedApiFetch.mockResolvedValue([]);

    renderHook(
      () => useBudgetItems("wedding-1", null),
      { wrapper: createWrapper() }
    );

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kaiplan/app test -- __tests__/hooks/use-budget.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement hooks**

```typescript
// apps/app/src/hooks/use-budget.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  BudgetSummary,
  BudgetCategoryWithTotals,
  BudgetItem,
  CreateBudgetCategoryInput,
  UpdateBudgetCategoryInput,
  CreateBudgetItemInput,
  UpdateBudgetItemInput,
} from "@kaiplan/shared";

export function useBudgetSummary(weddingId: string | null) {
  return useQuery<BudgetSummary>({
    queryKey: ["budget-summary", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/budget/summary`),
    enabled: !!weddingId,
  });
}

export function useBudgetCategories(weddingId: string | null) {
  return useQuery<BudgetCategoryWithTotals[]>({
    queryKey: ["budget-categories", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/budget/categories`),
    enabled: !!weddingId,
  });
}

export function useBudgetItems(weddingId: string | null, categoryId: string | null) {
  return useQuery<BudgetItem[]>({
    queryKey: ["budget-items", weddingId, categoryId],
    queryFn: () =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories/${categoryId}/items`),
    enabled: !!weddingId && !!categoryId,
  });
}

export function useCreateCategory(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBudgetCategoryInput) =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-categories", weddingId] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary", weddingId] });
    },
  });
}

export function useUpdateCategory(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, data }: { categoryId: string; data: UpdateBudgetCategoryInput }) =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories/${categoryId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-categories", weddingId] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary", weddingId] });
    },
  });
}

export function useDeleteCategory(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories/${categoryId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-categories", weddingId] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary", weddingId] });
    },
  });
}

export function useCreateItem(weddingId: string, categoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBudgetItemInput) =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories/${categoryId}/items`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-items", weddingId, categoryId] });
      queryClient.invalidateQueries({ queryKey: ["budget-categories", weddingId] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary", weddingId] });
    },
  });
}

export function useUpdateItem(weddingId: string, categoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: UpdateBudgetItemInput }) =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories/${categoryId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-items", weddingId, categoryId] });
      queryClient.invalidateQueries({ queryKey: ["budget-categories", weddingId] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary", weddingId] });
    },
  });
}

export function useDeleteItem(weddingId: string, categoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories/${categoryId}/items/${itemId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-items", weddingId, categoryId] });
      queryClient.invalidateQueries({ queryKey: ["budget-categories", weddingId] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary", weddingId] });
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kaiplan/app test -- __tests__/hooks/use-budget.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/hooks/use-budget.ts apps/app/__tests__/hooks/use-budget.test.ts
git commit -m "feat(app): add TanStack Query hooks for budget data"
```

---

## Task 7: Shadcn UI Components (Sheet + Progress)

**Files:**
- Create: `apps/app/src/components/ui/sheet.tsx`
- Create: `apps/app/src/components/ui/progress.tsx`

These are Shadcn/UI component installs. No custom tests — they're excluded from coverage via the vitest config `exclude: ["src/components/ui/**/*.tsx"]`.

- [ ] **Step 1: Install Sheet dependencies**

Run: `pnpm --filter @kaiplan/app add @radix-ui/react-dialog` (already installed, verify)

Check if `@radix-ui/react-dialog` is already in `apps/app/package.json` dependencies. If yes, skip.

- [ ] **Step 2: Add Sheet component**

Use `npx shadcn@latest add sheet` if available in the project, or manually create:

```bash
cd apps/app && npx shadcn@latest add sheet
```

If the CLI doesn't work, create `apps/app/src/components/ui/sheet.tsx` following the Shadcn Sheet component source (New York style). The implementer should use the Shadcn CLI or Context7 docs to get the exact component code.

- [ ] **Step 3: Install Progress dependencies and add component**

```bash
cd apps/app && npx shadcn@latest add progress
```

If the CLI doesn't work, install `@radix-ui/react-progress` and create the component manually.

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm --filter @kaiplan/app typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/ui/sheet.tsx apps/app/src/components/ui/progress.tsx apps/app/package.json pnpm-lock.yaml
git commit -m "chore(app): add Shadcn Sheet and Progress UI components"
```

---

## Task 8: Budget UI Components

**Files:**
- Create: `apps/app/src/components/budget/budget-summary-bar.tsx`
- Create: `apps/app/src/components/budget/budget-category-card.tsx`
- Create: `apps/app/src/components/budget/budget-category-grid.tsx`
- Create: `apps/app/src/components/budget/budget-category-panel.tsx`
- Create: `apps/app/src/components/budget/budget-item-form.tsx`
- Create: `apps/app/src/components/budget/budget-category-form.tsx`
- Create: `apps/app/src/components/budget/budget-widget.tsx`
- Test: `apps/app/__tests__/components/budget/budget-summary-bar.test.tsx`
- Test: `apps/app/__tests__/components/budget/budget-category-card.test.tsx`
- Test: `apps/app/__tests__/components/budget/budget-category-panel.test.tsx`
- Test: `apps/app/__tests__/components/budget/budget-item-form.test.tsx`
- Test: `apps/app/__tests__/components/budget/budget-category-form.test.tsx`
- Test: `apps/app/__tests__/components/budget/budget-widget.test.tsx`

This is the largest frontend task. The implementer should build each component with its test, one at a time, following TDD. The components use the Kaiplan design system (Shadcn/UI, brand tokens, Tailwind 4). Consult `.impeccable.md` for design tokens and component conventions.

**Key design references:**
- Spec: `docs/design-docs/specs/2026-04-07-budget-ledger-design.md` — Section 3 (Frontend)
- Design system: `.impeccable.md`
- Existing components: `apps/app/src/components/module-card.tsx` (for card styling patterns), `apps/app/src/components/top-bar.tsx` (for layout patterns)

**Implementation order within this task:**
1. `BudgetSummaryBar` — pure display component, easiest to test
2. `BudgetCategoryCard` — pure display component with progress bar
3. `BudgetCategoryGrid` — layout wrapper for cards
4. `BudgetItemForm` — form with money inputs
5. `BudgetCategoryForm` — dialog form for creating categories
6. `BudgetCategoryPanel` — Sheet with items table (composes ItemForm)
7. `BudgetWidget` — dashboard summary (composes SummaryBar patterns)

Each component should be built with its corresponding test file. Tests should cover:
- Rendering with props
- Empty states
- User interactions (clicks, form submissions)
- Conditional rendering (e.g., viewer vs editor)

The implementer should read `.impeccable.md` and existing component files before building these to match the design system. Use `formatMoney` from Task 5 for all money display. Use hooks from Task 6 for data fetching in `BudgetCategoryPanel` and `BudgetWidget`.

**Due to the size of this task, the implementer has latitude to decompose it into sub-commits per component pair (component + test). Each component commit should leave the build passing.**

- [ ] **Step 1: Build and test BudgetSummaryBar**

Build `budget-summary-bar.tsx` and `budget-summary-bar.test.tsx`. The component receives `BudgetSummary` data as props and displays: total budget, total quoted, total paid, remaining (totalBudgetCents - totalPaidCents), and unallocated. Use `formatMoney` for display.

Test: renders all stat values, handles zero state.

- [ ] **Step 2: Build and test BudgetCategoryCard**

Build `budget-category-card.tsx` and `budget-category-card.test.tsx`. Receives `BudgetCategoryWithTotals` as props. Shows name, progress bar (totalQuotedCents / estimatedCents), and formatted label. Click handler prop for opening the panel.

Test: renders name, progress bar percentage, click fires handler.

- [ ] **Step 3: Build and test BudgetCategoryGrid**

Build `budget-category-grid.tsx`. Layout wrapper: responsive grid (1 col mobile, 2 col sm+) rendering `BudgetCategoryCard` for each category plus an "Add category" card. No separate test needed if it's a thin layout wrapper — coverage comes from the parent route test or integration test.

- [ ] **Step 4: Build and test BudgetItemForm**

Build `budget-item-form.tsx` and `budget-item-form.test.tsx`. Inline form with fields: name (text input), estimated/quoted/paid (number inputs accepting dollar values), notes (textarea). On submit, converts dollars to cents and calls the mutation. Cancel button to close.

Test: renders all fields, submits with converted cents, validates required name.

- [ ] **Step 5: Build and test BudgetCategoryForm**

Build `budget-category-form.tsx` and `budget-category-form.test.tsx`. Shadcn Dialog with fields: name, estimated budget (dollar input). Used for both create and edit (pass initial values for edit mode).

Test: renders in create mode (empty fields), renders in edit mode (pre-filled), submits correct values.

- [ ] **Step 6: Build and test BudgetCategoryPanel**

Build `budget-category-panel.tsx` and `budget-category-panel.test.tsx`. Shadcn Sheet that slides from right. Shows category header (name, budget, quoted/paid stats), items table, add item button. Uses `useBudgetItems` hook to fetch items. Edit/delete item via overflow menu.

Test: renders category name, renders items list, shows empty state when no items, shows add button.

- [ ] **Step 7: Build and test BudgetWidget**

Build `budget-widget.tsx` and `budget-widget.test.tsx`. Dashboard widget showing: header with "Budget" + "View all →" link, quoted/paid stat cards, overall progress bar, top category list with mini progress bars. Uses `useBudgetSummary` hook. Shows empty state when no categories.

Test: renders stats, renders category list, shows empty state, link points to `/budget`.

- [ ] **Step 8: Run full frontend test suite and coverage**

Run: `pnpm --filter @kaiplan/app test:coverage`
Expected: PASS with ≥95% coverage on all budget component files

- [ ] **Step 9: Commit**

```bash
git add apps/app/src/components/budget/ apps/app/__tests__/components/budget/
git commit -m "feat(app): add budget UI components with tests"
```

---

## Task 9: Wire Up Routes

**Files:**
- Modify: `apps/app/src/routes/_authenticated/budget.tsx`
- Modify: `apps/app/src/routes/_authenticated/dashboard.tsx`

Route components are excluded from coverage, so no test files.

- [ ] **Step 1: Replace budget page placeholder**

Replace the contents of `apps/app/src/routes/_authenticated/budget.tsx` with the real budget page that composes `BudgetSummaryBar`, `BudgetCategoryGrid`, and `BudgetCategoryPanel`. Uses `useActiveWedding` to get the current wedding ID, `useBudgetSummary` and `useBudgetCategories` for data. State for selected category (panel open/close).

The page should:
- Get `activeWeddingId` from `useActiveWedding()`
- Resolve to first wedding if no active wedding (same pattern as dashboard)
- Show `BudgetSummaryBar` at top
- Show `BudgetCategoryGrid` below
- Show `BudgetCategoryPanel` when a category is selected
- Show `BudgetCategoryForm` dialog when "Add category" is clicked
- Show empty state when no categories exist (wallet icon + "Create your first budget category" CTA)
- Include `TopBar` at top (same as dashboard)

- [ ] **Step 2: Replace dashboard budget card with BudgetWidget**

In `apps/app/src/routes/_authenticated/dashboard.tsx`:
- Replace the Budget `ModuleCard` (the one with `comingSoon`) with `<BudgetWidget weddingId={resolvedWeddingId} />`
- Import `BudgetWidget` from `../../components/budget/budget-widget`
- Remove the `Wallet` import from lucide-react (BudgetWidget handles its own icon)
- Keep the other three `ModuleCard` components (Guest List, Vendors, Seating) as "coming soon"

- [ ] **Step 3: Verify the app builds**

Run: `pnpm --filter @kaiplan/app build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Run typecheck across all packages**

Run: `turbo typecheck`
Expected: All packages pass

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/routes/_authenticated/budget.tsx apps/app/src/routes/_authenticated/dashboard.tsx
git commit -m "feat(app): wire up budget page and dashboard widget"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run all tests across all packages**

Run: `turbo test:coverage`
Expected: All packages PASS with ≥95% per-file coverage

- [ ] **Step 2: Run typecheck across all packages**

Run: `turbo typecheck`
Expected: All packages pass

- [ ] **Step 3: Build all packages**

Run: `turbo build`
Expected: All packages build successfully

- [ ] **Step 4: Manual smoke test**

Run: `turbo dev`

Verify in browser at `http://localhost:5173` (or configured port):
1. Login and select a wedding
2. Dashboard shows BudgetWidget (empty state initially)
3. Navigate to Budget page via sidebar
4. Create a budget category
5. Open category via card click → slide-over panel appears
6. Add a line item with estimated/quoted/paid amounts
7. Close panel → card shows updated progress bar
8. Return to dashboard → widget shows category with progress
9. Verify summary numbers (total quoted, paid, remaining, unallocated) are correct

- [ ] **Step 5: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
