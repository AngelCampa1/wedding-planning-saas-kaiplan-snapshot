import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { vendorRoutes } from "../../src/routes/vendors";
import type { Database } from "../../src/db/client";
import type { Auth } from "../../src/auth";

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  emailVerified: true,
};

const WEDDING_ROW = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "My Wedding",
  date: "2026-06-15",
  budgetCents: 500000,
  currency: "USD",
  timezone: "America/New_York",
  createdBy: TEST_USER.id,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const MEMBER_ROW = {
  id: "member-uuid-1",
  weddingId: WEDDING_ROW.id,
  userId: TEST_USER.id,
  role: "owner" as const,
  invitedEmail: null,
  acceptedAt: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
};

const VIEWER_MEMBER = { ...MEMBER_ROW, role: "viewer" as const };

const ACTIVE_SUBSCRIPTION_ROW = {
  userId: TEST_USER.id,
  stripeCustomerId: "cus_123",
  stripePriceId: "price_pro",
  plan: "pro" as const,
  status: "active" as const,
  currentPeriodEnd: new Date("2026-06-01"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
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
  deleteResult: unknown[] = [{ id: "deleted-row" }],
): Database {
  let selectIndex = 0;
  let injectedBilling = false;
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

  db.select = vi.fn().mockImplementation(() => {
    const currentRows =
      selectIndex < selectResponses.length ? selectResponses[selectIndex] : [];
    const firstRow =
      Array.isArray(currentRows) && currentRows.length > 0
        ? currentRows[0]
        : null;
    const isExplicitBillingResponse =
      Array.isArray(currentRows) &&
      firstRow !== null &&
      typeof firstRow === "object" &&
      "plan" in firstRow &&
      "status" in firstRow;

    let rows = currentRows;
    if (selectIndex === 1 && !injectedBilling && !isExplicitBillingResponse) {
      rows = [ACTIVE_SUBSCRIPTION_ROW];
      injectedBilling = true;
    } else {
      selectIndex++;
    }

    return makeSelectBuilder(rows);
  });

  db.insert = vi.fn().mockReturnValue(insertBuilder);
  db.update = vi.fn().mockReturnValue(updateBuilder);
  db.delete = vi.fn().mockReturnValue(deleteBuilder);
  db.transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) =>
      fn(db as unknown as Database),
    );
  db.__insertBuilder = insertBuilder;
  db.__updateBuilder = updateBuilder;
  db.__deleteBuilder = deleteBuilder;

  return db as unknown as Database;
}

function makeApp(db: Database, auth: Auth) {
  const routes = vendorRoutes(db, auth);
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

describe("vendorRoutes", () => {
  it("returns 401 from summary when not authenticated", async () => {
    const db = makeDb();
    const app = makeApp(db, makeUnauthAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/summary`,
    );
    expect(res.status).toBe(401);
  });

  it("returns 402 when the wedding owner does not have vendor access", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          ...ACTIVE_SUBSCRIPTION_ROW,
          plan: "free",
          status: "inactive",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/summary`,
    );

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("plan"),
      feature: "vendors",
    });
  });

  it("returns 402 when the wedding owner has active starter access", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          ...ACTIVE_SUBSCRIPTION_ROW,
          plan: "starter",
          status: "active",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/summary`,
    );

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      feature: "vendors",
      plan: "starter",
      status: "active",
    });
  });

  it("returns 402 when a paid plan is past due", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          ...ACTIVE_SUBSCRIPTION_ROW,
          status: "past_due",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/summary`,
    );

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      feature: "vendors",
      plan: "pro",
      status: "past_due",
    });
  });

  it("allows archived vendor summary reads when vendor access is gated", async () => {
    const db = makeDb([
      [
        {
          ...MEMBER_ROW,
          weddingStatus: "archived",
          plan: "free",
          status: "inactive",
          billingGateRequiredAt: new Date("2026-04-01"),
          trialStartedAt: null,
        },
      ],
      [],
      [],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/summary`,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      pendingQuotes: expect.any(Number),
      signedContracts: expect.any(Number),
      totalOutstandingCents: expect.any(Number),
      totalPaidCents: expect.any(Number),
      totalVendors: expect.any(Number),
    });
  });

  it("returns vendor summary for a wedding", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          id: "vendor-1",
          contractStatus: "signed",
        },
        {
          id: "vendor-2",
          contractStatus: "sent",
        },
        {
          id: "vendor-3",
          contractStatus: "signed",
        },
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 125000,
          status: "accepted",
        },
        {
          id: "quote-2",
          vendorId: "vendor-2",
          amountCents: 95000,
          status: "pending",
        },
        {
          id: "quote-3",
          vendorId: "vendor-3",
          amountCents: 145000,
          status: "accepted",
        },
      ],
      [
        { id: "payment-1", quoteId: "quote-1", amountCents: 50000 },
        { id: "payment-2", quoteId: "quote-1", amountCents: 25000 },
        { id: "payment-3", quoteId: "quote-3", amountCents: 100000 },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/summary`,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      totalVendors: 3,
      pendingQuotes: 1,
      signedContracts: 2,
      totalPaidCents: 175000,
      totalOutstandingCents: 95000,
    });
  });

  it("returns an empty summary when a wedding has no vendors", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/summary`,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      totalVendors: 0,
      pendingQuotes: 0,
      signedContracts: 0,
      totalPaidCents: 0,
      totalOutstandingCents: 0,
    });
    const updateBuilder = (
      db as unknown as {
        __updateBuilder: { set: ReturnType<typeof vi.fn> };
      }
    ).__updateBuilder;
    expect(updateBuilder.set).not.toHaveBeenCalled();
  });

  it("counts accepted quotes with no payments as fully outstanding in the summary", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ id: "vendor-1", contractStatus: "none" }],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 250000,
          status: "accepted",
        },
      ],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/summary`,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      totalPaidCents: 0,
      totalOutstandingCents: 250000,
    });
  });

  it("summarizes only the latest accepted quote per vendor", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ id: "vendor-1", contractStatus: "none" }],
      [
        {
          id: "quote-old",
          vendorId: "vendor-1",
          amountCents: 250000,
          status: "accepted",
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
        {
          id: "quote-new",
          vendorId: "vendor-1",
          amountCents: 300000,
          status: "accepted",
          createdAt: "2026-03-25T00:00:00.000Z",
          updatedAt: "2026-03-25T00:00:00.000Z",
        },
      ],
      [
        { id: "payment-old", quoteId: "quote-old", amountCents: 250000 },
        { id: "payment-new", quoteId: "quote-new", amountCents: 50000 },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/summary`,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      totalPaidCents: 50000,
      totalOutstandingCents: 250000,
    });
  });

  it("returns vendors list items", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
          primaryContactName: "Sofia Ramos",
          companyName: "Golden Hour Photo",
          categoryId: "00000000-0000-4000-8000-000000000201",
          categoryName: "Photography",
          contractStatus: "sent",
          email: "hello@goldenhour.test",
          phone: null,
          contractUrl: null,
          contractSentAt: "2026-04-01",
          contractSignedAt: null,
          notes: null,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 250000,
          quotedAt: "2026-03-20",
          status: "accepted",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
          notes: null,
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
        {
          id: "quote-2",
          vendorId: "vendor-1",
          amountCents: 275000,
          quotedAt: "2026-03-25",
          status: "pending",
          budgetItemId: null,
          notes: null,
          createdAt: "2026-03-25T00:00:00.000Z",
          updatedAt: "2026-03-25T00:00:00.000Z",
        },
      ],
      [
        {
          id: "payment-1",
          quoteId: "quote-1",
          paymentType: "deposit",
          amountCents: 50000,
          paidAt: "2026-04-06",
          notes: null,
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/vendors`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        id: "vendor-1",
        categoryName: "Photography",
        activeQuoteId: "quote-1",
        activeQuoteAmountCents: 250000,
        totalPaidCents: 50000,
        outstandingCents: 200000,
        quoteCount: 2,
      }),
    ]);
  });

  it("uses the latest accepted quote as the active vendor quote", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
          primaryContactName: "Sofia Ramos",
          companyName: "Golden Hour Photo",
          categoryId: "00000000-0000-4000-8000-000000000201",
          categoryName: "Photography",
          contractStatus: "sent",
          email: null,
          phone: null,
          contractUrl: null,
          contractSentAt: null,
          contractSignedAt: null,
          notes: null,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [
        {
          id: "quote-old",
          vendorId: "vendor-1",
          amountCents: 250000,
          quotedAt: "2026-03-20",
          status: "accepted",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
          notes: null,
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
        {
          id: "quote-new",
          vendorId: "vendor-1",
          amountCents: 275000,
          quotedAt: "2026-03-25",
          status: "accepted",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
          notes: null,
          createdAt: "2026-03-25T00:00:00.000Z",
          updatedAt: "2026-03-25T00:00:00.000Z",
        },
      ],
      [
        {
          id: "payment-new",
          quoteId: "quote-new",
          paymentType: "deposit",
          amountCents: 75000,
          paidAt: "2026-04-06",
          notes: null,
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/vendors`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        activeQuoteId: "quote-new",
        activeQuoteAmountCents: 275000,
        totalPaidCents: 75000,
        outstandingCents: 200000,
        quoteCount: 2,
      }),
    ]);
  });

  it("hydrates category names in the vendor list when rows do not include them", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
          primaryContactName: "Sofia Ramos",
          companyName: "Golden Hour Photo",
          categoryId: "00000000-0000-4000-8000-000000000201",
          contractStatus: "sent",
          email: null,
          phone: null,
          contractUrl: null,
          contractSentAt: null,
          contractSignedAt: null,
          notes: null,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [{ id: "00000000-0000-4000-8000-000000000201", name: "Photography" }],
      [],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/vendors`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        id: "vendor-1",
        categoryName: "Photography",
        quoteCount: 0,
      }),
    ]);
  });

  it("falls back to an empty category name when the category lookup is missing", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
          primaryContactName: "Sofia Ramos",
          companyName: "Golden Hour Photo",
          categoryId: "00000000-0000-4000-8000-000000000201",
          contractStatus: "sent",
          email: null,
          phone: null,
          contractUrl: null,
          contractSentAt: null,
          contractSignedAt: null,
          notes: null,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 250000,
          quotedAt: "2026-03-20",
          status: "accepted",
          budgetItemId: null,
          notes: null,
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/vendors`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        categoryName: "",
        totalPaidCents: 0,
        outstandingCents: 250000,
      }),
    ]);
  });

  it("rejects vendor creation for viewers", async () => {
    const db = makeDb([[VIEWER_MEMBER]]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/vendors`, {
      primaryContactName: "Sofia Ramos",
      companyName: "Golden Hour Photo",
      categoryId: "00000000-0000-4000-8000-000000000201",
    });
    expect(res.status).toBe(403);
  });

  it("creates a vendor for editors and owners", async () => {
    const db = makeDb(
      [[MEMBER_ROW], [{ id: "00000000-0000-4000-8000-000000000201" }]],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
          primaryContactName: "Sofia Ramos",
          companyName: "Golden Hour Photo",
          categoryId: "00000000-0000-4000-8000-000000000201",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/vendors`, {
      primaryContactName: "Sofia Ramos",
      companyName: "Golden Hour Photo",
      categoryId: "00000000-0000-4000-8000-000000000201",
    });
    expect(res.status).toBe(201);
  });

  it("rejects invalid vendor payloads", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [ACTIVE_SUBSCRIPTION_ROW],
      [ACTIVE_SUBSCRIPTION_ROW],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/vendors`, {
      primaryContactName: "",
      companyName: "Golden Hour Photo",
      categoryId: "00000000-0000-4000-8000-000000000201",
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed vendor JSON", async () => {
    const db = makeDb([[MEMBER_ROW], [ACTIVE_SUBSCRIPTION_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors`,
      "{",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed quote JSON without recording vendor usage", async () => {
    const db = makeDb([[MEMBER_ROW], [ACTIVE_SUBSCRIPTION_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes`,
      "{",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalled();
  });

  it("does not record vendor usage when deleting a missing quote", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [ACTIVE_SUBSCRIPTION_ROW],
      [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/missing-quote`,
    );

    expect(res.status).toBe(404);
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalled();
  });

  it("does not record vendor usage when deleting a missing payment", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [ACTIVE_SUBSCRIPTION_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 50000,
            budgetItemId: null,
          },
        ],
      ],
      [],
      [],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/missing-payment`,
    );

    expect(res.status).toBe(404);
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalled();
  });

  it("rejects vendor creation when the category does not exist", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/vendors`, {
      primaryContactName: "Sofia Ramos",
      companyName: "Golden Hour Photo",
      categoryId: "00000000-0000-4000-8000-000000000201",
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when vendor detail is missing", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );
    expect(res.status).toBe(404);
  });

  it("returns vendor detail with quotes and payments", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
          primaryContactName: "Sofia Ramos",
          companyName: "Golden Hour Photo",
          categoryId: "00000000-0000-4000-8000-000000000201",
          categoryName: "Photography",
          email: "hello@goldenhour.test",
          phone: null,
          contractStatus: "signed",
          contractUrl: "https://docs.example.com/contracts/photo",
          contractSentAt: "2026-04-01",
          contractSignedAt: "2026-04-05",
          notes: null,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 250000,
          quotedAt: "2026-03-20",
          status: "accepted",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
          notes: null,
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
      [
        {
          id: "payment-1",
          quoteId: "quote-1",
          paymentType: "deposit",
          amountCents: 50000,
          paidAt: "2026-04-06",
          notes: null,
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: "vendor-1",
      quotes: [
        {
          id: "quote-1",
          payments: [{ id: "payment-1" }],
        },
      ],
    });
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalled();
  });

  it("hydrates vendor detail category names and empty payments when needed", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
          primaryContactName: "Sofia Ramos",
          companyName: "Golden Hour Photo",
          categoryId: "00000000-0000-4000-8000-000000000201",
          email: null,
          phone: null,
          contractStatus: "sent",
          contractUrl: null,
          contractSentAt: null,
          contractSignedAt: null,
          notes: null,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [{ id: "00000000-0000-4000-8000-000000000201", name: "Photography" }],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 250000,
          quotedAt: "2026-03-20",
          status: "pending",
          budgetItemId: null,
          notes: null,
          createdAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      categoryName: "Photography",
      quotes: [{ id: "quote-1", payments: [] }],
    });
  });

  it("falls back to an empty category name in vendor detail when the category lookup is missing", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
          primaryContactName: "Sofia Ramos",
          companyName: "Golden Hour Photo",
          categoryId: "00000000-0000-4000-8000-000000000201",
          email: null,
          phone: null,
          contractStatus: "sent",
          contractUrl: null,
          contractSentAt: null,
          contractSignedAt: null,
          notes: null,
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      categoryName: "",
      quotes: [],
    });
  });

  it("updates a vendor when the payload is valid", async () => {
    const db = makeDb(
      [[MEMBER_ROW], [{ id: "00000000-0000-4000-8000-000000000202" }]],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
          primaryContactName: "Sofia Ramos",
          companyName: "Golden Hour Studio",
          categoryId: "00000000-0000-4000-8000-000000000202",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
      {
        companyName: "Golden Hour Studio",
        categoryId: "00000000-0000-4000-8000-000000000202",
      },
    );

    expect(res.status).toBe(200);
  });

  it("rejects invalid vendor updates", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
      {
        email: "not-an-email",
      },
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed vendor update JSON", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
      "{",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
  });

  it("rejects vendor updates when the category does not exist", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
      {
        categoryId: "00000000-0000-4000-8000-000000000202",
      },
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when updating a missing vendor", async () => {
    const db = makeDb([[MEMBER_ROW]], []);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
      {
        companyName: "Golden Hour Studio",
      },
    );

    expect(res.status).toBe(404);
  });

  it("rejects vendor updates for viewers", async () => {
    const db = makeDb([[VIEWER_MEMBER]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
      {
        companyName: "Golden Hour Studio",
      },
    );

    expect(res.status).toBe(403);
  });

  it("deletes a vendor for writers", async () => {
    const db = makeDb([[MEMBER_ROW], [{ id: "vendor-1" }]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );
    expect(res.status).toBe(204);
  });

  it("returns 404 when the scoped vendor disappears before delete is written", async () => {
    const db = makeDb([[MEMBER_ROW], [{ id: "vendor-1" }]], [], []);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Vendor not found",
    });
  });

  it("returns 404 and does not delete or recompute budgets when the scoped vendor is missing", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );

    expect(res.status).toBe(404);
    expect(db.delete).not.toHaveBeenCalled();
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: expect.any(Number),
      }),
    );
  });

  it("deletes a scoped vendor without recomputing foreign wedding budget items", async () => {
    const db = makeDb([[MEMBER_ROW], [{ id: "vendor-1" }]], []);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );

    expect(res.status).toBe(204);
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: expect.any(Number),
      }),
    );
  });

  it("clears linked budget totals after deleting the only accepted quote for a scoped vendor", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [{ budgetItemId: "00000000-0000-4000-8000-000000000301" }],
        [],
      ],
      [],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );

    expect(res.status).toBe(204);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 0,
        paidCents: 0,
      }),
    );
  });

  it("recomputes linked budget totals from a remaining accepted quote after deleting a scoped vendor", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [{ budgetItemId: "00000000-0000-4000-8000-000000000301" }],
        [
          {
            id: "quote-remaining",
            vendorId: "vendor-2",
            status: "accepted",
            amountCents: 320000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
            createdAt: new Date("2026-01-01"),
            updatedAt: new Date("2026-01-02"),
          },
        ],
        [],
      ],
      [],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );

    expect(res.status).toBe(204);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 320000,
        paidCents: 0,
      }),
    );
  });

  it("does not clear linked budget totals when deleting a vendor with no accepted linked quote", async () => {
    const db = makeDb(
      [[MEMBER_ROW], [{ id: "vendor-1", weddingId: WEDDING_ROW.id }], []],
      [],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );

    expect(res.status).toBe(204);
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: expect.any(Number),
      }),
    );
  });

  it("rejects vendor deletes for viewers", async () => {
    const db = makeDb([[VIEWER_MEMBER]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
    );
    expect(res.status).toBe(403);
  });

  it("creates a quote linked to a budget item in the same wedding", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [{ id: "00000000-0000-4000-8000-000000000301" }],
        [
          {
            amountCents: 250000,
            paidCents: 0,
          },
        ],
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 250000,
          status: "accepted",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes`,
      {
        amountCents: 250000,
        quotedAt: "2026-04-07",
        status: "accepted",
        budgetItemId: "00000000-0000-4000-8000-000000000301",
      },
    );
    expect(res.status).toBe(201);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 250000,
        paidCents: 0,
      }),
    );
  });

  it("records quote creation feature usage on the transaction client", async () => {
    const budgetItemId = "00000000-0000-4000-8000-000000000301";
    const createdQuote = {
      id: "quote-1",
      vendorId: "vendor-1",
      status: "accepted",
      amountCents: 250000,
      budgetItemId,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const db = makeDb([[MEMBER_ROW]]);
    const rootUpdate = vi.fn().mockReturnValue(makeWriteBuilder([]));
    (db as any).update = rootUpdate;

    const budgetUpdateBuilder = makeWriteBuilder([]);
    const featureUseUpdateBuilder = makeWriteBuilder([]);
    const transactionUpdate = vi.fn().mockImplementation(() => {
      const callIndex = transactionUpdate.mock.calls.length;
      return callIndex === 1 ? budgetUpdateBuilder : featureUseUpdateBuilder;
    });
    const transactionInsert = vi
      .fn()
      .mockReturnValue(makeWriteBuilder([createdQuote]));
    let transactionSelectIndex = 0;
    const transactionDb = {
      ...db,
      select: vi.fn().mockImplementation(() => {
        const responses = [
          [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
          [{ id: budgetItemId }],
          [createdQuote],
          [],
          [{ id: "category-1" }],
          [ACTIVE_SUBSCRIPTION_ROW],
        ];
        return makeSelectBuilder(responses[transactionSelectIndex++] ?? []);
      }),
      insert: transactionInsert,
      update: transactionUpdate,
    };
    (db as any).transaction = vi.fn().mockImplementation(async (fn) =>
      fn(transactionDb),
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes`,
      {
        amountCents: 250000,
        quotedAt: "2026-02-01",
        status: "accepted",
        budgetItemId,
      },
    );

    expect(res.status).toBe(201);
    expect(rootUpdate).not.toHaveBeenCalled();
    expect(transactionUpdate).toHaveBeenCalledTimes(2);
    expect(budgetUpdateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 250000,
        paidCents: 0,
      }),
    );
    expect(featureUseUpdateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorsFirstUsedAt: expect.any(Date),
      }),
    );
  });

  it("rolls back accepted quote creation when linked budget recompute fails", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [{ id: "00000000-0000-4000-8000-000000000301" }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            amountCents: 250000,
            status: "accepted",
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [],
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 250000,
          status: "accepted",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
        },
      ],
    );
    const updateBuilder = (db as any).__updateBuilder as {
      set: ReturnType<typeof vi.fn>;
    };
    updateBuilder.set.mockReturnValue({
      where: vi.fn().mockRejectedValue(new Error("recompute failed")),
    });
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes`,
      {
        amountCents: 250000,
        quotedAt: "2026-04-07",
        status: "accepted",
        budgetItemId: "00000000-0000-4000-8000-000000000301",
      },
    );

    expect(res.status).toBe(500);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects quote creation when budget item belongs to another wedding", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes`,
      {
        amountCents: 250000,
        quotedAt: "2026-04-07",
        status: "accepted",
        budgetItemId: "00000000-0000-4000-8000-000000000301",
      },
    );
    expect(res.status).toBe(404);
  });

  it("rejects quote creation when the vendor does not belong to the wedding", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes`,
      {
        amountCents: 250000,
        quotedAt: "2026-04-07",
        status: "accepted",
      },
    );
    expect(res.status).toBe(404);
  });

  it("rejects quote creation for viewers", async () => {
    const db = makeDb([[VIEWER_MEMBER]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes`,
      {
        amountCents: 250000,
        quotedAt: "2026-04-07",
        status: "pending",
      },
    );
    expect(res.status).toBe(403);
  });

  it("rejects invalid quote creation payloads", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes`,
      {
        amountCents: -1,
        quotedAt: "2026-04-07",
      },
    );
    expect(res.status).toBe(400);
  });

  it("creates a quote without a linked budget item", async () => {
    const db = makeDb(
      [[MEMBER_ROW], [{ id: "vendor-1", weddingId: WEDDING_ROW.id }]],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 250000,
          status: "pending",
          budgetItemId: null,
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes`,
      {
        amountCents: 250000,
        quotedAt: "2026-04-07",
        status: "pending",
      },
    );
    expect(res.status).toBe(201);
  });

  it("rejects quote relinking when budget item belongs to another wedding", async () => {
    const db = makeDb([[MEMBER_ROW], [{ id: "vendor-1" }], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        budgetItemId: "00000000-0000-4000-8000-000000000301",
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when updating a missing quote", async () => {
    const db = makeDb([[MEMBER_ROW], [{ id: "vendor-1" }], []], []);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        status: "pending",
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when a quote update no longer returns a row", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1" }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "pending",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
      ],
      [],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        status: "accepted",
      },
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Quote not found",
    });
  });

  it("updates an accepted quote and resyncs the linked budget item", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1" }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [{ id: "00000000-0000-4000-8000-000000000301" }],
        [
          {
            id: "payment-1",
            quoteId: "quote-1",
            paymentType: "deposit",
            amountCents: 50000,
            paidAt: "2026-04-07",
          },
        ],
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 275000,
          status: "accepted",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        amountCents: 275000,
        status: "accepted",
        budgetItemId: "00000000-0000-4000-8000-000000000301",
      },
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for malformed quote update JSON", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      "{",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
  });

  it("recomputes linked budget totals when an accepted quote is demoted and another accepted quote remains", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1" }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            amountCents: 275000,
            status: "pending",
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "quote-2",
            vendorId: "vendor-2",
            status: "accepted",
            amountCents: 150000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "payment-2",
            quoteId: "quote-2",
            paymentType: "deposit",
            amountCents: 75000,
            paidAt: "2026-04-07",
          },
        ],
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 275000,
          status: "pending",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        amountCents: 275000,
        status: "pending",
        budgetItemId: "00000000-0000-4000-8000-000000000301",
      },
    );

    expect(res.status).toBe(200);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 150000,
        paidCents: 75000,
      }),
    );
  });

  it("restores a single surviving accepted quote snapshot instead of summing multiple accepted quotes", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1" }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            amountCents: 275000,
            status: "pending",
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "quote-3",
            vendorId: "vendor-3",
            status: "accepted",
            amountCents: 190000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ],
        [
          {
            id: "payment-3",
            quoteId: "quote-3",
            paymentType: "deposit",
            amountCents: 80000,
            paidAt: "2026-04-08",
          },
        ],
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 275000,
          status: "pending",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        amountCents: 275000,
        status: "pending",
        budgetItemId: "00000000-0000-4000-8000-000000000301",
      },
    );

    expect(res.status).toBe(200);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 190000,
        paidCents: 80000,
      }),
    );
  });

  it("clears linked budget totals when an accepted quote is demoted", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1" }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [{ id: "00000000-0000-4000-8000-000000000301" }],
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 275000,
          status: "pending",
          budgetItemId: "00000000-0000-4000-8000-000000000301",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        amountCents: 275000,
        status: "pending",
        budgetItemId: "00000000-0000-4000-8000-000000000301",
      },
    );

    expect(res.status).toBe(200);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 0,
        paidCents: 0,
      }),
    );
  });

  it("clears linked budget totals when an accepted quote is unlinked", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1" }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 275000,
          status: "accepted",
          budgetItemId: null,
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        amountCents: 275000,
        status: "accepted",
        budgetItemId: null,
      },
    );

    expect(res.status).toBe(200);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 0,
        paidCents: 0,
      }),
    );
  });

  it("rejects invalid quote updates", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        amountCents: -1,
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when updating a quote for a missing vendor", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        status: "pending",
      },
    );
    expect(res.status).toBe(404);
  });

  it("rejects quote updates for viewers", async () => {
    const db = makeDb([[VIEWER_MEMBER]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        status: "pending",
      },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when deleting a quote from a different wedding", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when updating a quote to a missing budget item", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ id: "vendor-1" }],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          status: "pending",
          amountCents: 250000,
          budgetItemId: null,
        },
      ],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        status: "accepted",
        budgetItemId: "00000000-0000-4000-8000-000000000399",
      },
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Budget item not found",
    });
  });

  it("deletes a quote for writers", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
      ],
      [],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
    );
    expect(res.status).toBe(204);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 0,
        paidCents: 0,
      }),
    );
  });

  it("rejects quote deletes for viewers", async () => {
    const db = makeDb([[VIEWER_MEMBER]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 for quote deletes when vendor access is gated", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ ...ACTIVE_SUBSCRIPTION_ROW, plan: "free", status: "inactive" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
    );
    expect(res.status).toBe(402);
  });

  it("deletes a pending quote without triggering budget recomputation", async () => {
    // Lines 851-864: when scopedQuote.status !== "accepted", affectedBudgetItemId
    // is null → no recompute call.
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-pending",
            vendorId: "vendor-1",
            status: "pending",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
      ],
      [],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-pending`,
    );
    expect(res.status).toBe(204);
    // Budget item should NOT have been updated since quote was pending.
    // Note: db.update may be called for feature-first-use tracking, but not for budget recomputation.
    const setCalls: unknown[][] = (db as any).__updateBuilder.set.mock.calls;
    const budgetRecomputeCalls = setCalls.filter(
      (args) =>
        typeof args[0] === "object" &&
        args[0] !== null &&
        ("quotedCents" in (args[0] as object) ||
          "paidCents" in (args[0] as object)),
    );
    expect(budgetRecomputeCalls).toHaveLength(0);
  });

  it("returns 404 when the scoped quote disappears before delete is written", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-pending",
            vendorId: "vendor-1",
            status: "pending",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
      ],
      [],
      [],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-pending`,
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Quote not found",
    });
  });

  it("creates a payment for an accepted quote", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [
          {
            id: "vendor-1",
            weddingId: WEDDING_ROW.id,
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "vendor-1",
            weddingId: WEDDING_ROW.id,
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            amountCents: 250000,
            status: "accepted",
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "payment-existing",
            quoteId: "quote-1",
            paymentType: "deposit",
            amountCents: 50000,
            paidAt: "2026-04-01",
          },
          {
            id: "payment-1",
            quoteId: "quote-1",
            paymentType: "deposit",
            amountCents: 50000,
            paidAt: "2026-04-07",
          },
        ],
      ],
      [
        {
          id: "payment-1",
          quoteId: "quote-1",
          paymentType: "deposit",
          amountCents: 50000,
          paidAt: "2026-04-07",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    );
    expect(res.status).toBe(201);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        paidCents: 100000,
      }),
    );
  });

  it("rejects payment creation when an accepted quote is demoted before insert", async () => {
    const initialQuote = {
      id: "quote-1",
      vendorId: "vendor-1",
      status: "accepted",
      amountCents: 250000,
      budgetItemId: "00000000-0000-4000-8000-000000000301",
    };
    const demotedQuote = {
      ...initialQuote,
      status: "pending",
    };
    const db = makeDb([
      [MEMBER_ROW],
      [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
      [initialQuote],
    ]);
    const transactionInsert = vi.fn().mockReturnValue(makeWriteBuilder([]));
    (db as any).transaction = vi.fn().mockImplementation(async (fn) => {
      let selectIndex = 0;
      return fn({
        ...db,
        select: vi.fn().mockImplementation(() => {
          const rows =
            selectIndex++ === 0
              ? [{ id: "vendor-1", weddingId: WEDDING_ROW.id }]
              : [demotedQuote];
          return makeSelectBuilder(rows);
        }),
        insert: transactionInsert,
      });
    });
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Quote changed before payment creation",
    });
    expect(transactionInsert).not.toHaveBeenCalled();
  });

  it("does not apply foreign-wedding accepted quotes during payment recompute", async () => {
    const quoteRow = {
      id: "quote-1",
      vendorId: "vendor-1",
      status: "accepted",
      amountCents: 50000,
      budgetItemId: "foreign-budget-item",
      notes: null,
      quotedAt: "2026-01-01",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const db = makeDb(
      [
        [MEMBER_ROW],
        [ACTIVE_SUBSCRIPTION_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [quoteRow],
      ],
      [
        {
          id: "payment-1",
          quoteId: "quote-1",
          paymentType: "deposit",
          amountCents: 50000,
          paidAt: "2026-04-07",
        },
      ],
    );
    const transactionUpdateBuilder = makeWriteBuilder([]);
    const transactionInsertBuilder = makeWriteBuilder([
      {
        id: "payment-1",
        quoteId: "quote-1",
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    ]);
    (db as any).transaction = vi.fn().mockImplementation(async (fn) => {
      const tx = {
        ...db,
        insert: vi.fn().mockReturnValue(transactionInsertBuilder),
        update: vi.fn().mockReturnValue(transactionUpdateBuilder),
        select: vi.fn().mockImplementation(() => {
          let joinedVendor = false;
          const builder = makeSelectBuilder([]);
          builder.innerJoin = vi.fn().mockImplementation(() => {
            joinedVendor = true;
            return builder;
          });
          builder.limit = vi.fn().mockReturnValue({
            then: (resolve: (rows: unknown) => unknown) =>
              Promise.resolve(resolve(joinedVendor ? [] : [quoteRow])),
          });
          return builder;
        }),
      };
      return fn(tx);
    });
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    );

    expect(res.status).toBe(201);
    expect(transactionUpdateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: quoteRow.amountCents,
      }),
    );
  });

  it("creates a payment for an accepted quote without a budget link", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [
          {
            id: "vendor-1",
            weddingId: WEDDING_ROW.id,
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
        [
          {
            id: "vendor-1",
            weddingId: WEDDING_ROW.id,
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
        [
          {
            id: "vendor-1",
            weddingId: WEDDING_ROW.id,
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
      ],
      [
        {
          id: "payment-1",
          quoteId: "quote-1",
          paymentType: "deposit",
          amountCents: 50000,
          paidAt: "2026-04-07",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    );

    expect(res.status).toBe(201);
  });

  it("returns 400 for malformed payment creation JSON", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      "{",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
  });

  it("rejects payments for viewers", async () => {
    const db = makeDb([[VIEWER_MEMBER]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 for payment creation when vendor access is gated", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          ...ACTIVE_SUBSCRIPTION_ROW,
          status: "past_due",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    );

    expect(res.status).toBe(402);
  });

  it("rejects payments for non-accepted quotes", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          id: "vendor-1",
          weddingId: WEDDING_ROW.id,
        },
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          status: "pending",
          amountCents: 250000,
          budgetItemId: null,
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    );
    expect(res.status).toBe(400);
  });

  it("rejects payment creation when the payload is invalid", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: -1,
        paidAt: "2026-04-07",
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when creating a payment for a missing quote on a valid vendor", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    );
    expect(res.status).toBe(404);
  });

  it("rejects payment creation when quote does not belong to the vendor", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
      {
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      },
    );
    expect(res.status).toBe(404);
  });

  it("rejects payment updates when the quote does not belong to the vendor", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      {
        amountCents: 75000,
      },
    );
    expect(res.status).toBe(404);
  });

  it("rejects payment updates when the payload is invalid", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      {
        amountCents: -5,
      },
    );
    expect(res.status).toBe(400);
  });

  it("rejects payment updates for viewers", async () => {
    const db = makeDb([[VIEWER_MEMBER]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      {
        amountCents: 75000,
      },
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 for payment updates when vendor access is gated", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          ...ACTIVE_SUBSCRIPTION_ROW,
          status: "past_due",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      {
        amountCents: 75000,
      },
    );

    expect(res.status).toBe(402);
  });

  it("returns 404 when updating a missing payment on a valid quote", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          status: "accepted",
          amountCents: 250000,
          budgetItemId: "00000000-0000-4000-8000-000000000301",
        },
      ],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      {
        amountCents: 75000,
      },
    );
    expect(res.status).toBe(404);
  });

  it("does not update a payment when the scoped quote disappears before the transaction write", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [ACTIVE_SUBSCRIPTION_ROW],
      [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          status: "accepted",
          amountCents: 250000,
          budgetItemId: null,
        },
      ],
    ]);
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          makeSelectBuilder([{ id: "vendor-1", weddingId: WEDDING_ROW.id }]),
        )
        .mockReturnValueOnce(makeSelectBuilder([])),
      update: vi.fn(),
    };
    (db as unknown as Record<string, unknown>).transaction = vi
      .fn()
      .mockImplementation(async (fn: (transactionDb: unknown) => unknown) =>
        fn(tx),
      );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      {
        amountCents: 75000,
      },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Payment not found" });
    expect(tx.update).not.toHaveBeenCalled();
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalled();
  });

  it("updates a payment and resyncs the linked budget item", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "payment-1",
            quoteId: "quote-1",
            paymentType: "deposit",
            amountCents: 50000,
            paidAt: "2026-04-07",
          },
          {
            id: "payment-2",
            quoteId: "quote-1",
            paymentType: "final",
            amountCents: 150000,
            paidAt: "2026-05-01",
          },
        ],
      ],
      [
        {
          id: "payment-1",
          quoteId: "quote-1",
          paymentType: "deposit",
          amountCents: 75000,
          paidAt: "2026-04-07",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      {
        amountCents: 75000,
      },
    );

    expect(res.status).toBe(200);
  });

  it("returns 400 for malformed payment update JSON", async () => {
    const db = makeDb([[MEMBER_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      "{",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
  });

  it("updates a payment without syncing budget totals when the quote has no budget item", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
      ],
      [
        {
          id: "payment-1",
          quoteId: "quote-1",
          paymentType: "deposit",
          amountCents: 75000,
          paidAt: "2026-04-07",
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      {
        amountCents: 75000,
      },
    );

    expect(res.status).toBe(200);
  });

  it("updates a quote without syncing budget totals when there is no accepted budget link", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ id: "vendor-1" }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            amountCents: 275000,
            status: "pending",
            budgetItemId: null,
          },
        ],
      ],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          amountCents: 275000,
          status: "pending",
          budgetItemId: null,
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1`,
      {
        amountCents: 275000,
        status: "pending",
      },
    );

    expect(res.status).toBe(200);
  });

  it("rejects payment deletes when the quote does not belong to the vendor", async () => {
    const db = makeDb([[MEMBER_ROW], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
    );
    expect(res.status).toBe(404);
  });

  it("rejects payment deletes for viewers", async () => {
    const db = makeDb([[VIEWER_MEMBER]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 for payment deletes when vendor access is gated", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          ...ACTIVE_SUBSCRIPTION_ROW,
          status: "past_due",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
    );

    expect(res.status).toBe(402);
  });

  it("recomputes linked budget totals after payment deletion", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [
          {
            id: "vendor-1",
            weddingId: WEDDING_ROW.id,
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            amountCents: 250000,
            status: "accepted",
            budgetItemId: "00000000-0000-4000-8000-000000000301",
          },
        ],
        [
          {
            id: "payment-2",
            quoteId: "quote-1",
            paymentType: "final",
            amountCents: 150000,
            paidAt: "2026-05-01",
          },
        ],
      ],
      [{ id: "payment-1" }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
    );

    expect(res.status).toBe(204);
    expect((db as any).__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotedCents: 250000,
        paidCents: 150000,
      }),
    );
  });

  it("returns 404 when deleting a missing payment on a valid quote", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [
          {
            id: "vendor-1",
            weddingId: WEDDING_ROW.id,
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
      ],
      [],
      [],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/missing-payment`,
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Payment not found" });
  });

  it("does not delete a payment when the scoped quote disappears before the transaction write", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [ACTIVE_SUBSCRIPTION_ROW],
      [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          status: "accepted",
          amountCents: 250000,
          budgetItemId: null,
        },
      ],
    ]);
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          makeSelectBuilder([{ id: "vendor-1", weddingId: WEDDING_ROW.id }]),
        )
        .mockReturnValueOnce(makeSelectBuilder([])),
      delete: vi.fn(),
      update: vi.fn(),
    };
    (db as unknown as Record<string, unknown>).transaction = vi
      .fn()
      .mockImplementation(async (fn: (transactionDb: unknown) => unknown) =>
        fn(tx),
      );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Payment not found" });
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect((db as any).__updateBuilder.set).not.toHaveBeenCalled();
  });

  it("deletes a payment without syncing budget totals when the quote has no budget item", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [
          {
            id: "vendor-1",
            weddingId: WEDDING_ROW.id,
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
        [
          {
            id: "vendor-1",
            weddingId: WEDDING_ROW.id,
          },
        ],
        [
          {
            id: "quote-1",
            vendorId: "vendor-1",
            status: "accepted",
            amountCents: 250000,
            budgetItemId: null,
          },
        ],
      ],
      [{ id: "payment-1" }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
    );

    expect(res.status).toBe(204);
  });

  it("uses the transaction-time quote when deleting a payment after the quote is unlinked", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
      [
        {
          id: "quote-1",
          vendorId: "vendor-1",
          status: "accepted",
          amountCents: 250000,
          budgetItemId: "stale-budget-item",
        },
      ],
    ]);
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          makeSelectBuilder([{ id: "vendor-1", weddingId: WEDDING_ROW.id }]),
        )
        .mockReturnValueOnce(
          makeSelectBuilder([
            {
              id: "quote-1",
              vendorId: "vendor-1",
              status: "accepted",
              amountCents: 250000,
              budgetItemId: null,
            },
          ]),
        ),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "payment-1" }]),
        }),
      }),
      update: vi.fn(),
    };
    (db as unknown as Record<string, unknown>).transaction = vi
      .fn()
      .mockImplementation(async (fn: (transactionDb: unknown) => unknown) =>
        fn(tx),
      );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
    );

    expect(res.status).toBe(204);
    expect(tx.update).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // PATCH /:weddingId/vendors/:vendorId — mass-assignment guard (#18)
  // -------------------------------------------------------------------------
  describe("PATCH vendor — mass-assignment guard", () => {
    it("does not write weddingId even when supplied in the request body", async () => {
      const vendorRow = {
        id: "vendor-1",
        weddingId: WEDDING_ROW.id,
        primaryContactName: "Jane Doe",
        companyName: "Flowers Inc",
        email: null,
        phone: null,
        categoryId: "00000000-0000-4000-8000-000000000201",
        contractStatus: "none",
        contractUrl: null,
        contractSentAt: null,
        contractSignedAt: null,
        notes: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      };

      const db = makeDb(
        [
          [MEMBER_ROW],
          [ACTIVE_SUBSCRIPTION_ROW],
          [vendorRow],
          [{ id: "00000000-0000-4000-8000-000000000201" }],
        ],
        [vendorRow],
      );

      const setArgCapture: Record<string, unknown>[] = [];
      const origUpdate = db.update.bind(db);
      (db as unknown as Record<string, unknown>).update = vi
        .fn()
        .mockImplementation((table: unknown) => {
          const builder = origUpdate(table);
          const origSet = (builder as Record<string, unknown>).set as (
            arg: Record<string, unknown>,
          ) => unknown;
          (builder as Record<string, unknown>).set = vi
            .fn()
            .mockImplementation((arg: Record<string, unknown>) => {
              setArgCapture.push(arg);
              return origSet.call(builder, arg);
            });
          return builder;
        });

      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
        {
          primaryContactName: "Updated Name",
          weddingId: "other-wedding-id", // attacker-supplied field
        },
      );

      expect(res.status).toBe(200);
      // The set() call for the vendor update must not contain weddingId
      const vendorSetCall = setArgCapture.find(
        (arg) => "primaryContactName" in arg || "updatedAt" in arg,
      );
      expect(vendorSetCall).toBeDefined();
      expect(vendorSetCall).not.toHaveProperty("weddingId");
    });

    it("does not write absent partial-update fields as undefined", async () => {
      const vendorRow = {
        id: "vendor-1",
        weddingId: WEDDING_ROW.id,
        primaryContactName: "Jane Doe",
        companyName: "Flowers Inc",
        email: "jane@example.com",
        phone: "555-0100",
        categoryId: "00000000-0000-4000-8000-000000000201",
        contractStatus: "sent",
        contractUrl: "https://contracts.example.com/flowers",
        contractSentAt: "2026-03-01",
        contractSignedAt: null,
        notes: "Existing notes",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      };

      const db = makeDb([[MEMBER_ROW], [ACTIVE_SUBSCRIPTION_ROW]], [vendorRow]);
      const setArgCapture: Record<string, unknown>[] = [];
      const origUpdate = db.update.bind(db);
      (db as unknown as Record<string, unknown>).update = vi
        .fn()
        .mockImplementation((table: unknown) => {
          const builder = origUpdate(table);
          const origSet = (builder as Record<string, unknown>).set as (
            arg: Record<string, unknown>,
          ) => unknown;
          (builder as Record<string, unknown>).set = vi
            .fn()
            .mockImplementation((arg: Record<string, unknown>) => {
              setArgCapture.push(arg);
              return origSet.call(builder, arg);
            });
          return builder;
        });

      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/vendors/vendor-1`,
        {
          companyName: "Flowers and Co.",
        },
      );

      expect(res.status).toBe(200);
      const vendorSetCall = setArgCapture.find((arg) => "updatedAt" in arg);
      expect(vendorSetCall).toEqual({
        companyName: "Flowers and Co.",
        updatedAt: expect.any(Date),
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST payment — vendor payment atomicity (#21)
  // -------------------------------------------------------------------------
  describe("POST payment — transactional with recompute", () => {
    it("does not persist payment when recomputeLinkedBudgetItem throws", async () => {
      const quoteRow = {
        id: "quote-1",
        vendorId: "vendor-1",
        status: "accepted",
        amountCents: 50000,
        budgetItemId: "00000000-0000-4000-8000-000000000302",
        notes: null,
        quotedAt: "2026-01-01",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      };

      let paymentInserted = false;

      const db = makeDb([
        [MEMBER_ROW],
        [ACTIVE_SUBSCRIPTION_ROW],
        // getScopedVendor: vendor found
        [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
        // getScopedQuote -> vendorQuote found
        [quoteRow],
      ]);

      // Override transaction to simulate rollback on error
      (db as unknown as Record<string, unknown>).transaction = vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx: Record<string, unknown> = {};

          const insertBuilder: Record<string, unknown> = {};
          insertBuilder.values = vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(async () => {
              paymentInserted = true;
              return [
                {
                  id: "payment-1",
                  quoteId: "quote-1",
                  amountCents: 10000,
                  paymentType: "deposit",
                  paidAt: "2026-03-01",
                  notes: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ];
            }),
          });
          tx.insert = vi.fn().mockReturnValue(insertBuilder);

          // Simulate update (recomputeLinkedBudgetItem calls db.select and db.update)
          // select for recompute: return accepted quote + empty payments
          let selectCount = 0;
          tx.select = vi.fn().mockImplementation(() => {
            selectCount++;
            if (selectCount === 1) {
              // accepted quotes
              return makeSelectBuilder([quoteRow]);
            }
            // payments for recompute
            return makeSelectBuilder([]);
          });

          // update throws to simulate failure in recompute
          // recomputeLinkedBudgetItem calls: await db.update(budgetItem).set({...}).where(...)
          // The .where() itself must reject (no .returning() is called)
          const updateBuilder: Record<string, unknown> = {};
          const rejectedWhereResult = Promise.reject(
            new Error("DB error in recompute"),
          );
          // Suppress unhandled rejection warning — it will be handled inside fn()
          rejectedWhereResult.catch(() => undefined);
          updateBuilder.set = vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue(rejectedWhereResult),
          });
          tx.update = vi.fn().mockReturnValue(updateBuilder);

          try {
            return await fn(tx);
          } catch {
            // Transaction rolled back — payment not committed
            paymentInserted = false;
            throw new Error("Transaction rolled back");
          }
        });

      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments`,
        { paymentType: "deposit", amountCents: 10000, paidAt: "2026-03-01" },
      );

      // Payment should not have been committed
      expect(paymentInserted).toBe(false);
      // The endpoint should return an error
      expect(res.status).toBeGreaterThanOrEqual(500);
    });
  });
  describe("payment updates/deletes - transactional with recompute", () => {
    const quoteRow = {
      id: "quote-1",
      vendorId: "vendor-1",
      status: "accepted",
      amountCents: 50000,
      budgetItemId: "00000000-0000-4000-8000-000000000302",
      notes: null,
      quotedAt: "2026-01-01",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    function installPaymentTransactionHarness(
      db: Database,
      operation: "update" | "delete",
    ) {
      const tx: Record<string, unknown> = {};
      const paymentUpdateBuilder = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "payment-1",
                quoteId: "quote-1",
                paymentType: "deposit",
                amountCents: 12500,
                paidAt: "2026-03-01",
              },
            ]),
          }),
        }),
      };
      const paymentDeleteBuilder = {
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "payment-1" }]),
        }),
      };
      const budgetUpdateBuilder = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      let selectCount = 0;
      tx.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) {
          return makeSelectBuilder([
            { id: "vendor-1", weddingId: WEDDING_ROW.id },
          ]);
        }
        if (selectCount === 2 || selectCount === 3) {
          return makeSelectBuilder([quoteRow]);
        }
        return makeSelectBuilder([]);
      });
      tx.update = vi.fn().mockImplementation(() => {
        if (operation === "update") {
          const callIndex = (tx.update as ReturnType<typeof vi.fn>).mock.calls
            .length;
          return callIndex === 1 ? paymentUpdateBuilder : budgetUpdateBuilder;
        }
        return budgetUpdateBuilder;
      });
      tx.delete = vi.fn().mockReturnValue(paymentDeleteBuilder);

      (db as unknown as Record<string, unknown>).transaction = vi
        .fn()
        .mockImplementation(async (fn: (transactionDb: unknown) => unknown) =>
          fn(tx),
        );

      return { tx, budgetUpdateBuilder };
    }

    it("runs payment update and linked budget recompute inside one transaction", async () => {
      const db = makeDb(
        [
          [MEMBER_ROW],
          [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
          [quoteRow],
        ],
        [
          {
            id: "payment-1",
            quoteId: "quote-1",
            paymentType: "deposit",
            amountCents: 12500,
            paidAt: "2026-03-01",
          },
        ],
      );
      const { tx, budgetUpdateBuilder } = installPaymentTransactionHarness(
        db,
        "update",
      );

      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "PATCH",
        `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
        { amountCents: 12500 },
      );

      expect(res.status).toBe(200);
      expect(db.transaction).toHaveBeenCalled();
      expect(tx.update).toHaveBeenCalledTimes(2);
      expect(budgetUpdateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          quotedCents: 50000,
          paidCents: 0,
        }),
      );
    });

    it("runs payment delete and linked budget recompute inside one transaction", async () => {
      const db = makeDb(
        [
          [MEMBER_ROW],
          [{ id: "vendor-1", weddingId: WEDDING_ROW.id }],
          [quoteRow],
        ],
        [],
        [{ id: "payment-1" }],
      );
      const { tx, budgetUpdateBuilder } = installPaymentTransactionHarness(
        db,
        "delete",
      );

      const app = makeApp(db, makeAuth());
      const res = await req(
        app,
        "DELETE",
        `/weddings/${WEDDING_ROW.id}/vendors/vendor-1/quotes/quote-1/payments/payment-1`,
      );

      expect(res.status).toBe(204);
      expect(db.transaction).toHaveBeenCalled();
      expect(tx.delete).toHaveBeenCalledTimes(1);
      expect(tx.update).toHaveBeenCalledTimes(1);
      expect(budgetUpdateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          quotedCents: 50000,
          paidCents: 0,
        }),
      );
    });
  });
});
