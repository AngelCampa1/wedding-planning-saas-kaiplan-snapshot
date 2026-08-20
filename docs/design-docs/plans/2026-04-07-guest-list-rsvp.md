# Phase 2: Guest List + RSVP Implementation Plan


**Goal:** Build guest list management with RSVP tracking, plus-one linking, dietary tags, and CSV bulk import.

**Architecture:** Single `guest` table with self-referencing `primaryGuestId` for plus-ones. Postgres text arrays for dietary tags. API follows existing Hono route pattern under `/weddings/:weddingId/guests`. Frontend reuses budget page patterns (summary bar + content area + sheet forms).

**Tech Stack:** Drizzle ORM (Postgres), Hono, Zod, TanStack Query, TanStack Router, Shadcn/UI, Vitest, Testing Library

---

## File Structure

### Shared Package (`packages/shared/src/`)

| File | Responsibility |
|------|---------------|
| `constants.ts` | Add `GUEST_SIDES`, `RSVP_STATUSES`, `DIETARY_TAGS` constants and types |
| `guest-schemas.ts` | Create: Zod schemas for guest CRUD, bulk RSVP, CSV row validation |
| `types.ts` | Add `Guest`, `GuestWithPlusOnes`, `GuestSummary` interfaces |
| `schemas.ts` | Re-export from `guest-schemas.ts` |

### API (`apps/api/`)

| File | Responsibility |
|------|---------------|
| `src/db/guest-schema.ts` | Create: Drizzle `guest` table definition |
| `src/db/schema.ts` | Modify: re-export `guest` from guest-schema |
| `src/routes/guests.ts` | Create: all guest CRUD routes, bulk RSVP, summary |
| `src/routes/guest-csv-import.ts` | Create: CSV import route handler (isolated for testability) |
| `src/index.ts` | Modify: mount guest routes |
| `__tests__/routes/guests.test.ts` | Create: guest route tests |
| `__tests__/routes/guest-csv-import.test.ts` | Create: CSV import tests |

### App (`apps/app/`)

| File | Responsibility |
|------|---------------|
| `src/hooks/use-guests.ts` | Create: TanStack Query hooks for guest data |
| `src/components/guest/guest-summary-bar.tsx` | Create: RSVP count summary bar |
| `src/components/guest/guest-table.tsx` | Create: sortable/filterable guest table with expandable plus-ones |
| `src/components/guest/guest-form.tsx` | Create: create/edit guest sheet form |
| `src/components/guest/bulk-rsvp-bar.tsx` | Create: sticky bottom bar for bulk RSVP updates |
| `src/components/guest/csv-import-dialog.tsx` | Create: CSV upload dialog with preview + error reporting |
| `src/components/guest/guest-widget.tsx` | Create: dashboard widget card |
| `src/routes/_authenticated/guests.tsx` | Modify: replace placeholder with full guest list page |
| `src/routes/_authenticated/dashboard.tsx` | Modify: replace guest list ModuleCard with GuestWidget |
| `__tests__/hooks/use-guests.test.ts` | Create: hook tests |
| `__tests__/components/guest/guest-summary-bar.test.tsx` | Create: component test |
| `__tests__/components/guest/guest-table.test.tsx` | Create: component test |
| `__tests__/components/guest/guest-form.test.tsx` | Create: component test |
| `__tests__/components/guest/bulk-rsvp-bar.test.tsx` | Create: component test |
| `__tests__/components/guest/csv-import-dialog.test.tsx` | Create: component test |
| `__tests__/components/guest/guest-widget.test.tsx` | Create: component test |

---

## Task 1: Shared Constants & Types

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add guest constants to `constants.ts`**

Append to the end of `packages/shared/src/constants.ts`:

```typescript
export const GUEST_SIDES = ["partner1", "partner2", "mutual"] as const;
export type GuestSide = (typeof GUEST_SIDES)[number];

export const RSVP_STATUSES = ["pending", "invited", "accepted", "declined"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "halal",
  "kosher",
  "nut_allergy",
  "dairy_free",
  "other",
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];
```

- [ ] **Step 2: Add guest types to `types.ts`**

Append to the end of `packages/shared/src/types.ts`:

```typescript
import type { GuestSide, RsvpStatus, DietaryTag } from "./constants";

export interface Guest {
  id: string;
  weddingId: string;
  primaryGuestId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  side: GuestSide;
  groupName: string | null;
  dietaryTags: DietaryTag[];
  dietaryNotes: string | null;
  rsvpStatus: RsvpStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuestWithPlusOnes extends Guest {
  plusOnes: Guest[];
}

export interface GuestSummary {
  totalGuests: number;
  totalPrimary: number;
  totalPlusOnes: number;
  byRsvp: Record<RsvpStatus, number>;
  byDietary: Record<DietaryTag, number>;
  bySide: Record<GuestSide, number>;
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @kaiplan/shared exec tsc --noEmit`
Expected: PASS with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/types.ts
git commit -m "feat(shared): add guest constants and types"
```

---

## Task 2: Guest Zod Schemas + Tests

**Files:**
- Create: `packages/shared/src/guest-schemas.ts`
- Modify: `packages/shared/src/schemas.ts`
- Create: `packages/shared/__tests__/guest-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/guest-schemas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createGuestSchema,
  updateGuestSchema,
  bulkUpdateRsvpSchema,
  csvRowSchema,
} from "../src/guest-schemas";

describe("createGuestSchema", () => {
  it("accepts valid input with required fields only", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.side).toBe("mutual");
      expect(result.data.rsvpStatus).toBe("pending");
      expect(result.data.dietaryTags).toEqual([]);
    }
  });

  it("accepts valid input with all fields", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "+1-555-0123",
      side: "partner1",
      groupName: "College Friends",
      dietaryTags: ["vegetarian", "gluten_free"],
      dietaryNotes: "Severe celiac",
      rsvpStatus: "accepted",
      primaryGuestId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty firstName", () => {
    const result = createGuestSchema.safeParse({
      firstName: "",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects firstName over 100 chars", () => {
    const result = createGuestSchema.safeParse({
      firstName: "A".repeat(101),
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty lastName", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects phone over 50 chars", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      phone: "1".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid side value", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      side: "groom",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid rsvpStatus", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      rsvpStatus: "maybe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid dietary tag", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryTags: ["vegetarian", "paleo"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 8 dietary tags", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryTags: [
        "vegetarian", "vegan", "gluten_free", "halal",
        "kosher", "nut_allergy", "dairy_free", "other", "vegetarian",
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects dietaryNotes over 500 chars", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryNotes: "A".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects groupName over 100 chars", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      groupName: "A".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid primaryGuestId format", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      primaryGuestId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("trims firstName and lastName", () => {
    const result = createGuestSchema.safeParse({
      firstName: "  Jane  ",
      lastName: "  Doe  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Jane");
      expect(result.data.lastName).toBe("Doe");
    }
  });
});

describe("updateGuestSchema", () => {
  it("accepts partial input", () => {
    const result = updateGuestSchema.safeParse({
      firstName: "Updated",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateGuestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid fields same as create", () => {
    const result = updateGuestSchema.safeParse({
      email: "bad",
    });
    expect(result.success).toBe(false);
  });
});

describe("bulkUpdateRsvpSchema", () => {
  it("accepts valid array of updates", () => {
    const result = bulkUpdateRsvpSchema.safeParse([
      { id: "550e8400-e29b-41d4-a716-446655440000", rsvpStatus: "accepted" },
      { id: "550e8400-e29b-41d4-a716-446655440001", rsvpStatus: "declined" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects empty array", () => {
    const result = bulkUpdateRsvpSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects invalid rsvpStatus in array", () => {
    const result = bulkUpdateRsvpSchema.safeParse([
      { id: "550e8400-e29b-41d4-a716-446655440000", rsvpStatus: "maybe" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects non-uuid id", () => {
    const result = bulkUpdateRsvpSchema.safeParse([
      { id: "bad", rsvpStatus: "accepted" },
    ]);
    expect(result.success).toBe(false);
  });
});

describe("csvRowSchema", () => {
  it("accepts valid row with required fields", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid row with all fields", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      phone: "+1-555-0123",
      side: "partner1",
      group_name: "Family",
      dietary_tags: "vegetarian,gluten_free",
      dietary_notes: "Severe allergy",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dietary_tags).toBe("vegetarian,gluten_free");
    }
  });

  it("rejects empty first_name", () => {
    const result = csvRowSchema.safeParse({
      first_name: "",
      last_name: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      email: "not-valid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid side", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      side: "invalid",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/shared test -- --run guest-schemas`
Expected: FAIL — module `../src/guest-schemas` not found

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared/src/guest-schemas.ts`:

```typescript
import { z } from "zod";
import { GUEST_SIDES, RSVP_STATUSES, DIETARY_TAGS } from "./constants";

export const createGuestSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  side: z.enum(GUEST_SIDES).default("mutual"),
  groupName: z.string().max(100).nullable().optional(),
  dietaryTags: z.array(z.enum(DIETARY_TAGS)).max(8).default([]),
  dietaryNotes: z.string().max(500).nullable().optional(),
  rsvpStatus: z.enum(RSVP_STATUSES).default("pending"),
  primaryGuestId: z.string().uuid().nullable().optional(),
});

export const updateGuestSchema = createGuestSchema.partial();

export const bulkUpdateRsvpSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      rsvpStatus: z.enum(RSVP_STATUSES),
    }),
  )
  .min(1);

export const csvRowSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  side: z.enum(GUEST_SIDES).optional(),
  group_name: z.string().max(100).optional(),
  dietary_tags: z.string().optional(),
  dietary_notes: z.string().max(500).optional(),
});

export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;
export type BulkUpdateRsvpInput = z.infer<typeof bulkUpdateRsvpSchema>;
export type CsvRowInput = z.infer<typeof csvRowSchema>;
```

- [ ] **Step 4: Add re-export to `schemas.ts`**

Append to `packages/shared/src/schemas.ts`:

```typescript
export * from "./guest-schemas";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/shared test -- --run guest-schemas`
Expected: PASS — all tests green

- [ ] **Step 6: Run coverage**

Run: `pnpm --filter @kaiplan/shared test:coverage`
Expected: `guest-schemas.ts` at 95%+

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/guest-schemas.ts packages/shared/src/schemas.ts packages/shared/__tests__/guest-schemas.test.ts
git commit -m "feat(shared): add guest Zod schemas with tests"
```

---

## Task 3: Drizzle Guest Schema + Migration

**Files:**
- Create: `apps/api/src/db/guest-schema.ts`
- Modify: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Create guest table definition**

Create `apps/api/src/db/guest-schema.ts`:

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { wedding } from "./schema";

export const guest = pgTable(
  "guest",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => wedding.id, { onDelete: "cascade" }),
    primaryGuestId: uuid("primary_guest_id").references(
      (): ReturnType<typeof uuid> => guest.id,
      { onDelete: "cascade" },
    ),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    side: text("side").notNull().default("mutual"),
    groupName: text("group_name"),
    dietaryTags: text("dietary_tags")
      .array()
      .notNull()
      .default([]),
    dietaryNotes: text("dietary_notes"),
    rsvpStatus: text("rsvp_status").notNull().default("pending"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("guest_wedding_name_primary").on(
      table.weddingId,
      table.firstName,
      table.lastName,
      table.primaryGuestId,
    ),
  ],
);
```

Note: The self-referential FK type annotation uses `(): ReturnType<typeof uuid> => guest.id` to handle the circular reference — this is the Drizzle pattern for self-referencing tables.

- [ ] **Step 2: Add re-export to `schema.ts`**

Add to `apps/api/src/db/schema.ts` after the budget re-export:

```typescript
export { guest } from "./guest-schema";
```

- [ ] **Step 3: Generate migration**

Run: `pnpm --filter @kaiplan/api run db:generate`
Expected: A new migration file created in `apps/api/drizzle/`

- [ ] **Step 4: Apply migration**

Run: `pnpm --filter @kaiplan/api run db:migrate`
Expected: Migration applied successfully

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @kaiplan/api exec tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/guest-schema.ts apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(api): add guest database table with self-referencing plus-ones"
```

---

## Task 4: Guest CRUD API Routes + Tests

**Files:**
- Create: `apps/api/src/routes/guests.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/__tests__/routes/guests.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/__tests__/routes/guests.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { guestRoutes } from "../../src/routes/guests";
import type { Database } from "../../src/db/client";
import type { Auth } from "../../src/auth";

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
};

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

const VIEWER_MEMBER = { ...MEMBER_ROW, role: "viewer" as const };

const GUEST_ROW = {
  id: "guest-uuid-1",
  weddingId: WEDDING_ID,
  primaryGuestId: null,
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: null,
  side: "partner1",
  groupName: "College Friends",
  dietaryTags: ["vegetarian"],
  dietaryNotes: null,
  rsvpStatus: "pending",
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const PLUS_ONE_ROW = {
  ...GUEST_ROW,
  id: "guest-uuid-2",
  primaryGuestId: "guest-uuid-1",
  firstName: "John",
  lastName: "Doe",
  email: null,
  groupName: null,
  dietaryTags: [],
};

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

function makeDb(
  selectResponses: unknown[][] = [[]],
  writeResult: unknown[] = [],
): Database {
  let selectIndex = 0;
  const insertBuilder = makeWriteBuilder(writeResult);
  const updateBuilder = makeWriteBuilder(writeResult);

  const deleteBuilder: Record<string, unknown> = {};
  deleteBuilder.where = vi.fn().mockReturnValue(deleteBuilder);
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
  db.delete = vi.fn().mockReturnValue(deleteBuilder);

  return db as unknown as Database;
}

function makeApp(db: Database, auth: Auth) {
  const routes = guestRoutes(db, auth);
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

describe("guestRoutes", () => {
  // --- GET /guests (list) ---
  describe("GET /:weddingId/guests", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/guests`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when not a wedding member", async () => {
      const db = makeDb([[]]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/guests`);
      expect(res.status).toBe(403);
    });

    it("returns guests with nested plus-ones", async () => {
      const db = makeDb([
        [MEMBER_ROW],           // wedding-access middleware
        [GUEST_ROW, PLUS_ONE_ROW], // guest list query
      ]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/guests`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1); // 1 primary
      expect(data[0].firstName).toBe("Jane");
      expect(data[0].plusOnes.length).toBe(1);
      expect(data[0].plusOnes[0].firstName).toBe("John");
    });

    it("returns empty array when no guests", async () => {
      const db = makeDb([[MEMBER_ROW], []]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/guests`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });
  });

  // --- GET /guests/summary ---
  describe("GET /:weddingId/guests/summary", () => {
    it("returns summary counts", async () => {
      const db = makeDb([
        [MEMBER_ROW],
        [GUEST_ROW, PLUS_ONE_ROW],
      ]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/guests/summary`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalGuests).toBe(2);
      expect(data.totalPrimary).toBe(1);
      expect(data.totalPlusOnes).toBe(1);
      expect(data.byRsvp.pending).toBe(2);
    });
  });

  // --- GET /guests/:guestId ---
  describe("GET /:weddingId/guests/:guestId", () => {
    it("returns single guest with plus-ones", async () => {
      const db = makeDb([
        [MEMBER_ROW],
        [GUEST_ROW],
        [PLUS_ONE_ROW],
      ]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/guests/${GUEST_ROW.id}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.firstName).toBe("Jane");
      expect(data.plusOnes.length).toBe(1);
    });

    it("returns 404 for non-existent guest", async () => {
      const db = makeDb([[MEMBER_ROW], []]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "GET", `/weddings/${WEDDING_ID}/guests/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  // --- POST /guests ---
  describe("POST /:weddingId/guests", () => {
    it("creates a primary guest", async () => {
      const db = makeDb([[MEMBER_ROW]], [GUEST_ROW]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/guests`, {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        side: "partner1",
        groupName: "College Friends",
        dietaryTags: ["vegetarian"],
      });
      expect(res.status).toBe(201);
    });

    it("creates a plus-one linked to primary guest", async () => {
      const db = makeDb(
        [[MEMBER_ROW], [GUEST_ROW]], // middleware, then primaryGuest lookup
        [PLUS_ONE_ROW],
      );
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/guests`, {
        firstName: "John",
        lastName: "Doe",
        primaryGuestId: GUEST_ROW.id,
      });
      expect(res.status).toBe(201);
    });

    it("returns 404 when primaryGuestId does not exist", async () => {
      const db = makeDb([[MEMBER_ROW], []]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/guests`, {
        firstName: "John",
        lastName: "Doe",
        primaryGuestId: "550e8400-e29b-41d4-a716-446655440099",
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/guests`, {
        firstName: "",
      });
      expect(res.status).toBe(400);
    });

    it("returns 403 for viewer role", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());
      const res = await req(app, "POST", `/weddings/${WEDDING_ID}/guests`, {
        firstName: "Jane",
        lastName: "Doe",
      });
      expect(res.status).toBe(403);
    });
  });

  // --- PATCH /guests/:guestId ---
  describe("PATCH /:weddingId/guests/:guestId", () => {
    it("updates a guest", async () => {
      const updated = { ...GUEST_ROW, firstName: "Janet" };
      const db = makeDb([[MEMBER_ROW]], [updated]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/guests/${GUEST_ROW.id}`,
        { firstName: "Janet" },
      );
      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid update data", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/guests/${GUEST_ROW.id}`,
        { email: "not-valid" },
      );
      expect(res.status).toBe(400);
    });

    it("returns 403 for viewer role", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/guests/${GUEST_ROW.id}`,
        { firstName: "Janet" },
      );
      expect(res.status).toBe(403);
    });
  });

  // --- DELETE /guests/:guestId ---
  describe("DELETE /:weddingId/guests/:guestId", () => {
    it("deletes a guest", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ID}/guests/${GUEST_ROW.id}`,
      );
      expect(res.status).toBe(204);
    });

    it("returns 403 for viewer role", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ID}/guests/${GUEST_ROW.id}`,
      );
      expect(res.status).toBe(403);
    });
  });

  // --- PATCH /guests/bulk-rsvp ---
  describe("PATCH /:weddingId/guests/bulk-rsvp", () => {
    it("updates RSVP status for multiple guests", async () => {
      const db = makeDb(
        [[MEMBER_ROW], [GUEST_ROW, PLUS_ONE_ROW]], // middleware, then ownership check
        [GUEST_ROW],
      );
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/guests/bulk-rsvp`,
        [
          { id: GUEST_ROW.id, rsvpStatus: "accepted" },
          { id: PLUS_ONE_ROW.id, rsvpStatus: "accepted" },
        ],
      );
      expect(res.status).toBe(200);
    });

    it("returns 400 for empty array", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/guests/bulk-rsvp`,
        [],
      );
      expect(res.status).toBe(400);
    });

    it("returns 403 for viewer role", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ID}/guests/bulk-rsvp`,
        [{ id: GUEST_ROW.id, rsvpStatus: "accepted" }],
      );
      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/api test -- --run guests`
Expected: FAIL — module `../../src/routes/guests` not found

- [ ] **Step 3: Write the guest routes implementation**

Create `apps/api/src/routes/guests.ts`:

```typescript
import { Hono } from "hono";
import type { Context } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import {
  createGuestSchema,
  updateGuestSchema,
  bulkUpdateRsvpSchema,
} from "@kaiplan/shared";
import type {
  Guest,
  GuestWithPlusOnes,
  GuestSummary,
  RsvpStatus,
  DietaryTag,
  GuestSide,
} from "@kaiplan/shared";
import { RSVP_STATUSES, DIETARY_TAGS, GUEST_SIDES } from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import { guest } from "../db/guest-schema";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

type AppEnv = { Bindings: Env; Variables: Variables };

function requireWriter(c: Context<AppEnv>) {
  if (c.get("weddingRole") === "viewer") {
    return c.json({ error: "Viewers cannot modify guests" }, 403);
  }
  return null;
}

function nestPlusOnes(rows: Guest[]): GuestWithPlusOnes[] {
  const primaries: GuestWithPlusOnes[] = [];
  const plusOneMap = new Map<string, Guest[]>();

  for (const row of rows) {
    if (row.primaryGuestId) {
      const list = plusOneMap.get(row.primaryGuestId) ?? [];
      list.push(row);
      plusOneMap.set(row.primaryGuestId, list);
    } else {
      primaries.push({ ...row, plusOnes: [] });
    }
  }

  for (const primary of primaries) {
    primary.plusOnes = plusOneMap.get(primary.id) ?? [];
  }

  return primaries;
}

function computeSummary(rows: Guest[]): GuestSummary {
  const byRsvp = Object.fromEntries(
    RSVP_STATUSES.map((s) => [s, 0]),
  ) as Record<RsvpStatus, number>;
  const byDietary = Object.fromEntries(
    DIETARY_TAGS.map((t) => [t, 0]),
  ) as Record<DietaryTag, number>;
  const bySide = Object.fromEntries(
    GUEST_SIDES.map((s) => [s, 0]),
  ) as Record<GuestSide, number>;

  let totalPrimary = 0;
  let totalPlusOnes = 0;

  for (const g of rows) {
    if (g.primaryGuestId) {
      totalPlusOnes++;
    } else {
      totalPrimary++;
    }
    byRsvp[g.rsvpStatus as RsvpStatus]++;
    bySide[g.side as GuestSide]++;
    for (const tag of g.dietaryTags) {
      byDietary[tag as DietaryTag]++;
    }
  }

  return {
    totalGuests: rows.length,
    totalPrimary,
    totalPlusOnes,
    byRsvp,
    byDietary,
    bySide,
  };
}

export function guestRoutes(db: Database, auth: Auth) {
  const app = new Hono<AppEnv>();
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  // List all guests with nested plus-ones
  app.get(
    "/:weddingId/guests",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const rows = await db
        .select()
        .from(guest)
        .where(eq(guest.weddingId, weddingId));

      return c.json(nestPlusOnes(rows as Guest[]));
    },
  );

  // Guest summary
  app.get(
    "/:weddingId/guests/summary",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const rows = await db
        .select()
        .from(guest)
        .where(eq(guest.weddingId, weddingId));

      return c.json(computeSummary(rows as Guest[]));
    },
  );

  // Get single guest
  app.get(
    "/:weddingId/guests/:guestId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");
      const guestId = c.req.param("guestId");

      const [row] = await db
        .select()
        .from(guest)
        .where(and(eq(guest.id, guestId), eq(guest.weddingId, weddingId)))
        .limit(1);

      if (!row) {
        return c.json({ error: "Guest not found" }, 404);
      }

      const plusOnes = await db
        .select()
        .from(guest)
        .where(
          and(eq(guest.primaryGuestId, guestId), eq(guest.weddingId, weddingId)),
        );

      return c.json({ ...row, plusOnes } as GuestWithPlusOnes);
    },
  );

  // Create guest
  app.post(
    "/:weddingId/guests",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const body = await c.req.json();
      const parsed = createGuestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      // If plus-one, validate primary guest exists in this wedding
      if (parsed.data.primaryGuestId) {
        const [primary] = await db
          .select()
          .from(guest)
          .where(
            and(
              eq(guest.id, parsed.data.primaryGuestId),
              eq(guest.weddingId, weddingId),
              isNull(guest.primaryGuestId),
            ),
          )
          .limit(1);

        if (!primary) {
          return c.json({ error: "Primary guest not found" }, 404);
        }
      }

      const [created] = await db
        .insert(guest)
        .values({
          weddingId,
          primaryGuestId: parsed.data.primaryGuestId ?? null,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
          side: parsed.data.side,
          groupName: parsed.data.groupName ?? null,
          dietaryTags: parsed.data.dietaryTags,
          dietaryNotes: parsed.data.dietaryNotes ?? null,
          rsvpStatus: parsed.data.rsvpStatus,
        })
        .returning();

      return c.json(created, 201);
    },
  );

  // Update guest
  app.patch(
    "/:weddingId/guests/:guestId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const guestId = c.req.param("guestId");
      const body = await c.req.json();
      const parsed = updateGuestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const [updated] = await db
        .update(guest)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(guest.id, guestId), eq(guest.weddingId, weddingId)))
        .returning();

      return c.json(updated);
    },
  );

  // Delete guest
  app.delete(
    "/:weddingId/guests/:guestId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const guestId = c.req.param("guestId");

      await db
        .delete(guest)
        .where(and(eq(guest.id, guestId), eq(guest.weddingId, weddingId)));

      return c.body(null, 204);
    },
  );

  // Bulk RSVP update
  app.patch(
    "/:weddingId/guests/bulk-rsvp",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const body = await c.req.json();
      const parsed = bulkUpdateRsvpSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      // Verify all guest IDs belong to this wedding
      const guestIds = parsed.data.map((g) => g.id);
      const existing = await db
        .select()
        .from(guest)
        .where(eq(guest.weddingId, weddingId));

      const existingIds = new Set((existing as Guest[]).map((g) => g.id));
      const invalid = guestIds.filter((id) => !existingIds.has(id));

      if (invalid.length > 0) {
        return c.json({ error: `Guests not found: ${invalid.join(", ")}` }, 404);
      }

      // Update each guest's RSVP status
      for (const { id, rsvpStatus } of parsed.data) {
        await db
          .update(guest)
          .set({ rsvpStatus, updatedAt: new Date() })
          .where(and(eq(guest.id, id), eq(guest.weddingId, weddingId)));
      }

      return c.json({ updated: parsed.data.length });
    },
  );

  return app;
}
```

- [ ] **Step 4: Mount guest routes in `index.ts`**

Add to `apps/api/src/index.ts` — add the import and route mounting. Insert a new route block before the wedding catch-all route:

Add import:
```typescript
import { guestRoutes } from "./routes/guests";
```

Add route block (before the existing wedding catch-all):
```typescript
app.route(
  "/api/weddings",
  (() => {
    const router = new Hono<{ Bindings: Env }>();
    router.all("/:weddingId/guests/*", (c) => {
      const db = createDb(c.env.HYPERDRIVE.connectionString);
      const auth = createAuth(db, c.env);
      const routes = guestRoutes(db, auth);
      return routes.fetch(c.req.raw, c.env);
    });
    return router;
  })(),
);
```

Also add a catch-all for the base guests path (no trailing path) to handle `GET /guests` and `POST /guests`:
```typescript
app.route(
  "/api/weddings",
  (() => {
    const router = new Hono<{ Bindings: Env }>();
    router.all("/:weddingId/guests", (c) => {
      const db = createDb(c.env.HYPERDRIVE.connectionString);
      const auth = createAuth(db, c.env);
      const routes = guestRoutes(db, auth);
      return routes.fetch(c.req.raw, c.env);
    });
    return router;
  })(),
);
```

Note: These must be placed **before** the existing budget and wedding catch-all blocks — follow the same pattern used by budget routes.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/api test -- --run guests`
Expected: PASS — all tests green

- [ ] **Step 6: Run full API test suite + coverage**

Run: `pnpm --filter @kaiplan/api test:coverage`
Expected: `guests.ts` at 95%+, no regressions

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/guests.ts apps/api/src/index.ts apps/api/__tests__/routes/guests.test.ts
git commit -m "feat(api): add guest CRUD, bulk RSVP, and summary routes"
```

---

## Task 5: CSV Import Route + Tests

**Files:**
- Create: `apps/api/src/routes/guest-csv-import.ts`
- Modify: `apps/api/src/routes/guests.ts`
- Create: `apps/api/__tests__/routes/guest-csv-import.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/__tests__/routes/guest-csv-import.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { parseCsvGuests, sanitizeCsvCell } from "../../src/routes/guest-csv-import";
import type { CsvRowInput } from "@kaiplan/shared";

describe("sanitizeCsvCell", () => {
  it("strips leading = character", () => {
    expect(sanitizeCsvCell("=SUM(A1)")).toBe("SUM(A1)");
  });

  it("strips leading + character", () => {
    expect(sanitizeCsvCell("+cmd")).toBe("cmd");
  });

  it("strips leading - character", () => {
    expect(sanitizeCsvCell("-cmd")).toBe("cmd");
  });

  it("strips leading @ character", () => {
    expect(sanitizeCsvCell("@import")).toBe("import");
  });

  it("strips leading tab character", () => {
    expect(sanitizeCsvCell("\tcmd")).toBe("cmd");
  });

  it("strips leading carriage return", () => {
    expect(sanitizeCsvCell("\rcmd")).toBe("cmd");
  });

  it("leaves normal text unchanged", () => {
    expect(sanitizeCsvCell("Jane Doe")).toBe("Jane Doe");
  });

  it("trims whitespace", () => {
    expect(sanitizeCsvCell("  Jane  ")).toBe("Jane");
  });
});

describe("parseCsvGuests", () => {
  it("parses valid CSV with required columns", () => {
    const csv = "first_name,last_name\nJane,Doe\nJohn,Smith";
    const result = parseCsvGuests(csv);
    expect(result.rows.length).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(result.rows[0].first_name).toBe("Jane");
    expect(result.rows[0].last_name).toBe("Doe");
  });

  it("parses valid CSV with all columns", () => {
    const csv =
      "first_name,last_name,email,phone,side,group_name,dietary_tags,dietary_notes\n" +
      "Jane,Doe,jane@example.com,555-0123,partner1,Family,\"vegetarian,gluten_free\",No nuts";
    const result = parseCsvGuests(csv);
    expect(result.rows.length).toBe(1);
    expect(result.errors.length).toBe(0);
    expect(result.rows[0].email).toBe("jane@example.com");
    expect(result.rows[0].dietary_tags).toBe("vegetarian,gluten_free");
  });

  it("reports errors for invalid rows", () => {
    const csv = "first_name,last_name\nJane,Doe\n,\nJohn,Smith";
    const result = parseCsvGuests(csv);
    expect(result.rows.length).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].row).toBe(3); // 1-indexed, row 3 is the empty one
  });

  it("sanitizes formula injection", () => {
    const csv = "first_name,last_name\n=SUM(A1),Doe";
    const result = parseCsvGuests(csv);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].first_name).toBe("SUM(A1)");
  });

  it("rejects CSV exceeding 500 rows", () => {
    const header = "first_name,last_name";
    const rows = Array.from({ length: 501 }, (_, i) => `Name${i},Last${i}`);
    const csv = [header, ...rows].join("\n");
    const result = parseCsvGuests(csv);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("500");
  });

  it("handles empty CSV body", () => {
    const csv = "first_name,last_name\n";
    const result = parseCsvGuests(csv);
    expect(result.rows.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it("rejects rows with invalid email", () => {
    const csv = "first_name,last_name,email\nJane,Doe,not-valid";
    const result = parseCsvGuests(csv);
    expect(result.rows.length).toBe(0);
    expect(result.errors.length).toBe(1);
  });

  it("rejects rows with invalid side", () => {
    const csv = "first_name,last_name,side\nJane,Doe,groom";
    const result = parseCsvGuests(csv);
    expect(result.rows.length).toBe(0);
    expect(result.errors.length).toBe(1);
  });

  it("handles missing optional columns gracefully", () => {
    const csv = "first_name,last_name\nJane,Doe";
    const result = parseCsvGuests(csv);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].email).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/api test -- --run guest-csv-import`
Expected: FAIL — module not found

- [ ] **Step 3: Write the CSV import implementation**

Create `apps/api/src/routes/guest-csv-import.ts`:

```typescript
import { csvRowSchema } from "@kaiplan/shared";
import type { CsvRowInput } from "@kaiplan/shared";

const FORMULA_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);
const MAX_ROWS = 500;

export function sanitizeCsvCell(value: string): string {
  let cleaned = value.trim();
  while (cleaned.length > 0 && FORMULA_CHARS.has(cleaned[0])) {
    cleaned = cleaned.slice(1);
  }
  return cleaned.trim();
}

interface ParseResult {
  rows: CsvRowInput[];
  errors: { row: number; message: string }[];
}

export function parseCsvGuests(csvText: string): ParseResult {
  const lines = csvText.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [] };
  }

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
  const dataLines = lines.slice(1);

  if (dataLines.length > MAX_ROWS) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `CSV exceeds maximum of ${MAX_ROWS} rows (got ${dataLines.length})`,
        },
      ],
    };
  }

  const rows: CsvRowInput[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const rowNumber = i + 2; // 1-indexed, skip header
    const values = parseCsvLine(dataLines[i]);
    const record: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const val = values[j] ?? "";
      const sanitized = sanitizeCsvCell(val);
      if (sanitized.length > 0) {
        record[headers[j]] = sanitized;
      }
    }

    const parsed = csvRowSchema.safeParse(record);
    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      const messages = parsed.error.issues.map((issue) => issue.message);
      errors.push({ row: rowNumber, message: messages.join("; ") });
    }
  }

  return { rows, errors };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}
```

- [ ] **Step 4: Add CSV import route to guests.ts**

Add the import to the top of `apps/api/src/routes/guests.ts`:

```typescript
import { parseCsvGuests } from "./guest-csv-import";
import { DIETARY_TAGS } from "@kaiplan/shared";
import type { DietaryTag } from "@kaiplan/shared";
```

Add the route handler inside `guestRoutes()`, before the `return app;`:

```typescript
  // CSV import
  app.post(
    "/:weddingId/guests/import-csv",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const contentType = c.req.header("content-type") ?? "";

      let csvText: string;

      if (contentType.includes("multipart/form-data")) {
        const formData = await c.req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
          return c.json({ error: "No file provided" }, 400);
        }
        if (file.size > 5 * 1024 * 1024) {
          return c.json({ error: "File exceeds 5MB limit" }, 400);
        }
        csvText = await file.text();
      } else {
        csvText = await c.req.text();
      }

      const { rows, errors } = parseCsvGuests(csvText);

      if (rows.length === 0 && errors.length > 0) {
        return c.json({ created: 0, errors }, 400);
      }

      const validDietaryTags = new Set<string>(DIETARY_TAGS);
      let created = 0;

      for (const row of rows) {
        const dietaryTags: DietaryTag[] = row.dietary_tags
          ? row.dietary_tags
              .split(",")
              .map((t) => t.trim())
              .filter((t): t is DietaryTag => validDietaryTags.has(t))
          : [];

        await db
          .insert(guest)
          .values({
            weddingId,
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email ?? null,
            phone: row.phone ?? null,
            side: row.side ?? "mutual",
            groupName: row.group_name ?? null,
            dietaryTags,
            dietaryNotes: row.dietary_notes ?? null,
            rsvpStatus: "pending",
          });
        created++;
      }

      return c.json({ created, errors }, 201);
    },
  );
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/api test -- --run guest-csv-import`
Expected: PASS

- [ ] **Step 6: Run full API coverage**

Run: `pnpm --filter @kaiplan/api test:coverage`
Expected: `guest-csv-import.ts` at 95%+

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/guest-csv-import.ts apps/api/src/routes/guests.ts apps/api/__tests__/routes/guest-csv-import.test.ts
git commit -m "feat(api): add CSV guest import with formula sanitization"
```

---

## Task 6: TanStack Query Hooks + Tests

**Files:**
- Create: `apps/app/src/hooks/use-guests.ts`
- Create: `apps/app/__tests__/hooks/use-guests.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/app/__tests__/hooks/use-guests.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useGuests,
  useGuest,
  useGuestSummary,
  useCreateGuest,
  useUpdateGuest,
  useDeleteGuest,
  useBulkUpdateRsvp,
  useImportGuestsCsv,
} from "../../src/hooks/use-guests";

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useGuests", () => {
  it("fetches guests for a wedding", async () => {
    const guests = [{ id: "g-1", firstName: "Jane" }];
    mockedApiFetch.mockResolvedValue(guests);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useGuests("wedding-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(guests);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests",
    );
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useGuests(null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("passes filter params in URL", async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useGuests("wedding-1", { side: "partner1", rsvpStatus: "accepted" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests?side=partner1&rsvpStatus=accepted",
    );
  });
});

describe("useGuest", () => {
  it("fetches single guest", async () => {
    const guest = { id: "g-1", firstName: "Jane", plusOnes: [] };
    mockedApiFetch.mockResolvedValue(guest);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useGuest("wedding-1", "g-1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/g-1",
    );
  });

  it("does not fetch when guestId is null", () => {
    mockedApiFetch.mockResolvedValue({});
    const { wrapper } = createWrapper();
    renderHook(() => useGuest("wedding-1", null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("useGuestSummary", () => {
  it("fetches guest summary", async () => {
    const summary = { totalGuests: 10 };
    mockedApiFetch.mockResolvedValue(summary);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useGuestSummary("wedding-1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/summary",
    );
  });
});

describe("useCreateGuest", () => {
  it("calls POST and invalidates queries", async () => {
    mockedApiFetch.mockResolvedValue({ id: "g-new" });
    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateGuest("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        firstName: "Jane",
        lastName: "Doe",
      });
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests",
      { method: "POST", body: JSON.stringify({ firstName: "Jane", lastName: "Doe" }) },
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["guests", "wedding-1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["guest-summary", "wedding-1"] });
  });
});

describe("useUpdateGuest", () => {
  it("calls PATCH and invalidates queries", async () => {
    mockedApiFetch.mockResolvedValue({ id: "g-1" });
    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateGuest("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        guestId: "g-1",
        data: { firstName: "Janet" },
      });
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/g-1",
      { method: "PATCH", body: JSON.stringify({ firstName: "Janet" }) },
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["guests", "wedding-1"] });
  });
});

describe("useDeleteGuest", () => {
  it("calls DELETE and invalidates queries", async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteGuest("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync("g-1");
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/g-1",
      { method: "DELETE" },
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["guests", "wedding-1"] });
  });
});

describe("useBulkUpdateRsvp", () => {
  it("calls PATCH bulk-rsvp and invalidates queries", async () => {
    mockedApiFetch.mockResolvedValue({ updated: 2 });
    const { wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useBulkUpdateRsvp("wedding-1"), {
      wrapper,
    });

    const updates = [
      { id: "g-1", rsvpStatus: "accepted" as const },
      { id: "g-2", rsvpStatus: "declined" as const },
    ];

    await act(async () => {
      await result.current.mutateAsync(updates);
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/bulk-rsvp",
      { method: "PATCH", body: JSON.stringify(updates) },
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["guests", "wedding-1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["guest-summary", "wedding-1"] });
  });
});

describe("useImportGuestsCsv", () => {
  it("calls POST import-csv with FormData", async () => {
    mockedApiFetch.mockResolvedValue({ created: 5, errors: [] });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useImportGuestsCsv("wedding-1"), {
      wrapper,
    });

    const file = new File(["first_name,last_name\nJane,Doe"], "guests.csv", {
      type: "text/csv",
    });

    await act(async () => {
      await result.current.mutateAsync(file);
    });

    expect(mockedApiFetch).toHaveBeenCalled();
    const [url, options] = mockedApiFetch.mock.calls[0];
    expect(url).toBe("/api/weddings/wedding-1/guests/import-csv");
    expect(options?.method).toBe("POST");
    expect(options?.body).toBeInstanceOf(FormData);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/app test -- --run use-guests`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hooks implementation**

Create `apps/app/src/hooks/use-guests.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  GuestWithPlusOnes,
  GuestSummary,
  CreateGuestInput,
  UpdateGuestInput,
  BulkUpdateRsvpInput,
} from "@kaiplan/shared";

interface GuestFilters {
  side?: string;
  rsvpStatus?: string;
  groupName?: string;
}

function buildGuestUrl(weddingId: string, filters?: GuestFilters): string {
  const base = `/api/weddings/${weddingId}/guests`;
  if (!filters) return base;
  const params = new URLSearchParams();
  if (filters.side) params.set("side", filters.side);
  if (filters.rsvpStatus) params.set("rsvpStatus", filters.rsvpStatus);
  if (filters.groupName) params.set("groupName", filters.groupName);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function useGuests(weddingId: string | null, filters?: GuestFilters) {
  return useQuery<GuestWithPlusOnes[]>({
    queryKey: ["guests", weddingId, filters],
    queryFn: () => apiFetch(buildGuestUrl(weddingId!, filters)),
    enabled: !!weddingId,
  });
}

export function useGuest(weddingId: string | null, guestId: string | null) {
  return useQuery<GuestWithPlusOnes>({
    queryKey: ["guest", weddingId, guestId],
    queryFn: () =>
      apiFetch(`/api/weddings/${weddingId}/guests/${guestId}`),
    enabled: !!weddingId && !!guestId,
  });
}

export function useGuestSummary(weddingId: string | null) {
  return useQuery<GuestSummary>({
    queryKey: ["guest-summary", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/guests/summary`),
    enabled: !!weddingId,
  });
}

export function useCreateGuest(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGuestInput) =>
      apiFetch(`/api/weddings/${weddingId}/guests`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}

export function useUpdateGuest(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      guestId,
      data,
    }: {
      guestId: string;
      data: UpdateGuestInput;
    }) =>
      apiFetch(`/api/weddings/${weddingId}/guests/${guestId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}

export function useDeleteGuest(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guestId: string) =>
      apiFetch(`/api/weddings/${weddingId}/guests/${guestId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}

export function useBulkUpdateRsvp(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: BulkUpdateRsvpInput) =>
      apiFetch(`/api/weddings/${weddingId}/guests/bulk-rsvp`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}

export function useImportGuestsCsv(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch(`/api/weddings/${weddingId}/guests/import-csv`, {
        method: "POST",
        body: formData,
        headers: {}, // let browser set content-type with boundary
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/app test -- --run use-guests`
Expected: PASS

- [ ] **Step 5: Run coverage**

Run: `pnpm --filter @kaiplan/app test:coverage`
Expected: `use-guests.ts` at 95%+

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/hooks/use-guests.ts apps/app/__tests__/hooks/use-guests.test.ts
git commit -m "feat(app): add TanStack Query hooks for guest data"
```

---

## Task 7: Guest Summary Bar Component + Tests

**Files:**
- Create: `apps/app/src/components/guest/guest-summary-bar.tsx`
- Create: `apps/app/__tests__/components/guest/guest-summary-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/app/__tests__/components/guest/guest-summary-bar.test.tsx`:

```tsx
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuestSummaryBar } from "../../../src/components/guest/guest-summary-bar";
import type { GuestSummary } from "@kaiplan/shared";

function makeSummary(overrides: Partial<GuestSummary> = {}): GuestSummary {
  return {
    totalGuests: 50,
    totalPrimary: 35,
    totalPlusOnes: 15,
    byRsvp: { pending: 10, invited: 15, accepted: 20, declined: 5 },
    byDietary: {
      vegetarian: 5, vegan: 2, gluten_free: 3, halal: 1,
      kosher: 0, nut_allergy: 1, dairy_free: 0, other: 0,
    },
    bySide: { partner1: 20, partner2: 18, mutual: 12 },
    ...overrides,
  };
}

describe("GuestSummaryBar", () => {
  it("displays total guest count", () => {
    render(<GuestSummaryBar summary={makeSummary()} />);
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("Total Guests")).toBeInTheDocument();
  });

  it("displays RSVP breakdown", () => {
    render(<GuestSummaryBar summary={makeSummary()} />);
    expect(screen.getByText("20")).toBeInTheDocument(); // accepted
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument(); // pending
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // declined
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });

  it("renders with zero counts", () => {
    const empty = makeSummary({
      totalGuests: 0,
      totalPrimary: 0,
      totalPlusOnes: 0,
      byRsvp: { pending: 0, invited: 0, accepted: 0, declined: 0 },
    });
    render(<GuestSummaryBar summary={empty} />);
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/app test -- --run guest-summary-bar`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `apps/app/src/components/guest/guest-summary-bar.tsx`:

```tsx
import type { GuestSummary } from "@kaiplan/shared";

interface GuestSummaryBarProps {
  summary: GuestSummary;
}

export function GuestSummaryBar({ summary }: GuestSummaryBarProps) {
  const stats = [
    { label: "Total Guests", value: summary.totalGuests, color: "text-foreground" },
    { label: "Confirmed", value: summary.byRsvp.accepted, color: "text-green-600" },
    { label: "Pending", value: summary.byRsvp.pending + summary.byRsvp.invited, color: "text-amber-600" },
    { label: "Declined", value: summary.byRsvp.declined, color: "text-red-600" },
  ];

  return (
    <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-background p-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col items-center min-w-[80px]">
          <span className={`text-2xl font-semibold ${stat.color}`}>
            {stat.value}
          </span>
          <span className="text-xs text-muted">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
```

Note: "Pending" combines `pending` + `invited` statuses since from the user's perspective both are "waiting for response."

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/app test -- --run guest-summary-bar`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/guest/guest-summary-bar.tsx apps/app/__tests__/components/guest/guest-summary-bar.test.tsx
git commit -m "feat(app): add GuestSummaryBar component"
```

---

## Task 8: Guest Form Component + Tests

**Files:**
- Create: `apps/app/src/components/guest/guest-form.tsx`
- Create: `apps/app/__tests__/components/guest/guest-form.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/app/__tests__/components/guest/guest-form.test.tsx`:

```tsx
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestForm } from "../../../src/components/guest/guest-form";
import type { Guest } from "@kaiplan/shared";

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g-1",
    weddingId: "w-1",
    primaryGuestId: null,
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "+1-555-0123",
    side: "partner1",
    groupName: "College Friends",
    dietaryTags: ["vegetarian"],
    dietaryNotes: "No nuts",
    rsvpStatus: "pending",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("GuestForm", () => {
  it("renders empty form in create mode", () => {
    render(
      <GuestForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        existingGroups={[]}
      />,
    );
    expect(screen.getByLabelText("First Name")).toHaveValue("");
    expect(screen.getByLabelText("Last Name")).toHaveValue("");
    expect(screen.getByText("Add Guest")).toBeInTheDocument();
  });

  it("renders populated form in edit mode", () => {
    render(
      <GuestForm
        guest={makeGuest()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        existingGroups={[]}
      />,
    );
    expect(screen.getByLabelText("First Name")).toHaveValue("Jane");
    expect(screen.getByLabelText("Last Name")).toHaveValue("Doe");
    expect(screen.getByText("Save Changes")).toBeInTheDocument();
  });

  it("calls onSubmit with form data", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <GuestForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        existingGroups={[]}
      />,
    );

    await user.type(screen.getByLabelText("First Name"), "Jane");
    await user.type(screen.getByLabelText("Last Name"), "Doe");
    await user.click(screen.getByText("Add Guest"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Jane",
          lastName: "Doe",
        }),
      );
    });
  });

  it("calls onCancel when cancel is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <GuestForm
        onSubmit={vi.fn()}
        onCancel={onCancel}
        existingGroups={[]}
      />,
    );

    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("pre-fills side for plus-one mode", () => {
    render(
      <GuestForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        existingGroups={[]}
        defaultSide="partner1"
        primaryGuestId="g-1"
      />,
    );
    expect(screen.getByText("Add Plus-One")).toBeInTheDocument();
  });

  it("disables submit when firstName is empty", () => {
    render(
      <GuestForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        existingGroups={[]}
      />,
    );
    expect(screen.getByText("Add Guest")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/app test -- --run guest-form`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `apps/app/src/components/guest/guest-form.tsx`:

```tsx
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { GUEST_SIDES, RSVP_STATUSES, DIETARY_TAGS } from "@kaiplan/shared";
import type { Guest, GuestSide, RsvpStatus, DietaryTag, CreateGuestInput } from "@kaiplan/shared";

interface GuestFormProps {
  guest?: Guest;
  onSubmit: (data: CreateGuestInput) => void;
  onCancel: () => void;
  existingGroups: string[];
  defaultSide?: GuestSide;
  primaryGuestId?: string;
  isSubmitting?: boolean;
}

const SIDE_LABELS: Record<GuestSide, string> = {
  partner1: "Partner 1",
  partner2: "Partner 2",
  mutual: "Mutual",
};

const RSVP_LABELS: Record<RsvpStatus, string> = {
  pending: "Pending",
  invited: "Invited",
  accepted: "Accepted",
  declined: "Declined",
};

const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  gluten_free: "Gluten Free",
  halal: "Halal",
  kosher: "Kosher",
  nut_allergy: "Nut Allergy",
  dairy_free: "Dairy Free",
  other: "Other",
};

export function GuestForm({
  guest,
  onSubmit,
  onCancel,
  existingGroups,
  defaultSide,
  primaryGuestId,
  isSubmitting = false,
}: GuestFormProps) {
  const [firstName, setFirstName] = useState(guest?.firstName ?? "");
  const [lastName, setLastName] = useState(guest?.lastName ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [phone, setPhone] = useState(guest?.phone ?? "");
  const [side, setSide] = useState<GuestSide>(
    guest?.side ?? defaultSide ?? "mutual",
  );
  const [groupName, setGroupName] = useState(guest?.groupName ?? "");
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(
    guest?.dietaryTags ?? [],
  );
  const [dietaryNotes, setDietaryNotes] = useState(guest?.dietaryNotes ?? "");
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>(
    guest?.rsvpStatus ?? "pending",
  );

  const isEdit = !!guest;
  const isPlusOne = !!primaryGuestId;
  const isValid = firstName.trim().length > 0 && lastName.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      side,
      groupName: groupName.trim() || null,
      dietaryTags,
      dietaryNotes: dietaryNotes.trim() || null,
      rsvpStatus,
      primaryGuestId: primaryGuestId ?? null,
    });
  }

  function toggleDietaryTag(tag: DietaryTag) {
    setDietaryTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  const submitLabel = isPlusOne
    ? "Add Plus-One"
    : isEdit
      ? "Save Changes"
      : "Add Guest";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Last Name</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Side</Label>
        <div className="flex gap-2">
          {GUEST_SIDES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                side === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted hover:border-foreground"
              }`}
            >
              {SIDE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="groupName">Group</Label>
        <Input
          id="groupName"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          list="group-suggestions"
        />
        {existingGroups.length > 0 && (
          <datalist id="group-suggestions">
            {existingGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Dietary Requirements</Label>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleDietaryTag(tag)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                dietaryTags.includes(tag)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted hover:border-foreground"
              }`}
            >
              {DIETARY_LABELS[tag]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dietaryNotes">Dietary Notes</Label>
        <textarea
          id="dietaryNotes"
          className="flex min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          value={dietaryNotes}
          onChange={(e) => setDietaryNotes(e.target.value)}
          maxLength={500}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rsvpStatus">RSVP Status</Label>
        <select
          id="rsvpStatus"
          value={rsvpStatus}
          onChange={(e) => setRsvpStatus(e.target.value as RsvpStatus)}
          className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          {RSVP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RSVP_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/app test -- --run guest-form`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/guest/guest-form.tsx apps/app/__tests__/components/guest/guest-form.test.tsx
git commit -m "feat(app): add GuestForm component"
```

---

## Task 9: Guest Table Component + Tests

**Files:**
- Create: `apps/app/src/components/guest/guest-table.tsx`
- Create: `apps/app/__tests__/components/guest/guest-table.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/app/__tests__/components/guest/guest-table.test.tsx`:

```tsx
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GuestTable } from "../../../src/components/guest/guest-table";
import type { GuestWithPlusOnes } from "@kaiplan/shared";

function makeGuest(overrides: Partial<GuestWithPlusOnes> = {}): GuestWithPlusOnes {
  return {
    id: "g-1",
    weddingId: "w-1",
    primaryGuestId: null,
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: null,
    side: "partner1",
    groupName: "College Friends",
    dietaryTags: ["vegetarian"],
    dietaryNotes: null,
    rsvpStatus: "accepted",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    plusOnes: [],
    ...overrides,
  };
}

describe("GuestTable", () => {
  it("renders guest rows", () => {
    const guests = [
      makeGuest(),
      makeGuest({ id: "g-2", firstName: "John", lastName: "Smith" }),
    ];
    render(
      <GuestTable
        guests={guests}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAddPlusOne={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("displays RSVP status badge", () => {
    render(
      <GuestTable
        guests={[makeGuest({ rsvpStatus: "accepted" })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAddPlusOne={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("shows plus-one count", () => {
    const guest = makeGuest({
      plusOnes: [
        {
          id: "g-po-1",
          weddingId: "w-1",
          primaryGuestId: "g-1",
          firstName: "John",
          lastName: "Doe",
          email: null,
          phone: null,
          side: "partner1",
          groupName: null,
          dietaryTags: [],
          dietaryNotes: null,
          rsvpStatus: "pending",
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    render(
      <GuestTable
        guests={[guest]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAddPlusOne={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("calls onEdit when edit is clicked", async () => {
    const onEdit = vi.fn();
    render(
      <GuestTable
        guests={[makeGuest()]}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onAddPlusOne={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Edit Jane Doe"));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "g-1" }));
  });

  it("calls onDelete when delete is clicked", () => {
    const onDelete = vi.fn();
    render(
      <GuestTable
        guests={[makeGuest()]}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onAddPlusOne={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Delete Jane Doe"));
    expect(onDelete).toHaveBeenCalledWith("g-1");
  });

  it("calls onToggleSelect when checkbox is clicked", () => {
    const onToggleSelect = vi.fn();
    render(
      <GuestTable
        guests={[makeGuest()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAddPlusOne={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        onToggleSelectAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Select Jane Doe"));
    expect(onToggleSelect).toHaveBeenCalledWith("g-1");
  });

  it("shows empty state when no guests", () => {
    render(
      <GuestTable
        guests={[]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAddPlusOne={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );
    expect(screen.getByText("No guests yet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/app test -- --run guest-table`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `apps/app/src/components/guest/guest-table.tsx`:

```tsx
import { useState } from "react";
import { Pencil, Trash2, UserPlus, ChevronDown, ChevronRight } from "lucide-react";
import type { GuestWithPlusOnes, Guest, RsvpStatus, DietaryTag } from "@kaiplan/shared";

interface GuestTableProps {
  guests: GuestWithPlusOnes[];
  onEdit: (guest: Guest) => void;
  onDelete: (guestId: string) => void;
  onAddPlusOne: (primaryGuest: GuestWithPlusOnes) => void;
  selectedIds: Set<string>;
  onToggleSelect: (guestId: string) => void;
  onToggleSelectAll: () => void;
}

const RSVP_COLORS: Record<RsvpStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  invited: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
};

const RSVP_LABELS: Record<RsvpStatus, string> = {
  pending: "Pending",
  invited: "Invited",
  accepted: "Accepted",
  declined: "Declined",
};

const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetarian: "Veg",
  vegan: "Vegan",
  gluten_free: "GF",
  halal: "Halal",
  kosher: "Kosher",
  nut_allergy: "Nut",
  dairy_free: "DF",
  other: "Other",
};

export function GuestTable({
  guests,
  onEdit,
  onDelete,
  onAddPlusOne,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: GuestTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (guests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted">
        <p className="text-sm">No guests yet</p>
      </div>
    );
  }

  function toggleExpand(guestId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) {
        next.delete(guestId);
      } else {
        next.add(guestId);
      }
      return next;
    });
  }

  const allIds = guests.flatMap((g) => [g.id, ...g.plusOnes.map((p) => p.id)]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/10">
          <tr>
            <th className="w-10 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all guests"
              />
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted">Name</th>
            <th className="px-3 py-2 text-left font-medium text-muted hidden sm:table-cell">Email</th>
            <th className="px-3 py-2 text-left font-medium text-muted hidden md:table-cell">Side</th>
            <th className="px-3 py-2 text-left font-medium text-muted hidden md:table-cell">Group</th>
            <th className="px-3 py-2 text-left font-medium text-muted">RSVP</th>
            <th className="px-3 py-2 text-left font-medium text-muted hidden lg:table-cell">Dietary</th>
            <th className="w-24 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {guests.map((guest) => {
            const isExpanded = expandedIds.has(guest.id);
            const hasPlusOnes = guest.plusOnes.length > 0;

            return (
              <>
                <tr key={guest.id} className="border-t border-border hover:bg-muted/5">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(guest.id)}
                      onChange={() => onToggleSelect(guest.id)}
                      aria-label={`Select ${guest.firstName} ${guest.lastName}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {hasPlusOnes && (
                        <button
                          onClick={() => toggleExpand(guest.id)}
                          className="text-muted hover:text-foreground"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <span className="font-medium text-foreground">
                        {guest.firstName} {guest.lastName}
                      </span>
                      {hasPlusOnes && (
                        <span className="text-xs text-muted bg-muted/20 rounded-full px-1.5">
                          +{guest.plusOnes.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted hidden sm:table-cell">
                    {guest.email ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted capitalize hidden md:table-cell">
                    {guest.side}
                  </td>
                  <td className="px-3 py-2 text-muted hidden md:table-cell">
                    {guest.groupName ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${RSVP_COLORS[guest.rsvpStatus]}`}
                    >
                      {RSVP_LABELS[guest.rsvpStatus]}
                    </span>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {guest.dietaryTags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-muted/20 text-muted rounded px-1.5 py-0.5"
                        >
                          {DIETARY_LABELS[tag]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onAddPlusOne(guest)}
                        aria-label={`Add plus-one for ${guest.firstName} ${guest.lastName}`}
                        className="p-1 text-muted hover:text-foreground"
                      >
                        <UserPlus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onEdit(guest)}
                        aria-label={`Edit ${guest.firstName} ${guest.lastName}`}
                        className="p-1 text-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(guest.id)}
                        aria-label={`Delete ${guest.firstName} ${guest.lastName}`}
                        className="p-1 text-muted hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {isExpanded &&
                  guest.plusOnes.map((po) => (
                    <tr
                      key={po.id}
                      className="border-t border-border/50 bg-muted/5"
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(po.id)}
                          onChange={() => onToggleSelect(po.id)}
                          aria-label={`Select ${po.firstName} ${po.lastName}`}
                        />
                      </td>
                      <td className="px-3 py-2 pl-10">
                        <span className="text-muted">
                          {po.firstName} {po.lastName}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted hidden sm:table-cell">
                        {po.email ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted capitalize hidden md:table-cell">
                        {po.side}
                      </td>
                      <td className="px-3 py-2 text-muted hidden md:table-cell">
                        {po.groupName ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${RSVP_COLORS[po.rsvpStatus]}`}
                        >
                          {RSVP_LABELS[po.rsvpStatus]}
                        </span>
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {po.dietaryTags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-muted/20 text-muted rounded px-1.5 py-0.5"
                            >
                              {DIETARY_LABELS[tag]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onEdit(po)}
                            aria-label={`Edit ${po.firstName} ${po.lastName}`}
                            className="p-1 text-muted hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onDelete(po.id)}
                            aria-label={`Delete ${po.firstName} ${po.lastName}`}
                            className="p-1 text-muted hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/app test -- --run guest-table`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/guest/guest-table.tsx apps/app/__tests__/components/guest/guest-table.test.tsx
git commit -m "feat(app): add GuestTable component with expandable plus-ones"
```

---

## Task 10: Bulk RSVP Bar Component + Tests

**Files:**
- Create: `apps/app/src/components/guest/bulk-rsvp-bar.tsx`
- Create: `apps/app/__tests__/components/guest/bulk-rsvp-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/app/__tests__/components/guest/bulk-rsvp-bar.test.tsx`:

```tsx
import { createElement } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkRsvpBar } from "../../../src/components/guest/bulk-rsvp-bar";

describe("BulkRsvpBar", () => {
  it("shows selected count", () => {
    render(
      <BulkRsvpBar
        selectedCount={5}
        onBulkUpdate={vi.fn()}
        isUpdating={false}
      />,
    );
    expect(screen.getByText("5 guests selected")).toBeInTheDocument();
  });

  it("calls onBulkUpdate with status when button clicked", () => {
    const onBulkUpdate = vi.fn();
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={onBulkUpdate}
        isUpdating={false}
      />,
    );
    fireEvent.click(screen.getByText("Accepted"));
    expect(onBulkUpdate).toHaveBeenCalledWith("accepted");
  });

  it("calls onBulkUpdate with invited status", () => {
    const onBulkUpdate = vi.fn();
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={onBulkUpdate}
        isUpdating={false}
      />,
    );
    fireEvent.click(screen.getByText("Invited"));
    expect(onBulkUpdate).toHaveBeenCalledWith("invited");
  });

  it("calls onBulkUpdate with declined status", () => {
    const onBulkUpdate = vi.fn();
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={onBulkUpdate}
        isUpdating={false}
      />,
    );
    fireEvent.click(screen.getByText("Declined"));
    expect(onBulkUpdate).toHaveBeenCalledWith("declined");
  });

  it("disables buttons when isUpdating", () => {
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={vi.fn()}
        isUpdating={true}
      />,
    );
    expect(screen.getByText("Accepted")).toBeDisabled();
    expect(screen.getByText("Declined")).toBeDisabled();
  });

  it("does not render when selectedCount is 0", () => {
    const { container } = render(
      <BulkRsvpBar
        selectedCount={0}
        onBulkUpdate={vi.fn()}
        isUpdating={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/app test -- --run bulk-rsvp-bar`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `apps/app/src/components/guest/bulk-rsvp-bar.tsx`:

```tsx
import { Button } from "../ui/button";
import type { RsvpStatus } from "@kaiplan/shared";

interface BulkRsvpBarProps {
  selectedCount: number;
  onBulkUpdate: (status: RsvpStatus) => void;
  isUpdating: boolean;
}

export function BulkRsvpBar({
  selectedCount,
  onBulkUpdate,
  isUpdating,
}: BulkRsvpBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background p-3 shadow-lg">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {selectedCount} guests selected
        </span>
        <div className="flex gap-2">
          <span className="text-sm text-muted self-center mr-1">Mark as:</span>
          <Button
            size="sm"
            variant="outline"
            disabled={isUpdating}
            onClick={() => onBulkUpdate("invited")}
          >
            Invited
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isUpdating}
            onClick={() => onBulkUpdate("accepted")}
            className="border-green-200 text-green-700 hover:bg-green-50"
          >
            Accepted
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isUpdating}
            onClick={() => onBulkUpdate("declined")}
            className="border-red-200 text-red-700 hover:bg-red-50"
          >
            Declined
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/app test -- --run bulk-rsvp-bar`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/guest/bulk-rsvp-bar.tsx apps/app/__tests__/components/guest/bulk-rsvp-bar.test.tsx
git commit -m "feat(app): add BulkRsvpBar component"
```

---

## Task 11: CSV Import Dialog Component + Tests

**Files:**
- Create: `apps/app/src/components/guest/csv-import-dialog.tsx`
- Create: `apps/app/__tests__/components/guest/csv-import-dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/app/__tests__/components/guest/csv-import-dialog.test.tsx`:

```tsx
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CsvImportDialog } from "../../../src/components/guest/csv-import-dialog";

describe("CsvImportDialog", () => {
  it("renders upload prompt when open", () => {
    render(
      <CsvImportDialog
        open={true}
        onOpenChange={vi.fn()}
        onImport={vi.fn()}
        isImporting={false}
      />,
    );
    expect(screen.getByText("Import Guests from CSV")).toBeInTheDocument();
    expect(screen.getByText(/drop a .csv file/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <CsvImportDialog
        open={false}
        onOpenChange={vi.fn()}
        onImport={vi.fn()}
        isImporting={false}
      />,
    );
    expect(screen.queryByText("Import Guests from CSV")).not.toBeInTheDocument();
  });

  it("shows file name after selection", async () => {
    render(
      <CsvImportDialog
        open={true}
        onOpenChange={vi.fn()}
        onImport={vi.fn()}
        isImporting={false}
      />,
    );

    const input = screen.getByLabelText("CSV file upload");
    const file = new File(["first_name,last_name\nJane,Doe"], "guests.csv", {
      type: "text/csv",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("guests.csv")).toBeInTheDocument();
    });
  });

  it("calls onImport with the file", async () => {
    const onImport = vi.fn();
    render(
      <CsvImportDialog
        open={true}
        onOpenChange={vi.fn()}
        onImport={onImport}
        isImporting={false}
      />,
    );

    const input = screen.getByLabelText("CSV file upload");
    const file = new File(["first_name,last_name\nJane,Doe"], "guests.csv", {
      type: "text/csv",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Import")).not.toBeDisabled();
    });

    fireEvent.click(screen.getByText("Import"));
    expect(onImport).toHaveBeenCalledWith(file);
  });

  it("disables import button when isImporting", async () => {
    render(
      <CsvImportDialog
        open={true}
        onOpenChange={vi.fn()}
        onImport={vi.fn()}
        isImporting={true}
      />,
    );

    const input = screen.getByLabelText("CSV file upload");
    const file = new File(["data"], "guests.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Importing...")).toBeDisabled();
    });
  });

  it("shows import results when provided", () => {
    render(
      <CsvImportDialog
        open={true}
        onOpenChange={vi.fn()}
        onImport={vi.fn()}
        isImporting={false}
        result={{ created: 5, errors: [{ row: 3, message: "Invalid email" }] }}
      />,
    );
    expect(screen.getByText("5 guests imported")).toBeInTheDocument();
    expect(screen.getByText("1 error")).toBeInTheDocument();
    expect(screen.getByText("Row 3: Invalid email")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/app test -- --run csv-import-dialog`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `apps/app/src/components/guest/csv-import-dialog.tsx`:

```tsx
import { useState, useRef } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";

interface ImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File) => void;
  isImporting: boolean;
  result?: ImportResult;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImport,
  isImporting,
  result,
}: CsvImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  function handleImport() {
    if (selectedFile) {
      onImport(selectedFile);
    }
  }

  function handleClose() {
    setSelectedFile(null);
    onOpenChange(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-4">
          Import Guests from CSV
        </h2>

        {result ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">
                {result.created} guests imported
              </span>
            </div>
            {result.errors.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">
                    {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2 text-xs">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-red-600">
                      Row {err.row}: {err.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={handleClose} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => inputRef.current?.click()}
            >
              {selectedFile ? (
                <>
                  <FileText className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {selectedFile.name}
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted" />
                  <p className="text-sm text-muted">
                    Drop a .csv file here or click to browse
                  </p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
                aria-label="CSV file upload"
              />
            </div>

            <p className="text-xs text-muted">
              Columns: first_name, last_name, email, phone, side, group_name,
              dietary_tags, dietary_notes. Max 500 rows, 5MB.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedFile || isImporting}
              >
                {isImporting ? "Importing..." : "Import"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/app test -- --run csv-import-dialog`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/guest/csv-import-dialog.tsx apps/app/__tests__/components/guest/csv-import-dialog.test.tsx
git commit -m "feat(app): add CsvImportDialog component"
```

---

## Task 12: Guest Widget Component + Tests

**Files:**
- Create: `apps/app/src/components/guest/guest-widget.tsx`
- Create: `apps/app/__tests__/components/guest/guest-widget.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/app/__tests__/components/guest/guest-widget.test.tsx`:

```tsx
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuestWidget } from "../../../src/components/guest/guest-widget";
import type { GuestSummary, GuestWithPlusOnes } from "@kaiplan/shared";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => createElement("a", { href: to, ...props }, children),
}));

vi.mock("../../../src/hooks/use-guests", () => ({
  useGuestSummary: vi.fn(),
  useGuests: vi.fn(),
}));

import { useGuestSummary, useGuests } from "../../../src/hooks/use-guests";

const mockUseGuestSummary = vi.mocked(useGuestSummary);
const mockUseGuests = vi.mocked(useGuests);

function makeSummary(overrides: Partial<GuestSummary> = {}): GuestSummary {
  return {
    totalGuests: 50,
    totalPrimary: 35,
    totalPlusOnes: 15,
    byRsvp: { pending: 10, invited: 15, accepted: 20, declined: 5 },
    byDietary: {
      vegetarian: 5, vegan: 2, gluten_free: 3, halal: 1,
      kosher: 0, nut_allergy: 1, dairy_free: 0, other: 0,
    },
    bySide: { partner1: 20, partner2: 18, mutual: 12 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GuestWidget", () => {
  it("renders summary stats when data is available", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);
    expect(screen.getByText("Guest List")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("View all")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);
    expect(screen.queryByText("Guest List")).not.toBeInTheDocument();
  });

  it("renders empty state when no guests", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({ totalGuests: 0 }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);
    expect(screen.getByText("No guests yet")).toBeInTheDocument();
  });

  it("shows recent guests", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);

    const guests: GuestWithPlusOnes[] = [
      {
        id: "g-1", weddingId: "w-1", primaryGuestId: null,
        firstName: "Jane", lastName: "Doe", email: null, phone: null,
        side: "partner1", groupName: null, dietaryTags: [], dietaryNotes: null,
        rsvpStatus: "accepted", sortOrder: 0,
        createdAt: "2026-04-07T00:00:00Z", updatedAt: "2026-04-07T00:00:00Z",
        plusOnes: [],
      },
    ];

    mockUseGuests.mockReturnValue({
      data: guests,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kaiplan/app test -- --run guest-widget`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `apps/app/src/components/guest/guest-widget.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useGuestSummary, useGuests } from "../../hooks/use-guests";
import type { RsvpStatus } from "@kaiplan/shared";

interface GuestWidgetProps {
  weddingId: string | null;
}

const RSVP_COLORS: Record<RsvpStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  invited: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
};

const RSVP_LABELS: Record<RsvpStatus, string> = {
  pending: "Pending",
  invited: "Invited",
  accepted: "Accepted",
  declined: "Declined",
};

export function GuestWidget({ weddingId }: GuestWidgetProps) {
  const { data: summary, isLoading: summaryLoading } =
    useGuestSummary(weddingId);
  const { data: guests, isLoading: guestsLoading } = useGuests(weddingId);

  if (summaryLoading || guestsLoading) {
    return (
      <div className="rounded-xl border border-border bg-background p-5">
        <div className="h-32 animate-pulse rounded-lg bg-muted/20" />
      </div>
    );
  }

  const isEmpty = !summary || summary.totalGuests === 0;

  if (isEmpty) {
    return (
      <div className="rounded-xl border border-border bg-background p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Guest List
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted">
          <Users className="h-8 w-8" />
          <p className="text-sm">No guests yet</p>
        </div>
      </div>
    );
  }

  // Flatten and sort by updatedAt descending, take 5
  const allGuests = (guests ?? []).flatMap((g) => [g, ...g.plusOnes]);
  const recentGuests = [...allGuests]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Guest List
        </h3>
        <Link
          to="/guests"
          className="text-xs font-medium text-primary hover:underline"
        >
          View all &rarr;
        </Link>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="flex flex-col">
          <span className="text-2xl font-semibold text-foreground">
            {summary.totalGuests}
          </span>
          <span className="text-xs text-muted">Total</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-green-600">
            {summary.byRsvp.accepted}
          </span>
          <span className="text-xs text-muted">Confirmed</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-amber-600">
            {summary.byRsvp.pending + summary.byRsvp.invited}
          </span>
          <span className="text-xs text-muted">Pending</span>
        </div>
      </div>

      {recentGuests.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {recentGuests.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-foreground">
                {g.firstName} {g.lastName}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${RSVP_COLORS[g.rsvpStatus]}`}
              >
                {RSVP_LABELS[g.rsvpStatus]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kaiplan/app test -- --run guest-widget`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/guest/guest-widget.tsx apps/app/__tests__/components/guest/guest-widget.test.tsx
git commit -m "feat(app): add GuestWidget dashboard component"
```

---

## Task 13: Wire Up Guest List Page + Dashboard Widget

**Files:**
- Modify: `apps/app/src/routes/_authenticated/guests.tsx`
- Modify: `apps/app/src/routes/_authenticated/dashboard.tsx`

- [ ] **Step 1: Replace guest list page placeholder**

Replace the entire contents of `apps/app/src/routes/_authenticated/guests.tsx` with the full guest list page that wires together all components: `GuestSummaryBar`, `GuestTable`, `GuestForm` (in Sheet), `BulkRsvpBar`, `CsvImportDialog`. Use the hooks from `use-guests.ts`. Handle state for: selected guest IDs, form open/close, edit vs create mode, plus-one mode, CSV dialog open/close, filter dropdowns.

```tsx
import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Upload } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Sheet } from "../../components/ui/sheet";
import { TopBar } from "../../components/top-bar";
import { GuestSummaryBar } from "../../components/guest/guest-summary-bar";
import { GuestTable } from "../../components/guest/guest-table";
import { GuestForm } from "../../components/guest/guest-form";
import { BulkRsvpBar } from "../../components/guest/bulk-rsvp-bar";
import { CsvImportDialog } from "../../components/guest/csv-import-dialog";
import {
  useGuests,
  useGuestSummary,
  useCreateGuest,
  useUpdateGuest,
  useDeleteGuest,
  useBulkUpdateRsvp,
  useImportGuestsCsv,
} from "../../hooks/use-guests";
import { useWeddings } from "../../hooks/use-weddings";
import { useActiveWedding } from "../../lib/wedding-context";
import type { Guest, GuestWithPlusOnes, RsvpStatus, GuestSide, CreateGuestInput } from "@kaiplan/shared";

export const Route = createFileRoute("/_authenticated/guests")({
  component: GuestsPage,
});

function GuestsPage() {
  const { auth } = Route.useRouteContext();
  const user = auth.user!;
  const { data: weddings = [] } = useWeddings();
  const { activeWeddingId, setActiveWeddingId } = useActiveWedding();

  const weddingId = activeWeddingId ?? (weddings.length > 0 ? weddings[0].id : null);

  // Filters
  const [sideFilter, setSideFilter] = useState<string>("");
  const [rsvpFilter, setRsvpFilter] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string>("");

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (sideFilter) f.side = sideFilter;
    if (rsvpFilter) f.rsvpStatus = rsvpFilter;
    if (groupFilter) f.groupName = groupFilter;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [sideFilter, rsvpFilter, groupFilter]);

  const { data: guests = [], isLoading } = useGuests(weddingId, filters);
  const { data: summary } = useGuestSummary(weddingId);

  // Mutations
  const createGuest = useCreateGuest(weddingId ?? "");
  const updateGuest = useUpdateGuest(weddingId ?? "");
  const deleteGuest = useDeleteGuest(weddingId ?? "");
  const bulkRsvp = useBulkUpdateRsvp(weddingId ?? "");
  const importCsv = useImportGuestsCsv(weddingId ?? "");

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [plusOneTarget, setPlusOneTarget] = useState<GuestWithPlusOnes | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // CSV dialog state
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; errors: { row: number; message: string }[] } | undefined>();

  // Extract unique group names for the form's combobox
  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const g of guests) {
      if (g.groupName) groups.add(g.groupName);
      for (const po of g.plusOnes) {
        if (po.groupName) groups.add(po.groupName);
      }
    }
    return Array.from(groups).sort();
  }, [guests]);

  function handleEdit(guest: Guest) {
    setEditingGuest(guest);
    setPlusOneTarget(null);
    setFormOpen(true);
  }

  function handleAddPlusOne(primary: GuestWithPlusOnes) {
    setEditingGuest(null);
    setPlusOneTarget(primary);
    setFormOpen(true);
  }

  function handleCreate() {
    setEditingGuest(null);
    setPlusOneTarget(null);
    setFormOpen(true);
  }

  function handleFormSubmit(data: CreateGuestInput) {
    if (editingGuest) {
      updateGuest.mutate(
        { guestId: editingGuest.id, data },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createGuest.mutate(data, { onSuccess: () => setFormOpen(false) });
    }
  }

  function handleDelete(guestId: string) {
    deleteGuest.mutate(guestId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(guestId);
      return next;
    });
  }

  function handleToggleSelect(guestId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) {
        next.delete(guestId);
      } else {
        next.add(guestId);
      }
      return next;
    });
  }

  function handleToggleSelectAll() {
    const allIds = guests.flatMap((g) => [g.id, ...g.plusOnes.map((p) => p.id)]);
    const allSelected = allIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }

  function handleBulkRsvp(status: RsvpStatus) {
    const updates = Array.from(selectedIds).map((id) => ({
      id,
      rsvpStatus: status,
    }));
    bulkRsvp.mutate(updates, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  }

  function handleCsvImport(file: File) {
    importCsv.mutate(file, {
      onSuccess: (data) => {
        setCsvResult(data as { created: number; errors: { row: number; message: string }[] });
      },
    });
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <TopBar
        user={{ name: user.name, email: user.email }}
        weddings={weddings}
        activeWeddingId={weddingId ?? ""}
        onSelectWedding={(id) => setActiveWeddingId(id)}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-heading text-2xl font-semibold text-foreground">
              Guest List
            </h1>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCsvResult(undefined);
                  setCsvOpen(true);
                }}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                Import CSV
              </Button>
              <Button size="sm" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Guest
              </Button>
            </div>
          </div>

          {summary && <GuestSummaryBar summary={summary} />}

          <div className="flex gap-2 flex-wrap">
            <select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">All Sides</option>
              <option value="partner1">Partner 1</option>
              <option value="partner2">Partner 2</option>
              <option value="mutual">Mutual</option>
            </select>
            <select
              value={rsvpFilter}
              onChange={(e) => setRsvpFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">All RSVP</option>
              <option value="pending">Pending</option>
              <option value="invited">Invited</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </select>
            {existingGroups.length > 0 && (
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="">All Groups</option>
                {existingGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
          </div>

          <GuestTable
            guests={guests}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddPlusOne={handleAddPlusOne}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
          />
        </div>
      </main>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <div className="p-6">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-4">
            {editingGuest
              ? `Edit ${editingGuest.firstName} ${editingGuest.lastName}`
              : plusOneTarget
                ? `Add Plus-One for ${plusOneTarget.firstName} ${plusOneTarget.lastName}`
                : "Add Guest"}
          </h2>
          <GuestForm
            guest={editingGuest ?? undefined}
            onSubmit={handleFormSubmit}
            onCancel={() => setFormOpen(false)}
            existingGroups={existingGroups}
            defaultSide={plusOneTarget?.side}
            primaryGuestId={plusOneTarget?.id}
            isSubmitting={createGuest.isPending || updateGuest.isPending}
          />
        </div>
      </Sheet>

      <BulkRsvpBar
        selectedCount={selectedIds.size}
        onBulkUpdate={handleBulkRsvp}
        isUpdating={bulkRsvp.isPending}
      />

      <CsvImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        onImport={handleCsvImport}
        isImporting={importCsv.isPending}
        result={csvResult}
      />
    </>
  );
}
```

- [ ] **Step 2: Replace guest ModuleCard with GuestWidget on dashboard**

In `apps/app/src/routes/_authenticated/dashboard.tsx`:

Add import:
```typescript
import { GuestWidget } from "../../components/guest/guest-widget";
```

Replace the Guest List `ModuleCard` block with:
```tsx
<GuestWidget weddingId={resolvedWeddingId} />
```

Remove the `Users` import from lucide-react if no longer used.

- [ ] **Step 3: Run typecheck**

Run: `turbo typecheck`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `turbo test:coverage`
Expected: All passing, 95%+ per file on new files

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/routes/_authenticated/guests.tsx apps/app/src/routes/_authenticated/dashboard.tsx
git commit -m "feat(app): wire up guest list page and dashboard widget"
```

---

## Task 14: Final Integration Verification

- [ ] **Step 1: Run full monorepo typecheck**

Run: `turbo typecheck`
Expected: PASS across all packages

- [ ] **Step 2: Run full monorepo test suite with coverage**

Run: `turbo test:coverage`
Expected: All new files at 95%+, no regressions

- [ ] **Step 3: Run dev server and smoke test**

Run: `turbo dev`
Verify manually:
- Navigate to `/dashboard` — guest widget shows
- Navigate to `/guests` — guest list page loads
- Add a guest via the form
- Add a plus-one
- Bulk select and update RSVP
- Open CSV import dialog

- [ ] **Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: final Phase 2 integration polish"
```
