import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Auth } from "../../src/auth";
import type { Database } from "../../src/db/client";

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  emailVerified: true,
};

const WEDDING_ROW = {
  id: "wedding-uuid-1",
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

const DUPLICATE_PAYLOAD = {
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
          guestId: "00000000-0000-4000-8000-000000000001",
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440202",
          positionIndex: 1,
          guestId: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
  ],
};

vi.mock("@kaiplan/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@kaiplan/shared")>("@kaiplan/shared");

  return {
    ...actual,
    saveSeatingSchema: {
      parse: vi.fn((value) => value),
      safeParse: vi.fn(() => ({
        success: true,
        data: DUPLICATE_PAYLOAD,
      })),
    },
  };
});

import { seatingRoutes } from "../../src/routes/seating";

function makeAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: TEST_USER, session: {} }),
    },
  } as unknown as Auth;
}

function makeDb(): Database {
  const db: Record<string, unknown> = {};
  db.select = vi.fn().mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn().mockReturnValue(builder);
    builder.innerJoin = vi.fn().mockReturnValue(builder);
    builder.leftJoin = vi.fn().mockReturnValue(builder);
    builder.where = vi.fn().mockReturnValue(builder);
    builder.limit = vi.fn().mockReturnValue({
      then: (fn: (rows: (typeof MEMBER_ROW)[]) => unknown) =>
        Promise.resolve(fn([MEMBER_ROW])),
    });
    return builder;
  });
  db.insert = vi.fn();
  db.update = vi.fn();
  db.delete = vi.fn();
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

async function req(app: ReturnType<typeof makeApp>) {
  return app.request(`/weddings/${WEDDING_ROW.id}/seating`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DUPLICATE_PAYLOAD),
  });
}

describe("seatingRoutes duplicate assignment branch", () => {
  it("rejects duplicate guest ids after schema parsing", async () => {
    const app = makeApp(makeDb(), makeAuth());

    const res = await req(app);
    expect(res.status).toBe(400);
  });
});
