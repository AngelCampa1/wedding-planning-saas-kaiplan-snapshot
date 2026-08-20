# Phase 1: Budget Ledger — Design Spec

Couples track real vendor quotes against their budget — not estimates. The headline differentiator for Kaiplan.

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Categories | Fully custom CRUD (no presets) | Couples have different spending categories |
| Dashboard widget | Headline numbers + category breakdown with progress bars | At-a-glance "where is my money going" |
| Line item status | Implicit from amounts (no status enum) | Less clicking, same information — estimated/quoted/paid is derivable |
| Category-level budget | Yes, each category has an allocated estimated budget | Natural mental model: "we want to spend $X on catering" |
| Total budget | Top-down (set on wedding, not sum of categories) | Couples start with "we have $30k" then allocate. Shows unallocated. |
| Architecture | Flat CRUD with aggregation queries (Approach A) | Single source of truth, no sync bugs, trivial at wedding scale (~30-50 items) |
| Budget page layout | Card grid with slide-over panel | Cards for category overview, slide-over for item detail |
| Category detail view | Slide-over panel (Shadcn Sheet) | App-like feel, keeps spatial context of the grid |
| Dashboard widget style | Compact stats + category list | Information-dense, scannable, per-category progress bars |
| Frontend testing | Vitest + Testing Library for components/hooks/utils | 95% per-file coverage on non-route frontend code |

---

## Data Model

Two new tables, both scoped to a wedding via foreign keys.

### `budget_category`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, auto-generated |
| `wedding_id` | uuid | FK → `wedding.id`, cascade delete, not null |
| `name` | text | 1-200 chars, not null |
| `estimated_cents` | integer | min 0, max 999,999,999, not null, default 0 |
| `sort_order` | integer | not null, default 0 |
| `created_at` | timestamptz | not null, default now |
| `updated_at` | timestamptz | not null, default now |

**Unique constraint:** `(wedding_id, name)` — no duplicate category names within a wedding.

### `budget_item`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, auto-generated |
| `category_id` | uuid | FK → `budget_category.id`, cascade delete, not null |
| `name` | text | 1-200 chars, not null |
| `estimated_cents` | integer | min 0, max 999,999,999, not null, default 0 |
| `quoted_cents` | integer | min 0, max 999,999,999, not null, default 0 |
| `paid_cents` | integer | min 0, max 999,999,999, not null, default 0 |
| `notes` | text | max 1000 chars, nullable |
| `sort_order` | integer | not null, default 0 |
| `created_at` | timestamptz | not null, default now |
| `updated_at` | timestamptz | not null, default now |

### Aggregation Logic

All totals are computed at query time via SQL `SUM()`. No cached/denormalized totals.

- **Category totals:** `SUM(estimated_cents)`, `SUM(quoted_cents)`, `SUM(paid_cents)` from items in that category
- **Wedding totals:** Sum across all categories' items
- **Unallocated:** `wedding.budgetCents - SUM(budget_category.estimated_cents)`
- **Over/under per category:** `budget_category.estimated_cents - SUM(budget_item.quoted_cents)`

### Existing Schema

The `wedding` table already has `budgetCents` (integer, default 0) and `currency` (text, default "USD"). These serve as the top-down total budget. No schema changes to the `wedding` table are needed.

---

## API Design

All routes nested under `/api/weddings/:weddingId/budget`. Uses the existing `sessionMiddleware` → `weddingAccessMiddleware` chain.

### Role Enforcement

- `viewer` → GET endpoints only
- `editor` / `owner` → full CRUD

### Category Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/budget/categories` | List all categories with aggregated item totals (returns `Array<{ id, name, estimatedCents, sortOrder, totalItemEstimatedCents, totalQuotedCents, totalPaidCents, itemCount }>`) |
| `POST` | `/budget/categories` | Create a category (returns created category) |
| `PATCH` | `/budget/categories/:categoryId` | Update name, estimated budget, sort order (returns updated category) |
| `DELETE` | `/budget/categories/:categoryId` | Delete category and its items (returns 204) |

### Item Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/budget/categories/:categoryId/items` | List items in a category |
| `POST` | `/budget/categories/:categoryId/items` | Create an item |
| `PATCH` | `/budget/categories/:categoryId/items/:itemId` | Update item fields |
| `DELETE` | `/budget/categories/:categoryId/items/:itemId` | Delete item |

### Summary Endpoint

| Method | Path | Description |
|---|---|---|
| `GET` | `/budget/summary` | Wedding-level totals + per-category breakdown with aggregated totals |

The summary endpoint powers both the dashboard widget and the budget page header. Single query returning:

```typescript
{
  totalBudgetCents: number;
  totalEstimatedCents: number;
  totalQuotedCents: number;
  totalPaidCents: number;
  unallocatedCents: number;
  categories: Array<{
    id: string;
    name: string;
    estimatedCents: number;
    totalQuotedCents: number;
    totalPaidCents: number;
    itemCount: number;
  }>;
}
```

### Validation (Zod Schemas in `@kaiplan/shared`)

```typescript
// Create category
{ name: string (1-200), estimatedCents: int (0-999999999) }

// Update category
{ name?: string (1-200), estimatedCents?: int (0-999999999), sortOrder?: int }

// Create item
{ name: string (1-200), estimatedCents?: int, quotedCents?: int, paidCents?: int, notes?: string (0-1000) }

// Update item
{ name?: string, estimatedCents?: int, quotedCents?: int, paidCents?: int, notes?: string, sortOrder?: int }
```

### Request Flow

```
Client → GET /api/weddings/:weddingId/budget/summary
       → sessionMiddleware (validates auth, sets c.user)
       → weddingAccessMiddleware (validates membership, sets c.weddingRole)
       → budget route handler (queries with wedding_id scope)
       → JSON response
```

---

## Frontend

### Budget Page (`/_authenticated/budget`)

**Layout:** Summary bar at top → category card grid below → slide-over panel for category detail.

**Components:**

- **`BudgetSummaryBar`** — Displays total budget, total quoted, total paid, remaining, unallocated. Horizontal stat cards with overall progress bar. Consumes `/budget/summary` data.

- **`BudgetCategoryGrid`** — Responsive grid of `BudgetCategoryCard` components plus an "Add category" card (dashed border). Grid columns: 1 on mobile, 2 on sm+.

- **`BudgetCategoryCard`** — Shows category name, progress bar (quoted vs estimated budget), and "quoted / budget" label. Click opens slide-over panel.

- **`BudgetCategoryPanel`** — Shadcn `Sheet` component, slides in from the right. Contains:
  - Category header: name, estimated budget, aggregated quoted/paid stats
  - Inline edit for category name and budget
  - Line items table: name, estimated, quoted, paid columns, overflow menu (edit, delete) per row
  - "Add item" button at bottom
  - Delete category button in header overflow menu

- **`BudgetItemForm`** — Inline form within the panel for creating/editing items. Fields: name, estimated, quoted, paid, notes. Money inputs accept dollar values (e.g. "4200.50"), convert to cents on submit.

- **`BudgetCategoryForm`** — Shadcn Dialog for creating a new category. Fields: name, estimated budget.

**Money formatting:** `Intl.NumberFormat` with the wedding's currency. Input accepts decimal dollars, stored and transmitted as integer cents. A shared `formatMoney(cents, currency)` utility in the app.

### Dashboard Widget

**`BudgetWidget`** — Replaces the "coming soon" `ModuleCard` on the dashboard. Contains:
- Header: "Budget" title + "View all →" link to `/budget`
- Stat cards: total quoted, total paid
- Overall progress bar with percentage
- Top categories list with mini progress bars (quoted vs budget per category)
- Consumes the same `/budget/summary` endpoint

### Empty States

- **No categories:** Centered message with wallet icon + "Create your first budget category" CTA button
- **Category with no items:** "No items yet" message + "Add your first item" button inside the slide-over panel

### Data Fetching

- `useBudgetSummary(weddingId)` — TanStack Query hook for the summary endpoint
- `useBudgetCategories(weddingId)` — query for category list (used by the grid)
- `useBudgetItems(categoryId)` — query for items within a category (used by the panel)
- Mutations: `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`, `useCreateItem`, `useUpdateItem`, `useDeleteItem`
- Mutations invalidate the summary and category queries on success

---

## Testing Strategy

### API Tests (`apps/api/__tests__/`)

- **`routes/budget-categories.test.ts`** — CRUD operations, validation (name length, cents bounds, duplicate names within wedding), role enforcement (viewer can't create/update/delete), wedding scoping (can't access another wedding's categories), cascade delete
- **`routes/budget-items.test.ts`** — CRUD operations, validation (cents bounds, notes length), role enforcement, category ownership verification (item's category must belong to the current wedding), cascade on category delete
- **`routes/budget-summary.test.ts`** — Aggregation correctness (sums match expected), empty state (no categories returns zeros), unallocated calculation, per-category breakdown accuracy

### Shared Package Tests (`packages/shared/__tests__/`)

- Zod schema validation for all new schemas: create/update category, create/update item
- Edge cases: zero cents, max bound (999,999,999), boundary values, empty strings, null notes, string exceeding max length

### Frontend Tests (`apps/app/__tests__/`)

New test infrastructure: Vitest + `@testing-library/react` + `@testing-library/jest-dom`.

- **Components:** `BudgetWidget`, `BudgetCategoryCard`, `BudgetCategoryPanel`, `BudgetItemForm`, `BudgetCategoryForm`, `BudgetSummaryBar` — rendering, props, user interactions, empty states
- **Hooks:** `useBudgetSummary`, `useBudgetCategories`, `useBudgetItems` — query behavior with mocked API responses
- **Utils:** `formatMoney` — formatting, edge cases, different currencies
- **Route components** (`routes/*.tsx`) remain excluded from coverage per CLAUDE.md

### Coverage

95% per-file on all new files, enforced by vitest config with `perFile: true` thresholds across all three packages.

---

## Security

Per the roadmap's Phase 1 security requirements:

- **Input validation on budget amounts:** Zod schemas enforce `z.number().int().min(0).max(999_999_999)` on all cent fields. Rejects negative values, floating-point, and unreasonably large amounts.
- **Row-level access enforcement:** All budget queries scope through `budget_category.wedding_id`, verified by the existing `weddingAccessMiddleware`. Item operations verify category ownership via DB join — the category's `wedding_id` must match the URL's `weddingId`.
- **Parameterized queries:** Drizzle ORM handles parameterization for all queries. Aggregation queries use Drizzle's `sql` tagged template literals (parameterized by default). No raw SQL strings.
- **Role enforcement:** Viewers restricted to GET endpoints. Editors and owners get full CRUD. Enforced at the route handler level, before any DB write operation.

---

## Scope Boundaries

**In scope:**
- Budget category CRUD with custom names
- Budget item CRUD with estimated/quoted/paid cents
- Summary endpoint with aggregation
- Budget page with card grid + slide-over panel
- Dashboard widget replacing "coming soon" card
- Money formatting utilities
- Frontend test infrastructure setup
- Drizzle migration for new tables

**Out of scope (future phases):**
- Drag-and-drop reordering (manual `sort_order` is sufficient for now)
- Budget templates / preset categories
- CSV export/import of budget data
- Charts / visualizations beyond progress bars
- Vendor linking (Phase 4)
- Currency conversion
