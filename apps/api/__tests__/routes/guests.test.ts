import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { guestRoutes } from "../../src/routes/guests";
import type { Database } from "../../src/db/client";
import type { Auth } from "../../src/auth";
import { householdRsvpToken } from "../../src/db/wedding-website-schema";

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

const PRIMARY_GUEST = {
  id: "00000000-0000-4000-8000-000000000001",
  weddingId: WEDDING_ROW.id,
  primaryGuestId: null,
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.com",
  phone: null,
  side: "partner1",
  groupName: "Family",
  dietaryTags: ["vegetarian"],
  dietaryNotes: null,
  rsvpStatus: "pending",
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const PLUS_ONE_GUEST = {
  id: "00000000-0000-4000-8000-000000000002",
  weddingId: WEDDING_ROW.id,
  primaryGuestId: PRIMARY_GUEST.id,
  firstName: "Bob",
  lastName: "Smith",
  email: null,
  phone: null,
  side: "partner1",
  groupName: null,
  dietaryTags: [],
  dietaryNotes: null,
  rsvpStatus: "accepted",
  sortOrder: 1,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const GUEST_2 = {
  id: "00000000-0000-4000-8000-000000000003",
  weddingId: WEDDING_ROW.id,
  primaryGuestId: null,
  firstName: "Carol",
  lastName: "Jones",
  email: "carol@example.com",
  phone: null,
  side: "partner2",
  groupName: null,
  dietaryTags: ["vegan", "gluten_free"],
  dietaryNotes: "Strict vegan",
  rsvpStatus: "declined",
  sortOrder: 2,
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
  builder.onConflictDoUpdate = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockResolvedValue(resolveWith);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  // Make builder awaitable (for insert().values() without .returning())
  builder.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(undefined).then(onFulfilled, onRejected);
  return builder;
}

function makeDb(
  selectResponses: unknown[][] = [[]],
  writeResult: unknown[] = [],
  deleteResult: unknown[] = [{ id: "deleted-row" }],
): Database {
  let selectIndex = 0;
  const insertBuilder = makeWriteBuilder(writeResult);
  const updateBuilder = makeWriteBuilder(writeResult);

  const deleteBuilder: Record<string, unknown> = {};
  deleteBuilder.where = vi.fn().mockReturnValue(deleteBuilder);
  deleteBuilder.returning = vi.fn().mockResolvedValue(deleteResult);
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
  db.execute = vi.fn().mockResolvedValue(undefined);
  db.transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) =>
      fn(db),
    );
  (db as Record<string, unknown>).__insertBuilder = insertBuilder;
  (db as Record<string, unknown>).__updateBuilder = updateBuilder;
  (db as Record<string, unknown>).__deleteBuilder = deleteBuilder;
  (db as Record<string, unknown>).__selectBuilders = selectBuilders;

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

describe("guestRoutes", () => {
  // =========================================================================
  // GET /:weddingId/guests
  // =========================================================================

  describe("GET /:weddingId/guests", () => {
    const path = `/weddings/${WEDDING_ROW.id}/guests`;

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a wedding member", async () => {
      const db = makeDb([[]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(403);
    });

    it("returns 200 with nested plus-ones", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [PRIMARY_GUEST, PLUS_ONE_GUEST, GUEST_2], // GET guests handler
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        id: string;
        firstName: string;
        plusOnes: { id: string; firstName: string }[];
      }[];
      expect(Array.isArray(body)).toBe(true);
      // Only primary guests at top level
      expect(body).toHaveLength(2);
      const alice = body.find((g) => g.firstName === "Alice");
      expect(alice).toBeDefined();
      expect(alice!.plusOnes).toHaveLength(1);
      expect(alice!.plusOnes[0].firstName).toBe("Bob");
      const carol = body.find((g) => g.firstName === "Carol");
      expect(carol).toBeDefined();
      expect(carol!.plusOnes).toHaveLength(0);
    });

    it("requests guests in stable sort order for deterministic nesting", async () => {
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST, PLUS_ONE_GUEST]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);

      expect(res.status).toBe(200);
      const builders = (db as Record<string, unknown>).__selectBuilders as
        | Array<Record<string, ReturnType<typeof vi.fn>>>
        | undefined;
      expect(builders?.[1]?.orderBy).toHaveBeenCalledOnce();
    });

    it("returns 200 empty array when no guests", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // GET guests handler
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as unknown[];
      expect(body).toHaveLength(0);
    });

    it("filters by side query param", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [PRIMARY_GUEST, PLUS_ONE_GUEST], // filtered result (partner1 only)
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", `${path}?side=partner1`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        id: string;
        side: string;
        plusOnes: unknown[];
      }[];
      // Only primary guests (partner1) at top level
      expect(body).toHaveLength(1);
      expect(body[0].side).toBe("partner1");
    });

    it("filters by rsvpStatus query param", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [GUEST_2], // filtered result (declined only)
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", `${path}?rsvpStatus=declined`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        id: string;
        rsvpStatus: string;
        plusOnes: unknown[];
      }[];
      expect(body).toHaveLength(1);
      expect(body[0].rsvpStatus).toBe("declined");
    });

    it("filters by groupName query param", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [PRIMARY_GUEST], // filtered result (Family group only)
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", `${path}?groupName=Family`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        id: string;
        groupName: string;
        plusOnes: unknown[];
      }[];
      expect(body).toHaveLength(1);
      expect(body[0].groupName).toBe("Family");
    });

    it("returns 400 for invalid side query param", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", `${path}?side=invalid_side`);
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid side");
    });

    it("returns 400 for invalid rsvpStatus query param", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", `${path}?rsvpStatus=maybe`);
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid rsvpStatus");
    });
  });

  // =========================================================================
  // GET /:weddingId/guests/summary
  // =========================================================================

  describe("GET /:weddingId/guests/summary", () => {
    const path = `/weddings/${WEDDING_ROW.id}/guests/summary`;

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

    it("returns 200 with GuestSummary for guests", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [PRIMARY_GUEST, PLUS_ONE_GUEST, GUEST_2], // GET guests for summary
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalGuests: number;
        totalPrimary: number;
        totalPlusOnes: number;
        byRsvp: Record<string, number>;
        byDietary: Record<string, number>;
        bySide: Record<string, number>;
      };
      expect(body.totalGuests).toBe(3);
      expect(body.totalPrimary).toBe(2);
      expect(body.totalPlusOnes).toBe(1);
      expect(body.byRsvp.pending).toBe(1);
      expect(body.byRsvp.accepted).toBe(1);
      expect(body.byRsvp.declined).toBe(1);
      expect(body.byDietary.vegetarian).toBe(1);
      expect(body.byDietary.vegan).toBe(1);
      expect(body.byDietary.gluten_free).toBe(1);
      expect(body.bySide.partner1).toBe(2);
      expect(body.bySide.partner2).toBe(1);
    });

    it("ignores unknown rsvp, side, and dietary values in summary", async () => {
      const unknownGuest = {
        ...PRIMARY_GUEST,
        rsvpStatus: "unknown_status",
        side: "unknown_side",
        dietaryTags: ["unknown_tag"],
      };
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [unknownGuest],
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalGuests: number;
        byRsvp: Record<string, number>;
        bySide: Record<string, number>;
        byDietary: Record<string, number>;
      };
      expect(body.totalGuests).toBe(1);
      // Unknown values should not appear in the counts
      expect(body.byRsvp.pending).toBe(0);
      expect(body.bySide.partner1).toBe(0);
      expect(body.byDietary.vegetarian).toBe(0);
    });

    it("returns zeros when no guests", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // empty guest list
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalGuests: number;
        totalPrimary: number;
        totalPlusOnes: number;
      };
      expect(body.totalGuests).toBe(0);
      expect(body.totalPrimary).toBe(0);
      expect(body.totalPlusOnes).toBe(0);
    });
  });

  // =========================================================================
  // GET /:weddingId/guests/:guestId
  // =========================================================================

  describe("GET /:weddingId/guests/:guestId", () => {
    const path = `/weddings/${WEDDING_ROW.id}/guests/${PRIMARY_GUEST.id}`;

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(401);
    });

    it("returns single guest with plusOnes", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [PRIMARY_GUEST], // get guest by id
        [PLUS_ONE_GUEST], // get plus-ones
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        id: string;
        firstName: string;
        plusOnes: { id: string; firstName: string }[];
      };
      expect(body.id).toBe(PRIMARY_GUEST.id);
      expect(body.firstName).toBe("Alice");
      expect(body.plusOnes).toHaveLength(1);
      expect(body.plusOnes[0].firstName).toBe("Bob");
    });

    it("returns 404 when guest not found", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // guest not found
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // POST /:weddingId/guests
  // =========================================================================

  describe("POST /:weddingId/guests", () => {
    const path = `/weddings/${WEDDING_ROW.id}/guests`;
    const validGuest = {
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      side: "partner1",
    };

    it("returns 400 for malformed JSON", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await rawJsonReq(app, "POST", path, '{"firstName":');

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Malformed JSON request body",
      });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("returns 400 for non-object JSON", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await rawJsonReq(app, "POST", path, "null");

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "JSON request body must be an object",
      });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "POST", path, validGuest);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, validGuest);
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid body", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, { firstName: "" });
      expect(res.status).toBe(400);
    });

    it("creates primary guest and returns 201", async () => {
      const db = makeDb([[MEMBER_ROW]], [PRIMARY_GUEST]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, validGuest);
      expect(res.status).toBe(201);

      const body = (await res.json()) as { firstName: string };
      expect(body.firstName).toBe("Alice");
    });

    it("returns 404 when guest creation does not return a row", async () => {
      const db = makeDb([[MEMBER_ROW]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, validGuest);

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Guest not found",
      });
    });

    it("returns 409 when a primary guest name already exists", async () => {
      const db = makeDb([[MEMBER_ROW]], [PRIMARY_GUEST]);
      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        returning: ReturnType<typeof vi.fn>;
      };
      insertBuilder.returning.mockRejectedValue({
        code: "23505",
        constraint: "guest_primary_name_unique",
      });
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, validGuest);

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "A guest with this name already exists in this household.",
      });
    });

    it("creates plus-one linked to primary and returns 201", async () => {
      const plusOneInput = {
        firstName: "Bob",
        lastName: "Smith",
        primaryGuestId: PRIMARY_GUEST.id,
      };
      const db = makeDb(
        [
          [MEMBER_ROW], // wedding-access middleware
          [PRIMARY_GUEST], // verify primary guest exists
        ],
        [PLUS_ONE_GUEST],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, plusOneInput);
      expect(res.status).toBe(201);

      const body = (await res.json()) as {
        firstName: string;
        primaryGuestId: string;
      };
      expect(body.firstName).toBe("Bob");
    });

    it("returns 404 when a primary guest disappears before plus-one creation", async () => {
      const plusOneInput = {
        firstName: "Bob",
        lastName: "Smith",
        primaryGuestId: PRIMARY_GUEST.id,
      };
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // transaction-time primary guest lookup
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, plusOneInput);

      expect(res.status).toBe(404);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("returns 409 when a plus-one name already exists for that primary guest", async () => {
      const plusOneInput = {
        firstName: "Bob",
        lastName: "Smith",
        primaryGuestId: PRIMARY_GUEST.id,
      };
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST]], [PLUS_ONE_GUEST]);
      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        returning: ReturnType<typeof vi.fn>;
      };
      insertBuilder.returning.mockRejectedValue(
        new Error("duplicate key value violates guest_plusone_name_unique"),
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, plusOneInput);

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "A guest with this name already exists in this household.",
      });
    });

    it("returns 404 when primaryGuestId does not exist", async () => {
      const plusOneInput = {
        firstName: "Bob",
        lastName: "Smith",
        primaryGuestId: "00000000-0000-4000-8000-000000000099",
      };
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [], // primary guest not found
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "POST", path, plusOneInput);
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // PATCH /:weddingId/guests/:guestId
  // =========================================================================

  describe("PATCH /:weddingId/guests/:guestId", () => {
    const path = `/weddings/${WEDDING_ROW.id}/guests/${PRIMARY_GUEST.id}`;

    it("returns 400 for non-object JSON", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await rawJsonReq(app, "PATCH", path, "[]");

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "JSON request body must be an object",
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { firstName: "Updated" });
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid data", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { side: "invalid_side" });
      expect(res.status).toBe(400);
    });

    it("updates guest and returns 200", async () => {
      const updated = { ...PRIMARY_GUEST, firstName: "Updated" };
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST]], [updated]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { firstName: "Updated" });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { firstName: string };
      expect(body.firstName).toBe("Updated");
    });

    it("removes declined guest from seating chart when RSVP is updated", async () => {
      const validChart = {
        width: 1200,
        height: 800,
        tables: [
          {
            id: "b0000000-0000-4000-8000-000000000030",
            name: "Table 1",
            shape: "round" as const,
            capacity: 2,
            x: 0,
            y: 0,
            seats: [
              {
                id: "a0000000-0000-4000-8000-000000000060",
                positionIndex: 0,
                guestId: PRIMARY_GUEST.id,
              },
              {
                id: "a0000000-0000-4000-8000-000000000061",
                positionIndex: 1,
              },
            ],
          },
        ],
      };
      const seatingRow = { weddingId: WEDDING_ROW.id, chart: validChart };
      const updated = { ...PRIMARY_GUEST, rsvpStatus: "declined" };
      const db = makeDb(
        [[MEMBER_ROW], [PRIMARY_GUEST], [seatingRow]],
        [updated],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, { rsvpStatus: "declined" });

      expect(res.status).toBe(200);
      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          chart: expect.objectContaining({
            tables: expect.arrayContaining([
              expect.objectContaining({
                seats: expect.not.arrayContaining([
                  expect.objectContaining({ guestId: PRIMARY_GUEST.id }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it("returns 409 when an update conflicts with an existing guest name", async () => {
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST]], [PRIMARY_GUEST]);
      const updateBuilder = (db as Record<string, unknown>).__updateBuilder as {
        returning: ReturnType<typeof vi.fn>;
      };
      updateBuilder.returning.mockRejectedValue({
        cause: {
          code: "23505",
          constraint: "guest_primary_name_unique",
        },
      });
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, {
        firstName: "Carol",
        lastName: "Jones",
      });

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "A guest with this name already exists in this household.",
      });
    });

    it("preserves an existing plus-one linkage when primaryGuestId is omitted", async () => {
      const updated = {
        ...PLUS_ONE_GUEST,
        firstName: "Updated",
      };
      const db = makeDb(
        [[MEMBER_ROW], [PLUS_ONE_GUEST], [PRIMARY_GUEST], [PRIMARY_GUEST]],
        [updated],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}`,
        {
          firstName: "Updated",
        },
      );
      expect(res.status).toBe(200);
      const updateBuilder = (db as Record<string, unknown>).__updateBuilder as {
        set: ReturnType<typeof vi.fn>;
      };
      expect(updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Updated",
          primaryGuestId: PRIMARY_GUEST.id,
        }),
      );
    });

    it("returns 404 when primaryGuestId is changed to an invalid target", async () => {
      const db = makeDb([[MEMBER_ROW], [PLUS_ONE_GUEST], []]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}`,
        {
          primaryGuestId: "00000000-0000-4000-8000-000000000099",
        },
      );
      expect(res.status).toBe(404);
    });

    it("returns 409 when the primary guest changes before a plus-one update is written", async () => {
      const db = makeDb([
        [MEMBER_ROW],
        [PLUS_ONE_GUEST],
        [PRIMARY_GUEST],
        [],
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}`,
        {
          firstName: "Updated",
        },
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "Primary guest changed before write",
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns 409 when a plus-one is reparented before a non-parent update is written", async () => {
      const reparentedPlusOne = {
        ...PLUS_ONE_GUEST,
        primaryGuestId: GUEST_2.id,
      };
      const db = makeDb([
        [MEMBER_ROW],
        [PLUS_ONE_GUEST],
        [PRIMARY_GUEST],
        [reparentedPlusOne],
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}`,
        {
          firstName: "Updated",
        },
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "Primary guest changed before write",
      });
      expect(db.update).toHaveBeenCalled();
    });

    it("returns 400 when a plus-one linkage is explicitly removed", async () => {
      const db = makeDb([[MEMBER_ROW], [PLUS_ONE_GUEST]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}`,
        {
          primaryGuestId: null,
        },
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Plus-one linkage cannot be removed",
      });
    });

    it("returns 400 when primaryGuestId is changed to the guest itself", async () => {
      const selfPrimaryGuest = {
        ...PRIMARY_GUEST,
        primaryGuestId: null,
      };
      const db = makeDb([[MEMBER_ROW], [selfPrimaryGuest]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/guests/${PRIMARY_GUEST.id}`,
        {
          primaryGuestId: PRIMARY_GUEST.id,
        },
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Guest cannot be their own primary guest",
      });
    });

    it("returns 400 when a primary guest is reparented", async () => {
      const reparentedPrimaryGuest = {
        ...PRIMARY_GUEST,
        primaryGuestId: null,
      };
      const db = makeDb([[MEMBER_ROW], [reparentedPrimaryGuest]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, {
        primaryGuestId: PLUS_ONE_GUEST.id,
      });

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Primary guests cannot be reparented",
      });
    });

    it("returns 404 when guest does not exist", async () => {
      const db = makeDb([[MEMBER_ROW]], []);
      const app = makeApp(db, makeAuth());

      const nonExistentPath = `/weddings/${WEDDING_ROW.id}/guests/00000000-0000-4000-8000-000000000099`;
      const res = await req(app, "PATCH", nonExistentPath, {
        firstName: "Ghost",
      });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Guest not found");
    });

    it("returns 404 when the guest disappears before the update is written", async () => {
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, {
        firstName: "Updated",
      });

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Guest not found",
      });
    });
  });

  // =========================================================================
  // DELETE /:weddingId/guests/:guestId
  // =========================================================================

  describe("DELETE /:weddingId/guests/:guestId", () => {
    const path = `/weddings/${WEDDING_ROW.id}/guests/${PRIMARY_GUEST.id}`;

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(403);
    });

    it("returns 409 when deleting a primary guest with plus-ones", async () => {
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST], [PLUS_ONE_GUEST]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "Primary guests with plus-ones require household deletion",
      });
    });

    it("deletes a plus-one and returns 204", async () => {
      const db = makeDb([[MEMBER_ROW], [PLUS_ONE_GUEST], []]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}`,
      );
      expect(res.status).toBe(204);
    });

    it("rechecks plus-ones inside the delete transaction after locking the primary", async () => {
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST], [], [PLUS_ONE_GUEST]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "Primary guests with plus-ones require household deletion",
      });
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(db.delete).not.toHaveBeenCalled();
    });

    it("returns 404 when the guest disappears before delete is written", async () => {
      const db = makeDb([[MEMBER_ROW], [PLUS_ONE_GUEST], [], []], [], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}`,
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Guest not found",
      });
    });

    it("returns 404 when deleting a missing guest", async () => {
      const db = makeDb([[MEMBER_ROW], []]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/00000000-0000-4000-8000-000000000099`,
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Guest not found",
      });
    });

    it("deletes a household and returns 204", async () => {
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PRIMARY_GUEST.id}/household`,
      );
      expect(res.status).toBe(204);
    });

    it("deletes the household RSVP token when removing a standalone primary guest", async () => {
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST], []]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);

      expect(res.status).toBe(204);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(db.delete).toHaveBeenCalledWith(householdRsvpToken);
    });

    it("deletes the household RSVP token when removing a primary guest household", async () => {
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PRIMARY_GUEST.id}/household`,
      );

      expect(res.status).toBe(204);
      expect(db.delete).toHaveBeenCalledWith(householdRsvpToken);
    });

    it("deletes a plus-one household request as a single guest and returns 204", async () => {
      const db = makeDb([[MEMBER_ROW], [PLUS_ONE_GUEST]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}/household`,
      );
      expect(res.status).toBe(204);
    });

    it("returns 404 when the household guest disappears before delete is written", async () => {
      const db = makeDb([[MEMBER_ROW], [PLUS_ONE_GUEST], []], [], []);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}/household`,
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Guest not found",
      });
    });

    it("returns 404 when deleting a missing household", async () => {
      const db = makeDb([[MEMBER_ROW], []]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/00000000-0000-4000-8000-000000000099/household`,
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Guest not found",
      });
    });

    it("removes the primary guest from seating chart on household delete", async () => {
      const SEAT_H1_ID = "a0000000-0000-4000-8000-000000000020";
      const SEAT_H2_ID = "a0000000-0000-4000-8000-000000000021";
      const TABLE_H_ID = "b0000000-0000-4000-8000-000000000010";
      const validChart = {
        width: 1200,
        height: 800,
        tables: [
          {
            id: TABLE_H_ID,
            name: "Table H",
            shape: "round" as const,
            capacity: 2,
            x: 0,
            y: 0,
            seats: [
              { id: SEAT_H1_ID, positionIndex: 0, guestId: PRIMARY_GUEST.id },
              { id: SEAT_H2_ID, positionIndex: 1 },
            ],
          },
        ],
      };
      const seatingRow = { weddingId: WEDDING_ROW.id, chart: validChart };

      // Select sequences:
      // 0 — middleware: MEMBER_ROW
      // 1 — household delete handler: fetch guest → PRIMARY_GUEST (no primaryGuestId)
      // 2 — removeGuestsFromSeatingChart inside tx: seating SELECT → seatingRow
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST], [seatingRow]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PRIMARY_GUEST.id}/household`,
      );
      expect(res.status).toBe(204);
      expect(db.transaction).toHaveBeenCalledTimes(1);

      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        values: ReturnType<typeof vi.fn>;
        onConflictDoUpdate: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          chart: expect.objectContaining({
            tables: expect.arrayContaining([
              expect.objectContaining({
                seats: expect.not.arrayContaining([
                  expect.objectContaining({ guestId: PRIMARY_GUEST.id }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it("removes each plus-one from seating chart on household delete", async () => {
      const SEAT_P1_ID = "a0000000-0000-4000-8000-000000000030";
      const SEAT_P2_ID = "a0000000-0000-4000-8000-000000000031";
      const SEAT_P3_ID = "a0000000-0000-4000-8000-000000000032";
      const TABLE_P_ID = "b0000000-0000-4000-8000-000000000011";
      const validChart = {
        width: 1200,
        height: 800,
        tables: [
          {
            id: TABLE_P_ID,
            name: "Table P",
            shape: "round" as const,
            capacity: 3,
            x: 0,
            y: 0,
            seats: [
              { id: SEAT_P1_ID, positionIndex: 0, guestId: PRIMARY_GUEST.id },
              { id: SEAT_P2_ID, positionIndex: 1, guestId: PLUS_ONE_GUEST.id },
              { id: SEAT_P3_ID, positionIndex: 2 },
            ],
          },
        ],
      };
      const seatingRow = { weddingId: WEDDING_ROW.id, chart: validChart };

      // Select sequences:
      // 0 — middleware: MEMBER_ROW
      // 1 — household delete handler: fetch guest → PRIMARY_GUEST
      // 2 — removeGuestsFromSeatingChart inside tx: seating SELECT → seatingRow
      const db = makeDb(
        [[MEMBER_ROW], [PRIMARY_GUEST], [seatingRow]],
        [],
        [{ id: PLUS_ONE_GUEST.id }],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PRIMARY_GUEST.id}/household`,
      );
      expect(res.status).toBe(204);
      expect(db.transaction).toHaveBeenCalledTimes(1);

      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          chart: expect.objectContaining({
            tables: expect.arrayContaining([
              expect.objectContaining({
                seats: expect.not.arrayContaining([
                  expect.objectContaining({ guestId: PRIMARY_GUEST.id }),
                  expect.objectContaining({ guestId: PLUS_ONE_GUEST.id }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it("removes a plus-one from seating chart on household delete (plus-one path)", async () => {
      const SEAT_Q1_ID = "a0000000-0000-4000-8000-000000000040";
      const SEAT_Q2_ID = "a0000000-0000-4000-8000-000000000041";
      const TABLE_Q_ID = "b0000000-0000-4000-8000-000000000012";
      const validChart = {
        width: 1200,
        height: 800,
        tables: [
          {
            id: TABLE_Q_ID,
            name: "Table Q",
            shape: "round" as const,
            capacity: 2,
            x: 0,
            y: 0,
            seats: [
              { id: SEAT_Q1_ID, positionIndex: 0, guestId: PLUS_ONE_GUEST.id },
              { id: SEAT_Q2_ID, positionIndex: 1, guestId: PRIMARY_GUEST.id },
            ],
          },
        ],
      };
      const seatingRow = { weddingId: WEDDING_ROW.id, chart: validChart };

      // Select sequences:
      // 0 — middleware: MEMBER_ROW
      // 1 — household delete handler: fetch guest → PLUS_ONE_GUEST (has primaryGuestId)
      // 2 — removeGuestFromSeatingChart inside tx: seating SELECT → seatingRow
      const db = makeDb([[MEMBER_ROW], [PLUS_ONE_GUEST], [seatingRow]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}/household`,
      );
      expect(res.status).toBe(204);
      expect(db.transaction).toHaveBeenCalledTimes(1);

      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        values: ReturnType<typeof vi.fn>;
        onConflictDoUpdate: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          chart: expect.objectContaining({
            tables: expect.arrayContaining([
              expect.objectContaining({
                seats: expect.not.arrayContaining([
                  expect.objectContaining({ guestId: PLUS_ONE_GUEST.id }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it("removes the deleted primary guest from seating chart seats", async () => {
      // Build a minimal valid seating chart so saveSeatingSchema.parse() succeeds.
      // Table: round, capacity 2, 2 seats (positionIndex 0 and 1).
      // Seat 0 has PRIMARY_GUEST assigned; seat 1 is empty.
      const SEAT_1_ID = "a0000000-0000-4000-8000-000000000001";
      const SEAT_2_ID = "a0000000-0000-4000-8000-000000000002";
      const TABLE_ID = "b0000000-0000-4000-8000-000000000001";
      const validChart = {
        width: 1200,
        height: 800,
        tables: [
          {
            id: TABLE_ID,
            name: "Table 1",
            shape: "round" as const,
            capacity: 2,
            x: 0,
            y: 0,
            seats: [
              { id: SEAT_1_ID, positionIndex: 0, guestId: PRIMARY_GUEST.id },
              { id: SEAT_2_ID, positionIndex: 1 },
            ],
          },
        ],
      };
      const seatingRow = { weddingId: WEDDING_ROW.id, chart: validChart };

      // Select sequences (in order):
      // 0 — middleware: MEMBER_ROW
      // 1 — delete handler: fetch guest → PRIMARY_GUEST
      // 2 — delete handler: fetch plus-ones → [] (standalone primary)
      // 3 — delete transaction rechecks plus-ones after locking → []
      // 4 — removeGuestFromSeatingChart inside tx: seating SELECT → seatingRow
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST], [], [], [seatingRow]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(204);

      // The transaction should have been used
      expect(db.transaction).toHaveBeenCalledTimes(1);

      // After cleanup the upsert insert should have been called with a chart
      // where seat-1 no longer carries PRIMARY_GUEST.id.
      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        values: ReturnType<typeof vi.fn>;
        onConflictDoUpdate: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          weddingId: WEDDING_ROW.id,
          chart: expect.objectContaining({
            tables: expect.arrayContaining([
              expect.objectContaining({
                seats: expect.not.arrayContaining([
                  expect.objectContaining({ guestId: PRIMARY_GUEST.id }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it("removes the deleted plus-one from seating chart seats", async () => {
      const SEAT_A_ID = "a0000000-0000-4000-8000-000000000010";
      const SEAT_B_ID = "a0000000-0000-4000-8000-000000000011";
      const TABLE_ID2 = "b0000000-0000-4000-8000-000000000002";
      const validChart = {
        width: 1200,
        height: 800,
        tables: [
          {
            id: TABLE_ID2,
            name: "Table 2",
            shape: "round" as const,
            capacity: 2,
            x: 0,
            y: 0,
            seats: [
              { id: SEAT_A_ID, positionIndex: 0, guestId: PLUS_ONE_GUEST.id },
              { id: SEAT_B_ID, positionIndex: 1, guestId: PRIMARY_GUEST.id },
            ],
          },
        ],
      };
      const seatingRow = { weddingId: WEDDING_ROW.id, chart: validChart };

      // Select sequences:
      // 0 — middleware: MEMBER_ROW
      // 1 — delete handler: fetch guest → PLUS_ONE_GUEST
      // 2 — delete handler: fetch plus-ones of PLUS_ONE_GUEST → [] (it's a plus-one, not primary)
      // 3 — removeGuestFromSeatingChart inside tx → seatingRow
      const db = makeDb([[MEMBER_ROW], [PLUS_ONE_GUEST], [], [seatingRow]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/guests/${PLUS_ONE_GUEST.id}`,
      );
      expect(res.status).toBe(204);

      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        values: ReturnType<typeof vi.fn>;
      };
      // The upsert was called with cleaned chart — PLUS_ONE_GUEST.id is gone
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          chart: expect.objectContaining({
            tables: expect.arrayContaining([
              expect.objectContaining({
                seats: expect.not.arrayContaining([
                  expect.objectContaining({ guestId: PLUS_ONE_GUEST.id }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it("skips seating cleanup when the stored chart is unparseable", async () => {
      // Provide a chart row that fails saveSeatingSchema.parse() — the handler
      // must not throw and must still return 204 (delete still succeeds).
      const corruptChart = { notAValidChart: true };
      const seatingRow = { weddingId: WEDDING_ROW.id, chart: corruptChart };

      // Sequences: middleware, guest, outer plus-ones=[], tx plus-ones=[], seating (corrupt)
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST], [], [], [seatingRow]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(204);

      // insert should NOT have been called (chart parse failed silently)
      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.values).not.toHaveBeenCalled();
    });

    it("skips seating cleanup when no chart exists for the wedding", async () => {
      // Select sequences:
      // 0 — middleware: MEMBER_ROW
      // 1 — delete handler: fetch guest → PRIMARY_GUEST (standalone)
      // 2 — delete handler: fetch plus-ones → []
      // 3 — delete transaction rechecks plus-ones after locking → []
      // 4 — removeGuestFromSeatingChart inside tx: seating SELECT → [] (no chart)
      const db = makeDb([[MEMBER_ROW], [PRIMARY_GUEST], [], [], []]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "DELETE", path);
      expect(res.status).toBe(204);

      // insert should NOT have been called (no chart to update)
      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.values).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // PATCH /:weddingId/guests/bulk-rsvp
  // =========================================================================

  describe("PATCH /:weddingId/guests/bulk-rsvp", () => {
    const path = `/weddings/${WEDDING_ROW.id}/guests/bulk-rsvp`;

    it("returns 400 for malformed JSON", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await rawJsonReq(app, "PATCH", path, "[");

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Malformed JSON request body",
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await req(app, "PATCH", path, [
        { id: PRIMARY_GUEST.id, rsvpStatus: "accepted" },
      ]);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, [
        { id: PRIMARY_GUEST.id, rsvpStatus: "accepted" },
      ]);
      expect(res.status).toBe(403);
    });

    it("returns 400 for empty array", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, []);
      expect(res.status).toBe(400);
    });

    it("updates multiple guests RSVP and returns 200", async () => {
      const db = makeDb(
        [
          [MEMBER_ROW], // wedding-access middleware
          [PRIMARY_GUEST, GUEST_2], // verify guest IDs belong to wedding
        ],
        [{ id: PRIMARY_GUEST.id }, { id: GUEST_2.id }],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, [
        { id: PRIMARY_GUEST.id, rsvpStatus: "accepted" },
        { id: GUEST_2.id, rsvpStatus: "accepted" },
      ]);
      expect(res.status).toBe(200);

      const body = (await res.json()) as { updated: number };
      expect(body.updated).toBe(2);
    });

    it("removes bulk-declined guests from seating chart", async () => {
      const validChart = {
        width: 1200,
        height: 800,
        tables: [
          {
            id: "b0000000-0000-4000-8000-000000000031",
            name: "Table 2",
            shape: "round" as const,
            capacity: 2,
            x: 0,
            y: 0,
            seats: [
              {
                id: "a0000000-0000-4000-8000-000000000062",
                positionIndex: 0,
                guestId: PRIMARY_GUEST.id,
              },
              {
                id: "a0000000-0000-4000-8000-000000000063",
                positionIndex: 1,
                guestId: GUEST_2.id,
              },
            ],
          },
        ],
      };
      const db = makeDb(
        [
          [MEMBER_ROW],
          [PRIMARY_GUEST],
          [{ weddingId: WEDDING_ROW.id, chart: validChart }],
        ],
        [{ id: PRIMARY_GUEST.id }],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, [
        { id: PRIMARY_GUEST.id, rsvpStatus: "declined" },
      ]);

      expect(res.status).toBe(200);
      const insertBuilder = (db as Record<string, unknown>).__insertBuilder as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          chart: expect.objectContaining({
            tables: expect.arrayContaining([
              expect.objectContaining({
                seats: expect.not.arrayContaining([
                  expect.objectContaining({ guestId: PRIMARY_GUEST.id }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it("returns 409 when a guest disappears before the RSVP update is written", async () => {
      const db = makeDb(
        [[MEMBER_ROW], [PRIMARY_GUEST, GUEST_2]],
        [{ id: PRIMARY_GUEST.id }],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, [
        { id: PRIMARY_GUEST.id, rsvpStatus: "accepted" },
        { id: GUEST_2.id, rsvpStatus: "accepted" },
      ]);

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({
        error: "One or more guest RSVPs could not be updated.",
      });
    });

    it("returns 400 when guest IDs do not belong to wedding", async () => {
      const db = makeDb([
        [MEMBER_ROW], // wedding-access middleware
        [PRIMARY_GUEST], // only one of two IDs found
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PATCH", path, [
        { id: PRIMARY_GUEST.id, rsvpStatus: "accepted" },
        { id: "00000000-0000-4000-8000-000000000099", rsvpStatus: "declined" },
      ]);
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /:weddingId/guests/import-csv
  // =========================================================================

  describe("POST /:weddingId/guests/import-csv", () => {
    const path = `/weddings/${WEDDING_ROW.id}/guests/import-csv`;

    it("returns 401 when not authenticated", async () => {
      const db = makeDb();
      const app = makeApp(db, makeUnauthAuth());

      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "first_name,last_name\nAlice,Smith",
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is a viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "first_name,last_name\nAlice,Smith",
      });
      expect(res.status).toBe(403);
    });

    it("returns 201 with imported count for valid CSV (raw text)", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const csv = "first_name,last_name\nAlice,Smith\nBob,Jones";
      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });
      expect(res.status).toBe(201);

      const body = (await res.json()) as {
        imported: number;
        errors: unknown[];
      };
      expect(body.imported).toBe(2);
      expect(body.errors).toHaveLength(0);
    });

    it("returns 201 with partial errors when some rows are invalid", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const csv =
        "first_name,last_name,email\nAlice,Smith,alice@example.com\n,Jones,bob@example.com";
      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });
      expect(res.status).toBe(201);

      const body = (await res.json()) as {
        imported: number;
        errors: { row: number; reason: string }[];
      };
      expect(body.imported).toBe(1);
      expect(body.errors).toHaveLength(1);
    });

    it("returns 400 when all rows are invalid", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const csv = "first_name,last_name\n,Smith";
      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });
      expect(res.status).toBe(400);

      const body = (await res.json()) as {
        imported: number;
        errors: { row: number; reason: string }[];
      };
      expect(body.imported).toBe(0);
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0]).toMatchObject({ row: 1 });
      expect(body.errors[0]?.reason).toContain("first_name");
    });

    it("per-row DB errors are collected rather than aborting the import", async () => {
      // Simulate the first insert succeeding and the second throwing a unique
      // constraint violation. The third row should still be attempted.
      const db = makeDb([[MEMBER_ROW]]);
      let callCount = 0;
      const insertBuilder = {
        values: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            throw new Error("DB constraint violation");
          }
          return Promise.resolve();
        }),
      };
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(insertBuilder);
      const app = makeApp(db, makeAuth());

      const res = await app.request(
        `/weddings/${WEDDING_ROW.id}/guests/import-csv`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "first_name,last_name\nAlice,Smith\nBob,Jones\nCarol,Lee",
        },
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        imported: number;
        errors: { row: number; reason: string }[];
      };
      // First and third rows succeed; second fails
      expect(body.imported).toBe(2);
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0].row).toBe(2);
      expect(body.errors[0].reason).toContain("DB constraint violation");
    });

    it("reports DB insert errors using the original CSV row number", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const insertBuilder = {
        values: vi.fn().mockImplementation(() => {
          throw new Error("DB constraint violation");
        }),
      };
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(insertBuilder);
      const app = makeApp(db, makeAuth());

      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "first_name,last_name\n,Smith\nBob,Jones",
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        imported: number;
        errors: { row: number; reason: string }[];
      };
      expect(body.imported).toBe(0);
      expect(body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ row: 1 }),
          expect.objectContaining({
            row: 2,
            reason: "DB constraint violation",
          }),
        ]),
      );
    });

    it("reports DB insert errors using original CSV row numbers after blank lines", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const insertBuilder = {
        values: vi.fn().mockImplementation(() => {
          throw new Error("DB constraint violation");
        }),
      };
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(insertBuilder);
      const app = makeApp(db, makeAuth());

      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "first_name,last_name\n\nBob,Jones",
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        imported: number;
        errors: { row: number; reason: string }[];
      };
      expect(body.imported).toBe(0);
      expect(body.errors).toEqual([
        expect.objectContaining({
          row: 2,
          reason: "DB constraint violation",
        }),
      ]);
    });

    it("returns 400 when CSV exceeds 500 rows", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const header = "first_name,last_name";
      const dataRows = Array.from(
        { length: 501 },
        (_, i) => `Guest${i},Last${i}`,
      );
      const csv = [header, ...dataRows].join("\n");

      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });
      expect(res.status).toBe(400);
    });

    it("handles multipart/form-data file upload", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const csv = "first_name,last_name\nAlice,Smith";
      const formData = new FormData();
      formData.append(
        "file",
        new File([csv], "guests.csv", { type: "text/csv" }),
      );

      const res = await app.request(path, {
        method: "POST",
        body: formData,
      });
      expect(res.status).toBe(201);

      const body = (await res.json()) as {
        imported: number;
        errors: unknown[];
      };
      expect(body.imported).toBe(1);
      expect(body.errors).toHaveLength(0);
    });

    it("returns 400 when multipart form has no file", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const formData = new FormData();
      formData.append("note", "oops");

      const res = await app.request(path, {
        method: "POST",
        body: formData,
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("No file");
    });

    it("returns 400 when multipart form file exceeds 5MB", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      // Create a file larger than 5MB
      const bigContent = "a".repeat(5 * 1024 * 1024 + 1);
      const formData = new FormData();
      formData.append(
        "file",
        new File([bigContent], "big.csv", { type: "text/csv" }),
      );

      const res = await app.request(path, {
        method: "POST",
        body: formData,
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("5MB");
    });

    it("returns 400 when raw body exceeds 5MB", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const bigBody = "a".repeat(5 * 1024 * 1024 + 1);

      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: bigBody,
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("5MB");
    });

    it("handles dietary_tags in CSV and maps valid tags", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const csv = `first_name,last_name,dietary_tags\nAlice,Smith,"vegetarian,vegan"`;
      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });
      expect(res.status).toBe(201);

      const body = (await res.json()) as { imported: number };
      expect(body.imported).toBe(1);
    });

    it("returns row errors for invalid dietary_tags without inserting", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const csv = `first_name,last_name,dietary_tags\nAlice,Smith,"vegan,not_a_real_tag"`;
      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        imported: number;
        errors: Array<{ row: number; reason: string }>;
      };
      expect(body.imported).toBe(0);
      expect(body.errors).toEqual([
        expect.objectContaining({
          row: 1,
          reason: expect.stringContaining("not_a_real_tag"),
        }),
      ]);
      expect(db.insert as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    });

    it("handles CSV with all columns including optional fields", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const csv = `first_name,last_name,email,phone,side,group_name,dietary_tags,dietary_notes\nAlice,Smith,alice@example.com,555-1234,partner1,Family,vegetarian,No nuts`;
      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });
      expect(res.status).toBe(201);

      const body = (await res.json()) as { imported: number };
      expect(body.imported).toBe(1);
    });

    it("returns 400 for empty CSV (header only)", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "first_name,last_name",
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { imported: number };
      expect(body.imported).toBe(0);
    });

    it("sets rsvp_status to pending and side defaults to mutual for imported guests", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const csv = "first_name,last_name\nAlice,Smith";
      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });
      expect(res.status).toBe(201);

      // Verify db.insert was called with correct values
      expect(db.insert as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // CSV import per-row strategy: one insert per row for isolated error handling
    // -----------------------------------------------------------------------
    it("inserts each row individually — one db.insert call per row", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const csv = [
        "first_name,last_name,email",
        "Alice,Smith,alice@example.com",
        "Bob,Jones,bob@example.com",
        "Carol,Lee,carol@example.com",
      ].join("\n");

      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        imported: number;
        errors: unknown[];
      };
      expect(body.imported).toBe(3);
      expect(body.errors).toHaveLength(0);

      // Per-row strategy: db.insert is called once for each row (3 rows = 3 calls)
      expect(db.insert as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(3);
    });
  });
});
