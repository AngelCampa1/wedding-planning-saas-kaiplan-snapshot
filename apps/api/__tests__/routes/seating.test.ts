import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { seatingRoutes } from "../../src/routes/seating";
import type { Database } from "../../src/db/client";
import type { Auth } from "../../src/auth";
import { SEATING_TABLE_FOOTPRINT } from "@kaiplan/shared";

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

const WEDDING_GUEST = {
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
  rsvpStatus: "accepted",
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const DECLINED_GUEST = {
  ...WEDDING_GUEST,
  id: "00000000-0000-4000-8000-000000000002",
  rsvpStatus: "declined" as const,
};

const OTHER_WEDDING_GUEST = {
  ...WEDDING_GUEST,
  id: "00000000-0000-4000-8000-000000000099",
  weddingId: "00000000-0000-4000-8000-000000000102",
};

const SAVED_CHART = {
  width: 1200,
  height: 800,
  tables: [
    {
      id: "550e8400-e29b-41d4-a716-446655440200",
      name: "Head Table",
      shape: "rectangle" as const,
      capacity: 2,
      orientation: "horizontal" as const,
      x: 100,
      y: 200,
      seats: [
        {
          id: "550e8400-e29b-41d4-a716-446655440201",
          positionIndex: 0,
          guestId: WEDDING_GUEST.id,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440202",
          positionIndex: 1,
        },
      ],
    },
  ],
};

const STALE_SAVED_CHART = {
  width: 1200,
  height: 800,
  tables: [
    {
      id: "550e8400-e29b-41d4-a716-446655440300",
      name: "Table 1",
      shape: "round" as const,
      capacity: 3,
      x: 100,
      y: 200,
      seats: [
        {
          id: "550e8400-e29b-41d4-a716-446655440301",
          positionIndex: 0,
          guestId: WEDDING_GUEST.id,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440302",
          positionIndex: 1,
          guestId: DECLINED_GUEST.id,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440303",
          positionIndex: 2,
          guestId: OTHER_WEDDING_GUEST.id,
        },
      ],
    },
  ],
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
  builder.onConflictDoUpdate = vi.fn().mockReturnValue(builder);
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
  // M13: saveSeatingChart uses tx.execute() for raw SQL advisory locks;
  // the mock must include execute so the transaction callback doesn't throw.
  db.execute = vi.fn().mockResolvedValue(undefined);
  db.transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) =>
      fn(db),
    );

  return db as unknown as Database;
}

function makeApp(db: Database, auth: Auth) {
  const routes = seatingRoutes(db, auth);
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

describe("seatingRoutes", () => {
  describe("GET /:weddingId/seating", () => {
    const path = `/weddings/${WEDDING_ROW.id}/seating`;

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

    it("returns default empty chart when none is saved", async () => {
      const db = makeDb([[MEMBER_ROW], []]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        chart: { width: number; height: number; tables: unknown[] };
        summary: {
          tableCount: number;
          seatCount: number;
          assignedSeatCount: number;
          unassignedSeatCount: number;
        };
      };

      expect(body.chart).toEqual({
        width: 1200,
        height: 800,
        tables: [],
      });
      expect(body.summary).toEqual({
        tableCount: 0,
        seatCount: 0,
        assignedSeatCount: 0,
        unassignedSeatCount: 0,
      });
    });

    it("returns saved chart and computed summary", async () => {
      const savedRow = {
        weddingId: WEDDING_ROW.id,
        chart: SAVED_CHART,
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-03"),
      };
      const db = makeDb([[MEMBER_ROW], [savedRow], [WEDDING_GUEST]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        chart: typeof SAVED_CHART;
        summary: {
          tableCount: number;
          seatCount: number;
          assignedSeatCount: number;
          unassignedSeatCount: number;
        };
      };

      expect(body.chart).toEqual(SAVED_CHART);
      expect(body.summary).toEqual({
        tableCount: 1,
        seatCount: 2,
        assignedSeatCount: 1,
        unassignedSeatCount: 1,
      });
    });

    it("returns saved chart without querying guests when there are no assignments", async () => {
      const savedRow = {
        weddingId: WEDDING_ROW.id,
        chart: {
          width: 1200,
          height: 800,
          tables: [
            {
              id: "550e8400-e29b-41d4-a716-446655440210",
              name: "Table 1",
              shape: "round" as const,
              capacity: 2,
              x: 100,
              y: 200,
              seats: [
                {
                  id: "550e8400-e29b-41d4-a716-446655440211",
                  positionIndex: 0,
                },
                {
                  id: "550e8400-e29b-41d4-a716-446655440212",
                  positionIndex: 1,
                },
              ],
            },
          ],
        },
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-03"),
      };
      const db = makeDb([[MEMBER_ROW], [savedRow]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        chart: typeof savedRow.chart;
        summary: {
          tableCount: number;
          seatCount: number;
          assignedSeatCount: number;
          unassignedSeatCount: number;
        };
      };

      expect(body.chart).toEqual(savedRow.chart);
      expect(body.summary).toEqual({
        tableCount: 1,
        seatCount: 2,
        assignedSeatCount: 0,
        unassignedSeatCount: 2,
      });
    });

    it("cleans stale and declined guest assignments before returning chart", async () => {
      const savedRow = {
        weddingId: WEDDING_ROW.id,
        chart: STALE_SAVED_CHART,
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-03"),
      };
      const cleanedRow = {
        ...savedRow,
        chart: {
          ...STALE_SAVED_CHART,
          tables: [
            {
              ...STALE_SAVED_CHART.tables[0],
              seats: [
                {
                  id: "550e8400-e29b-41d4-a716-446655440301",
                  positionIndex: 0,
                  guestId: WEDDING_GUEST.id,
                },
                {
                  id: "550e8400-e29b-41d4-a716-446655440302",
                  positionIndex: 1,
                },
                {
                  id: "550e8400-e29b-41d4-a716-446655440303",
                  positionIndex: 2,
                },
              ],
            },
          ],
        },
        updatedAt: new Date("2024-01-04"),
      };
      const db = makeDb(
        [[MEMBER_ROW], [savedRow], [WEDDING_GUEST, DECLINED_GUEST]],
        [cleanedRow],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "GET", path);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        chart: typeof STALE_SAVED_CHART;
        summary: {
          tableCount: number;
          seatCount: number;
          assignedSeatCount: number;
          unassignedSeatCount: number;
        };
      };

      expect(body.chart.tables[0].seats).toEqual([
        {
          id: "550e8400-e29b-41d4-a716-446655440301",
          positionIndex: 0,
          guestId: WEDDING_GUEST.id,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440302",
          positionIndex: 1,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440303",
          positionIndex: 2,
        },
      ]);
      expect(body.summary).toEqual({
        tableCount: 1,
        seatCount: 3,
        assignedSeatCount: 1,
        unassignedSeatCount: 2,
      });
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe("PUT /:weddingId/seating", () => {
    const path = `/weddings/${WEDDING_ROW.id}/seating`;
    const validPayload = {
      width: 1200,
      height: 800,
      tables: [
        {
          id: "550e8400-e29b-41d4-a716-446655440200",
          name: "Head Table",
          shape: "rectangle" as const,
          capacity: 2,
          orientation: "horizontal" as const,
          x: 100,
          y: 200,
          seats: [
            {
              id: "550e8400-e29b-41d4-a716-446655440201",
              positionIndex: 0,
              guestId: WEDDING_GUEST.id,
            },
            {
              id: "550e8400-e29b-41d4-a716-446655440202",
              positionIndex: 1,
            },
          ],
        },
      ],
    };

    it("returns 403 for viewer", async () => {
      const db = makeDb([[VIEWER_MEMBER]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PUT", path, validPayload);
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid payload", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PUT", path, { width: 0 });
      expect(res.status).toBe(400);
    });

    it("returns 400 for malformed JSON payloads", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const res = await rawJsonReq(app, "PUT", path, "{");

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Malformed JSON request body",
      });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("rejects guest ids not in the same wedding", async () => {
      const db = makeDb([[MEMBER_ROW], [WEDDING_GUEST]]);
      const app = makeApp(db, makeAuth());

      const payload = {
        ...validPayload,
        tables: [
          {
            ...validPayload.tables[0],
            seats: [
              validPayload.tables[0].seats[0],
              {
                ...validPayload.tables[0].seats[1],
                guestId: OTHER_WEDDING_GUEST.id,
              },
            ],
          },
        ],
      };

      const res = await req(app, "PUT", path, payload);
      expect(res.status).toBe(400);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("rejects declined guests", async () => {
      const db = makeDb([[MEMBER_ROW], [DECLINED_GUEST]]);
      const app = makeApp(db, makeAuth());

      const payload = {
        ...validPayload,
        tables: [
          {
            ...validPayload.tables[0],
            seats: [
              {
                ...validPayload.tables[0].seats[0],
                guestId: DECLINED_GUEST.id,
              },
              validPayload.tables[0].seats[1],
            ],
          },
        ],
      };

      const res = await req(app, "PUT", path, payload);
      expect(res.status).toBe(400);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("revalidates assigned guests after taking the seating write lock", async () => {
      let lockAcquired = false;
      const savedRow = {
        weddingId: WEDDING_ROW.id,
        chart: validPayload,
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-03"),
      };
      const db = makeDb([[MEMBER_ROW]], [savedRow]);
      const originalSelect = vi.mocked(db.select);
      originalSelect.mockImplementationOnce(
        () => makeSelectBuilder([MEMBER_ROW]) as ReturnType<typeof db.select>,
      );
      originalSelect.mockImplementation(
        () =>
          makeSelectBuilder([
            lockAcquired ? DECLINED_GUEST : WEDDING_GUEST,
          ]) as ReturnType<typeof db.select>,
      );
      vi.mocked(db.execute).mockImplementation(async () => {
        lockAcquired = true;
      });
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PUT", path, validPayload);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Declined guests cannot be assigned to seating",
      });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("saves valid payload and returns summary", async () => {
      const savedRow = {
        weddingId: WEDDING_ROW.id,
        chart: validPayload,
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-03"),
      };
      const db = makeDb([[MEMBER_ROW], [WEDDING_GUEST]], [savedRow]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PUT", path, validPayload);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        chart: typeof validPayload;
        summary: {
          tableCount: number;
          seatCount: number;
          assignedSeatCount: number;
          unassignedSeatCount: number;
        };
      };

      expect(body.chart).toEqual(validPayload);
      expect(body.summary).toEqual({
        tableCount: 1,
        seatCount: 2,
        assignedSeatCount: 1,
        unassignedSeatCount: 1,
      });
    });

    it("saves valid payload with no guest assignments", async () => {
      const unassignedPayload = {
        width: 1200,
        height: 800,
        tables: [
          {
            id: "550e8400-e29b-41d4-a716-446655440220",
            name: "Table 1",
            shape: "round" as const,
            capacity: 2,
            x: 100,
            y: 200,
            seats: [
              {
                id: "550e8400-e29b-41d4-a716-446655440221",
                positionIndex: 0,
              },
              {
                id: "550e8400-e29b-41d4-a716-446655440222",
                positionIndex: 1,
              },
            ],
          },
        ],
      };
      const savedRow = {
        weddingId: WEDDING_ROW.id,
        chart: unassignedPayload,
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-03"),
      };
      const db = makeDb([[MEMBER_ROW]], [savedRow]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PUT", path, unassignedPayload);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        summary: {
          tableCount: 1,
          seatCount: 2,
          assignedSeatCount: 0,
          unassignedSeatCount: 2,
        },
      });
    });

    it("accepts tables at the exact footprint workspace boundary", async () => {
      const boundaryPayload = {
        ...validPayload,
        tables: [
          {
            ...validPayload.tables[0],
            x: validPayload.width - SEATING_TABLE_FOOTPRINT,
            y: validPayload.height - SEATING_TABLE_FOOTPRINT,
          },
        ],
      };
      const savedRow = {
        weddingId: WEDDING_ROW.id,
        chart: boundaryPayload,
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-03"),
      };
      const db = makeDb([[MEMBER_ROW], [WEDDING_GUEST]], [savedRow]);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PUT", path, boundaryPayload);
      expect(res.status).toBe(200);

      const body = (await res.json()) as { chart: typeof boundaryPayload };
      expect(body.chart.tables[0]).toMatchObject({
        x: validPayload.width - SEATING_TABLE_FOOTPRINT,
        y: validPayload.height - SEATING_TABLE_FOOTPRINT,
      });
    });

    it("returns 400 when the payload contains duplicate guest assignments", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeAuth());

      const payload = {
        ...validPayload,
        tables: [
          {
            ...validPayload.tables[0],
            seats: [
              {
                ...validPayload.tables[0].seats[0],
                guestId: WEDDING_GUEST.id,
              },
              {
                ...validPayload.tables[0].seats[1],
                guestId: WEDDING_GUEST.id,
              },
            ],
          },
        ],
      };

      const res = await req(app, "PUT", path, payload);
      expect(res.status).toBe(400);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("returns 500 when the seating row cannot be saved", async () => {
      const db = makeDb([[MEMBER_ROW], [WEDDING_GUEST]], []);
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PUT", path, validPayload);
      expect(res.status).toBe(500);
    });

    it("updates an existing row without delete semantics", async () => {
      const existingRow = {
        weddingId: WEDDING_ROW.id,
        chart: SAVED_CHART,
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-03"),
      };
      const db = makeDb(
        [[MEMBER_ROW], [existingRow], [WEDDING_GUEST]],
        [existingRow],
      );
      const app = makeApp(db, makeAuth());

      const res = await req(app, "PUT", path, validPayload);
      expect(res.status).toBe(200);
      expect(db.delete).not.toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalledTimes(1);
    });
  });
});
