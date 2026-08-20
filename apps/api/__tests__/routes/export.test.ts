import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { exportRoutes } from "../../src/routes/export";
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
  weddingStatus: "planning" as const,
  invitedEmail: null,
  acceptedAt: new Date("2024-01-01"),
  createdAt: new Date("2024-01-01"),
};

const ARCHIVED_MEMBER_ROW = {
  ...MEMBER_ROW,
  weddingStatus: "archived" as const,
};

const PRO_SUBSCRIPTION = {
  userId: TEST_USER.id,
  plan: "pro",
  status: "active",
  billingGateRequiredAt: null,
  trialStartedAt: new Date("2026-04-01T00:00:00.000Z"),
};

const GUEST_ROW = {
  id: "guest-uuid-1",
  weddingId: WEDDING_ID,
  primaryGuestId: null,
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "555-1234",
  side: "bride",
  groupName: "Family",
  rsvpStatus: "accepted",
  dietaryTags: ["vegan", "gluten-free"],
  dietaryNotes: "No nuts",
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const CATEGORY_ROW = {
  id: "cat-uuid-1",
  weddingId: WEDDING_ID,
  name: "Venue",
  estimatedCents: 200000,
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const ITEM_ROW = {
  id: "item-uuid-1",
  categoryId: "cat-uuid-1",
  name: "Ballroom rental",
  estimatedCents: 100000,
  quotedCents: 95000,
  paidCents: 50000,
  notes: "Deposit paid",
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const VENDOR_ROW = {
  id: "vendor-uuid-1",
  weddingId: WEDDING_ID,
  categoryId: "cat-uuid-1",
  companyName: "Flowers & Co",
  primaryContactName: "Alice Smith",
  email: "alice@flowers.com",
  phone: "555-9876",
  contractStatus: "signed",
  notes: null,
  contractUrl: null,
  contractSentAt: null,
  contractSignedAt: null,
  sortOrder: 0,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  totalAcceptedQuotedCents: 30000,
  totalPaidCents: 10000,
};

const ACCEPTED_QUOTE_ROW = {
  id: "quote-uuid-1",
  vendorId: VENDOR_ROW.id,
  budgetItemId: null,
  label: "Floral package",
  amountCents: 30000,
  status: "accepted",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const PAYMENT_ROW = {
  id: "payment-uuid-1",
  quoteId: ACCEPTED_QUOTE_ROW.id,
  amountCents: 10000,
  paidAt: new Date("2024-01-02"),
  note: "Deposit",
  createdAt: new Date("2024-01-02"),
  updatedAt: new Date("2024-01-02"),
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

/**
 * Creates a Database mock with sequential select responses.
 * Each entry is what the next select() call resolves with.
 * First select is typically the weddingMember check (middleware).
 */
function makeDb(selectResponses: unknown[][] = [[]]): Database {
  let selectIndex = 0;

  const db: Record<string, unknown> = {};
  db.select = vi.fn().mockImplementation(() => {
    const rows =
      selectIndex < selectResponses.length ? selectResponses[selectIndex] : [];
    selectIndex++;
    return makeSelectBuilder(rows);
  });
  db.insert = vi.fn().mockReturnValue({
    values: vi
      .fn()
      .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
  });
  db.update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi
        .fn()
        .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
  });
  db.delete = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  return db as unknown as Database;
}

function makeApp(db: Database, auth: Auth) {
  const routes = exportRoutes(db, auth);
  const app = new Hono();
  app.route("/weddings", routes);
  return app;
}

async function req(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("exportRoutes", () => {
  // -------------------------------------------------------------------------
  // GET /weddings/:weddingId/export/guests.csv
  // -------------------------------------------------------------------------
  describe("GET /:weddingId/export/guests.csv", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/guests.csv`,
      );
      expect(res.status).toBe(401);
    });

    it("returns CSV with header row when guests list is empty", async () => {
      const db = makeDb([[MEMBER_ROW], []]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/guests.csv`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain("guests.csv");
      const text = await res.text();
      const lines = text.trim().split("\r\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe(
        "firstName,lastName,email,phone,side,groupName,rsvpStatus,dietaryTags,dietaryNotes",
      );
    });

    it("returns CSV with header row and guest data rows", async () => {
      const db = makeDb([[MEMBER_ROW], [GUEST_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/guests.csv`,
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.trim().split("\r\n");
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[0]).toBe(
        "firstName,lastName,email,phone,side,groupName,rsvpStatus,dietaryTags,dietaryNotes",
      );
      expect(lines[1]).toContain("Jane");
      expect(lines[1]).toContain("Doe");
      expect(lines[1]).toContain("vegan|gluten-free");
    });

    it("returns 403 when user is not a member", async () => {
      const db = makeDb([[]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/guests.csv`,
      );
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // GET /weddings/:weddingId/export/budget.csv
  // -------------------------------------------------------------------------
  describe("GET /:weddingId/export/budget.csv", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/budget.csv`,
      );
      expect(res.status).toBe(401);
    });

    it("returns CSV with header row when budget is empty", async () => {
      const db = makeDb([[MEMBER_ROW], [], []]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/budget.csv`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain("budget.csv");
      const text = await res.text();
      const lines = text.trim().split("\r\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe(
        "type,name,estimatedCents,quotedCents,paidCents,notes",
      );
    });

    it("returns CSV with categories and items", async () => {
      const db = makeDb([[MEMBER_ROW], [CATEGORY_ROW], [ITEM_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/budget.csv`,
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.trim().split("\r\n");
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines[0]).toBe(
        "type,name,estimatedCents,quotedCents,paidCents,notes",
      );
      const catLine = lines.find((l) => l.includes("category"));
      expect(catLine).toBeDefined();
      expect(catLine).toContain("Venue");
      const itemLine = lines.find((l) => l.includes("item"));
      expect(itemLine).toBeDefined();
      expect(itemLine).toContain("Ballroom rental");
    });
  });

  // -------------------------------------------------------------------------
  // GET /weddings/:weddingId/export/vendors.csv
  // -------------------------------------------------------------------------
  describe("GET /:weddingId/export/vendors.csv", () => {
    it("returns 401 when not authenticated", async () => {
      const db = makeDb([[MEMBER_ROW]]);
      const app = makeApp(db, makeUnauthAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/vendors.csv`,
      );
      expect(res.status).toBe(401);
    });

    it("returns CSV with header row when vendor list is empty", async () => {
      const db = makeDb([[MEMBER_ROW], [PRO_SUBSCRIPTION], []]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/vendors.csv`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain("vendors.csv");
      const text = await res.text();
      const lines = text.trim().split("\r\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe(
        "companyName,primaryContactName,email,phone,contractStatus,totalAcceptedQuotedCents,totalPaidCents",
      );
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns CSV with vendor data rows", async () => {
      const db = makeDb([[MEMBER_ROW], [PRO_SUBSCRIPTION], [VENDOR_ROW], []]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/vendors.csv`,
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.trim().split("\r\n");
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[0]).toBe(
        "companyName,primaryContactName,email,phone,contractStatus,totalAcceptedQuotedCents,totalPaidCents",
      );
      expect(lines[1]).toContain("Flowers & Co");
      expect(lines[1]).toContain("Alice Smith");
    });

    it("does not record vendor feature use for archived wedding exports", async () => {
      const db = makeDb([
        [ARCHIVED_MEMBER_ROW],
        [VENDOR_ROW],
        [],
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/vendors.csv`,
      );

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Flowers & Co");
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns CSV with zero totals when vendor has no quotes or payments", async () => {
      const vendorNoPayments = {
        ...VENDOR_ROW,
        totalAcceptedQuotedCents: null,
        totalPaidCents: null,
      };
      const db = makeDb([
        [MEMBER_ROW],
        [PRO_SUBSCRIPTION],
        [vendorNoPayments],
        [],
      ]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/vendors.csv`,
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.trim().split("\r\n");
      expect(lines.length).toBe(2);
      // totalAcceptedQuotedCents and totalPaidCents should be 0 when null
      expect(lines[1]).toContain(",0,0");
    });

    it("returns 402 for unpaid owners before exporting vendor data", async () => {
      const gatedSubscription = {
        userId: TEST_USER.id,
        plan: "free",
        status: "trialing",
        billingGateRequiredAt: null,
        trialStartedAt: new Date("2026-04-01T00:00:00.000Z"),
      };
      const db = makeDb([[MEMBER_ROW], [gatedSubscription]]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/vendors.csv`,
      );

      expect(res.status).toBe(402);
      await expect(res.json()).resolves.toMatchObject({
        feature: "vendors",
        plan: "free",
      });
    });

    it("does not multiply accepted quote totals by payment count", async () => {
      const db = makeDb([
        [MEMBER_ROW],
        [PRO_SUBSCRIPTION],
        [VENDOR_ROW],
        [ACCEPTED_QUOTE_ROW],
        [
          PAYMENT_ROW,
          {
            ...PAYMENT_ROW,
            id: "payment-uuid-2",
            amountCents: 5000,
          },
        ],
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/vendors.csv`,
      );

      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.trim().split("\r\n");
      expect(lines[1]).toContain("Flowers & Co");
      expect(lines[1]).toContain(",30000,15000");
      expect(lines[1]).not.toContain(",60000,15000");
    });
  });

  // -------------------------------------------------------------------------
  // CSV escaping edge cases
  // -------------------------------------------------------------------------
  describe("CSV escaping", () => {
    it("escapes commas and quotes in guest data", async () => {
      const guestWithComma = {
        ...GUEST_ROW,
        firstName: 'Jane, "Jr"',
        dietaryNotes: null,
        dietaryTags: [],
        groupName: null,
      };
      const db = makeDb([[MEMBER_ROW], [guestWithComma]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/guests.csv`,
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      // Comma in name should be quoted
      expect(text).toContain('"Jane, ""Jr"""');
    });
  });

  // -------------------------------------------------------------------------
  // Formula injection guard (Task 6)
  // -------------------------------------------------------------------------
  describe("formula injection guard", () => {
    it.each([
      ["= formula", "=SUM(A1:A10)"],
      ["+ prefix", "+HYPERLINK(evil)"],
      ["- prefix", "-2+3"],
      ["@ prefix", "@SUM"],
      ["tab prefix", "\tSUM"],
      ["carriage-return prefix", "\rSUM"],
      ["line-feed prefix", "\n=SUM(A1:A10)"],
    ])(
      "prefixes dangerous cell value starting with %s with a single-quote",
      async (_, dangerousValue) => {
        const guestWithFormula = {
          ...GUEST_ROW,
          firstName: dangerousValue,
          dietaryTags: [],
          dietaryNotes: null,
          groupName: null,
        };
        const db = makeDb([[MEMBER_ROW], [guestWithFormula]]);
        const app = makeApp(db, makeAuth());
        const res = await req(
          app,
          "GET",
          `/weddings/${WEDDING_ID}/export/guests.csv`,
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        // Each dangerous prefix must be preceded by a single-quote when output in CSV
        const expectedValue =
          dangerousValue === "\n=SUM(A1:A10)"
            ? "'\n'=SUM(A1:A10)"
            : `'${dangerousValue}`;
        expect(text).toContain(expectedValue);
      },
    );

    it("prefixes dangerous cell values after leading spaces", async () => {
      const guestWithFormula = {
        ...GUEST_ROW,
        firstName: "  =SUM(A1:A10)",
        dietaryTags: [],
        dietaryNotes: null,
        groupName: null,
      };
      const db = makeDb([[MEMBER_ROW], [guestWithFormula]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/guests.csv`,
      );

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("'  =SUM(A1:A10)");
      expect(text).not.toContain("\r\n  =SUM(A1:A10),");
    });

    it("does not prefix a normal string with a single-quote", async () => {
      const db = makeDb([[MEMBER_ROW], [GUEST_ROW]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/guests.csv`,
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      // Normal name should not start with a single-quote
      const lines = text.trim().split("\r\n");
      expect(lines[1]).not.toMatch(/^'/);
    });

    it("quotes carriage returns and neutralizes formulas after embedded row breaks", async () => {
      const guestWithInjectedRow = {
        ...GUEST_ROW,
        firstName: "Jane\r=1+1",
        dietaryTags: [],
        dietaryNotes: null,
        groupName: null,
      };
      const db = makeDb([[MEMBER_ROW], [guestWithInjectedRow]]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/guests.csv`,
      );

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("\"Jane\r'=1+1\"");
      expect(text).not.toContain("Jane\r=1+1");
    });
  });

  // -------------------------------------------------------------------------
  // Accepted-quote total (Task 6 Fix 2)
  // -------------------------------------------------------------------------
  describe("vendors.csv accepted-quote total", () => {
    it("uses only the latest accepted quote, not pending or older accepted quotes", async () => {
      const db = makeDb([
        [MEMBER_ROW],
        [PRO_SUBSCRIPTION],
        [VENDOR_ROW],
        [
          { ...ACCEPTED_QUOTE_ROW, amountCents: 20000 },
          {
            ...ACCEPTED_QUOTE_ROW,
            id: "quote-uuid-newer",
            amountCents: 45000,
            createdAt: new Date("2024-02-01"),
            updatedAt: new Date("2024-02-01"),
          },
          {
            ...ACCEPTED_QUOTE_ROW,
            id: "quote-uuid-pending",
            amountCents: 70000,
            status: "pending",
          },
        ],
        [{ ...PAYMENT_ROW, quoteId: "quote-uuid-newer", amountCents: 5000 }],
      ]);
      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "GET",
        `/weddings/${WEDDING_ID}/export/vendors.csv`,
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.trim().split("\r\n");
      expect(lines[1]).toContain("45000");
      expect(lines[1]).not.toContain("20000");
      expect(lines[1]).not.toContain("70000");
      expect(lines[1]).toContain("5000");
    });
  });
});
