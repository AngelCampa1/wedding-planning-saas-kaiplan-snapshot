import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  createVendorSchema,
  updateVendorSchema,
  createVendorQuoteSchema,
  updateVendorQuoteSchema,
  createVendorPaymentSchema,
  updateVendorPaymentSchema,
} from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import { vendor, vendorQuote, vendorPayment } from "../db/vendor-schema";
import { budgetCategory, budgetItem } from "../db/budget-schema";
import { readJsonBody } from "../lib/json-body";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";
import {
  recordWeddingFeatureUse,
  requireWeddingFeature,
} from "../middleware/feature-gate";
import { getLatestAcceptedQuotesByVendorId } from "../lib/vendor-financials";

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

type AppEnv = { Bindings: Env; Variables: Variables };

function requireWriter(c: Context<AppEnv>) {
  if (c.get("weddingRole") === "viewer") {
    return c.json({ error: "Viewers cannot modify vendors" }, 403);
  }
  return null;
}

type VendorRow = typeof vendor.$inferSelect & {
  categoryName?: string | null;
};

type VendorQuoteRow = typeof vendorQuote.$inferSelect;
type VendorPaymentRow = typeof vendorPayment.$inferSelect;
type VendorQueryDb = Pick<Database, "select" | "update">;

class VendorQuotePaymentConflictError extends Error {}

function sumPayments(payments: VendorPaymentRow[]) {
  return payments.reduce((sum, payment) => sum + payment.amountCents, 0);
}

function getCategoryNameMap(rows: { id: string; name: string }[]) {
  return new Map(rows.map((row) => [row.id, row.name]));
}

function groupQuotesByVendorId(quotes: VendorQuoteRow[]) {
  const map = new Map<string, VendorQuoteRow[]>();

  for (const quote of quotes) {
    const vendorQuotes = map.get(quote.vendorId) ?? [];
    vendorQuotes.push(quote);
    map.set(quote.vendorId, vendorQuotes);
  }

  return map;
}

function groupPaymentsByQuoteId(payments: VendorPaymentRow[]) {
  const map = new Map<string, VendorPaymentRow[]>();

  for (const payment of payments) {
    const quotePayments = map.get(payment.quoteId) ?? [];
    quotePayments.push(payment);
    map.set(payment.quoteId, quotePayments);
  }

  return map;
}

async function loadVendorsForWedding(db: Database, weddingId: string) {
  return (await db
    .select()
    .from(vendor)
    .where(eq(vendor.weddingId, weddingId))) as VendorRow[];
}

async function loadCategoryNameMap(db: Database, weddingId: string) {
  const categories = (await db
    .select({ id: budgetCategory.id, name: budgetCategory.name })
    .from(budgetCategory)
    .where(eq(budgetCategory.weddingId, weddingId))) as {
    id: string;
    name: string;
  }[];

  return getCategoryNameMap(categories);
}

async function loadQuotesForVendorIds(db: Database, vendorIds: string[]) {
  if (vendorIds.length === 0) {
    return [] as VendorQuoteRow[];
  }

  return (await db
    .select()
    .from(vendorQuote)
    .where(inArray(vendorQuote.vendorId, vendorIds))) as VendorQuoteRow[];
}

async function loadPaymentsForQuoteIds(db: Database, quoteIds: string[]) {
  if (quoteIds.length === 0) {
    return [] as VendorPaymentRow[];
  }

  return (await db
    .select()
    .from(vendorPayment)
    .where(inArray(vendorPayment.quoteId, quoteIds))) as VendorPaymentRow[];
}

async function loadVendorCategoryName(
  db: Database,
  weddingId: string,
  vendorRow: VendorRow,
) {
  if (vendorRow.categoryName) {
    return vendorRow.categoryName;
  }

  const categoryNameMap = await loadCategoryNameMap(db, weddingId);
  return categoryNameMap.get(vendorRow.categoryId) ?? "";
}

async function getScopedVendor(
  db: Pick<Database, "select">,
  weddingId: string,
  vendorId: string,
) {
  const rows = (await db
    .select()
    .from(vendor)
    .where(and(eq(vendor.id, vendorId), eq(vendor.weddingId, weddingId)))
    .limit(1)) as VendorRow[];

  return rows[0] ?? null;
}

async function getScopedQuote(
  db: Pick<Database, "select">,
  weddingId: string,
  vendorId: string,
  quoteId: string,
) {
  const vendorRow = await getScopedVendor(db, weddingId, vendorId);
  if (!vendorRow) {
    return null;
  }

  const rows = (await db
    .select()
    .from(vendorQuote)
    .where(and(eq(vendorQuote.id, quoteId), eq(vendorQuote.vendorId, vendorId)))
    .limit(1)) as VendorQuoteRow[];

  const quoteRow = rows[0] ?? null;
  if (!quoteRow) {
    return null;
  }

  return {
    vendor: vendorRow,
    quote: quoteRow,
  };
}

async function clearLinkedBudgetItem(
  db: VendorQueryDb,
  weddingId: string,
  budgetItemId: string,
) {
  await db
    .update(budgetItem)
    .set({
      quotedCents: 0,
      paidCents: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(budgetItem.id, budgetItemId),
        inArray(
          budgetItem.categoryId,
          db
            .select({ id: budgetCategory.id })
            .from(budgetCategory)
            .where(eq(budgetCategory.weddingId, weddingId)),
        ),
      ),
    );
}

async function recomputeLinkedBudgetItem(
  db: VendorQueryDb,
  weddingId: string,
  budgetItemId: string,
) {
  const acceptedQuotes = (await db
    .select({
      id: vendorQuote.id,
      amountCents: vendorQuote.amountCents,
      createdAt: vendorQuote.createdAt,
      updatedAt: vendorQuote.updatedAt,
    })
    .from(vendorQuote)
    .innerJoin(vendor, eq(vendor.id, vendorQuote.vendorId))
    .where(
      and(
        eq(vendorQuote.budgetItemId, budgetItemId),
        eq(vendorQuote.status, "accepted"),
        eq(vendor.weddingId, weddingId),
      ),
    )
    .orderBy(
      desc(vendorQuote.updatedAt),
      desc(vendorQuote.createdAt),
      desc(vendorQuote.id),
    )
    .limit(1)) as Array<{
    id: string;
    amountCents: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

  if (acceptedQuotes.length === 0) {
    await clearLinkedBudgetItem(db, weddingId, budgetItemId);
    return;
  }

  // Length was checked above; index 0 always exists here.
  const acceptedQuote = acceptedQuotes[0]!;
  const payments = (await db
    .select()
    .from(vendorPayment)
    .where(eq(vendorPayment.quoteId, acceptedQuote.id))) as VendorPaymentRow[];

  await db
    .update(budgetItem)
    .set({
      quotedCents: acceptedQuote.amountCents,
      paidCents: sumPayments(payments),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(budgetItem.id, budgetItemId),
        inArray(
          budgetItem.categoryId,
          db
            .select({ id: budgetCategory.id })
            .from(budgetCategory)
            .where(eq(budgetCategory.weddingId, weddingId)),
        ),
      ),
    );
}

async function recomputeLinkedBudgetItemsAfterQuoteChange(
  db: VendorQueryDb,
  weddingId: string,
  previousQuote: Pick<
    VendorQuoteRow,
    "id" | "amountCents" | "status" | "budgetItemId"
  >,
  nextQuote: Pick<
    VendorQuoteRow,
    "id" | "amountCents" | "status" | "budgetItemId"
  >,
) {
  const previousBudgetItemId =
    previousQuote.status === "accepted" ? previousQuote.budgetItemId : null;
  const nextBudgetItemId =
    nextQuote.status === "accepted" ? nextQuote.budgetItemId : null;

  if (previousBudgetItemId && previousBudgetItemId !== nextBudgetItemId) {
    await recomputeLinkedBudgetItem(db, weddingId, previousBudgetItemId);
  }

  if (nextBudgetItemId) {
    await recomputeLinkedBudgetItem(db, weddingId, nextBudgetItemId);
  }
}

function buildVendorListItems(
  vendors: VendorRow[],
  categoryNameMap: Map<string, string>,
  quotes: VendorQuoteRow[],
  payments: VendorPaymentRow[],
) {
  const quotesByVendorId = groupQuotesByVendorId(quotes);
  const paymentsByQuoteId = groupPaymentsByQuoteId(payments);
  const activeQuoteByVendorId = getLatestAcceptedQuotesByVendorId(quotes);

  return vendors.map((vendorRow) => {
    const vendorQuotes = quotesByVendorId.get(vendorRow.id) ?? [];
    const acceptedQuote = activeQuoteByVendorId.get(vendorRow.id) ?? null;
    const acceptedQuotePayments = acceptedQuote
      ? (paymentsByQuoteId.get(acceptedQuote.id) ?? [])
      : [];
    const totalPaidCents = sumPayments(acceptedQuotePayments);
    const activeQuoteAmountCents = acceptedQuote?.amountCents ?? null;

    return {
      ...vendorRow,
      categoryName:
        vendorRow.categoryName ??
        categoryNameMap.get(vendorRow.categoryId) ??
        "",
      activeQuoteId: acceptedQuote?.id ?? null,
      activeQuoteAmountCents,
      totalPaidCents,
      outstandingCents:
        activeQuoteAmountCents != null
          ? Math.max(activeQuoteAmountCents - totalPaidCents, 0)
          : 0,
      quoteCount: vendorQuotes.length,
    };
  });
}

function buildVendorSummary(
  vendors: VendorRow[],
  quotes: VendorQuoteRow[],
  payments: VendorPaymentRow[],
) {
  const activeAcceptedQuotes = [
    ...getLatestAcceptedQuotesByVendorId(quotes).values(),
  ];
  const acceptedQuoteIds = new Set(
    activeAcceptedQuotes.map((quote) => quote.id),
  );
  const paymentsByQuoteId = groupPaymentsByQuoteId(
    payments.filter((payment) => acceptedQuoteIds.has(payment.quoteId)),
  );

  const totalPaidCents = activeAcceptedQuotes.reduce(
    (sum, quote) => sum + sumPayments(paymentsByQuoteId.get(quote.id) ?? []),
    0,
  );

  const totalOutstandingCents = activeAcceptedQuotes.reduce((sum, quote) => {
    const paidForQuote = sumPayments(paymentsByQuoteId.get(quote.id) ?? []);
    return sum + Math.max(quote.amountCents - paidForQuote, 0);
  }, 0);

  return {
    totalVendors: vendors.length,
    pendingQuotes: quotes.filter((quote) => quote.status === "pending").length,
    signedContracts: vendors.filter(
      (vendorRow) => vendorRow.contractStatus === "signed",
    ).length,
    totalPaidCents,
    totalOutstandingCents,
  };
}

export function vendorRoutes(db: Database, auth: Auth) {
  const app = new Hono<AppEnv>();
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  app.get(
    "/:weddingId/vendors/summary",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendors = await loadVendorsForWedding(db, weddingId);
      const quotes = await loadQuotesForVendorIds(
        db,
        vendors.map((vendorRow) => vendorRow.id),
      );
      const payments = await loadPaymentsForQuoteIds(
        db,
        quotes.map((quote) => quote.id),
      );

      return c.json(buildVendorSummary(vendors, quotes, payments));
    },
  );

  app.get(
    "/:weddingId/vendors",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendors = await loadVendorsForWedding(db, weddingId);
      const categoryNameMap = vendors.every(
        (vendorRow) => vendorRow.categoryName,
      )
        ? new Map<string, string>()
        : await loadCategoryNameMap(db, weddingId);
      const quotes = await loadQuotesForVendorIds(
        db,
        vendors.map((vendorRow) => vendorRow.id),
      );
      const payments = await loadPaymentsForQuoteIds(
        db,
        quotes.map((quote) => quote.id),
      );

      const items = buildVendorListItems(
        vendors,
        categoryNameMap,
        quotes,
        payments,
      );
      return c.json(items);
    },
  );

  app.post(
    "/:weddingId/vendors",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = createVendorSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const categoryRows = await db
        .select({ id: budgetCategory.id })
        .from(budgetCategory)
        .where(
          and(
            eq(budgetCategory.id, parsed.data.categoryId),
            eq(budgetCategory.weddingId, weddingId),
          ),
        )
        .limit(1);

      if (!categoryRows[0]) {
        return c.json({ error: "Category not found" }, 404);
      }

      const [created] = await db
        .insert(vendor)
        .values({
          weddingId,
          ...parsed.data,
        })
        .returning();

      await recordWeddingFeatureUse(db, c, "vendors");
      return c.json(created, 201);
    },
  );

  app.get(
    "/:weddingId/vendors/:vendorId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendorId = c.req.param("vendorId");
      const found = await getScopedVendor(db, weddingId, vendorId);
      if (!found) {
        return c.json({ error: "Vendor not found" }, 404);
      }

      const categoryName = await loadVendorCategoryName(db, weddingId, found);
      const quotes = await loadQuotesForVendorIds(db, [found.id]);
      const payments = await loadPaymentsForQuoteIds(
        db,
        quotes.map((quote) => quote.id),
      );
      const paymentsByQuoteId = groupPaymentsByQuoteId(payments);

      return c.json({
        ...found,
        categoryName,
        quotes: quotes.map((quote) => ({
          ...quote,
          payments: paymentsByQuoteId.get(quote.id) ?? [],
        })),
      });
    },
  );

  app.patch(
    "/:weddingId/vendors/:vendorId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendorId = c.req.param("vendorId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = updateVendorSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      if (parsed.data.categoryId) {
        const categoryRows = await db
          .select({ id: budgetCategory.id })
          .from(budgetCategory)
          .where(
            and(
              eq(budgetCategory.id, parsed.data.categoryId),
              eq(budgetCategory.weddingId, weddingId),
            ),
          )
          .limit(1);

        if (!categoryRows[0]) {
          return c.json({ error: "Category not found" }, 404);
        }
      }

      const [updated] = await db
        .update(vendor)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(and(eq(vendor.id, vendorId), eq(vendor.weddingId, weddingId)))
        .returning();

      if (!updated) {
        return c.json({ error: "Vendor not found" }, 404);
      }

      await recordWeddingFeatureUse(db, c, "vendors");
      return c.json(updated);
    },
  );

  app.delete(
    "/:weddingId/vendors/:vendorId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendorId = c.req.param("vendorId");

      const deleted = await db.transaction(async (tx) => {
        const found = await getScopedVendor(tx, weddingId, vendorId);
        if (!found) {
          return false;
        }

        const acceptedQuoteBudgetItems = (await tx
          .select({ budgetItemId: vendorQuote.budgetItemId })
          .from(vendorQuote)
          .where(
            and(
              eq(vendorQuote.vendorId, vendorId),
              eq(vendorQuote.status, "accepted"),
            ),
          )) as Array<{ budgetItemId: string | null }>;
        const affectedBudgetItemIds = [
          ...new Set(
            acceptedQuoteBudgetItems
              .map((row) => row.budgetItemId)
              .filter((budgetItemId): budgetItemId is string =>
                Boolean(budgetItemId),
              ),
          ),
        ];

        const [deletedVendor] = (await tx
          .delete(vendor)
          .where(and(eq(vendor.id, vendorId), eq(vendor.weddingId, weddingId)))
          .returning({ id: vendor.id })) as Array<{ id: string }>;

        if (!deletedVendor) {
          return false;
        }

        for (const budgetItemId of affectedBudgetItemIds) {
          await recomputeLinkedBudgetItem(tx, weddingId, budgetItemId);
        }

        return true;
      });

      if (!deleted) {
        return c.json({ error: "Vendor not found" }, 404);
      }

      await recordWeddingFeatureUse(db, c, "vendors");
      return c.body(null, 204);
    },
  );

  app.post(
    "/:weddingId/vendors/:vendorId/quotes",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendorId = c.req.param("vendorId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = createVendorQuoteSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      return db.transaction(async (tx) => {
        const vendorRows = await tx
          .select({ id: vendor.id, weddingId: vendor.weddingId })
          .from(vendor)
          .where(and(eq(vendor.id, vendorId), eq(vendor.weddingId, weddingId)))
          .limit(1);

        if (!vendorRows[0]) {
          return c.json({ error: "Vendor not found" }, 404);
        }

        if (parsed.data.budgetItemId) {
          const budgetRows = await tx
            .select({ id: budgetItem.id })
            .from(budgetItem)
            .innerJoin(
              budgetCategory,
              eq(budgetCategory.id, budgetItem.categoryId),
            )
            .where(
              and(
                eq(budgetItem.id, parsed.data.budgetItemId),
                eq(budgetCategory.weddingId, weddingId),
              ),
            )
            .limit(1);

          if (!budgetRows[0]) {
            return c.json({ error: "Budget item not found" }, 404);
          }
        }

        const [created] = await tx
          .insert(vendorQuote)
          .values({
            vendorId,
            ...parsed.data,
          })
          .returning();

        if (created?.status === "accepted" && created.budgetItemId) {
          await recomputeLinkedBudgetItem(tx, weddingId, created.budgetItemId);
        }

        await recordWeddingFeatureUse(tx, c, "vendors");
        return c.json(created, 201);
      });
    },
  );

  app.patch(
    "/:weddingId/vendors/:vendorId/quotes/:quoteId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendorId = c.req.param("vendorId");
      const quoteId = c.req.param("quoteId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = updateVendorQuoteSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      return db.transaction(async (tx) => {
        const vendorRows = await tx
          .select({ id: vendor.id })
          .from(vendor)
          .where(and(eq(vendor.id, vendorId), eq(vendor.weddingId, weddingId)))
          .limit(1);

        if (!vendorRows[0]) {
          return c.json({ error: "Vendor not found" }, 404);
        }

        const quoteRows = (await tx
          .select()
          .from(vendorQuote)
          .where(
            and(
              eq(vendorQuote.id, quoteId),
              eq(vendorQuote.vendorId, vendorId),
            ),
          )
          .limit(1)) as VendorQuoteRow[];
        const existingQuote = quoteRows[0] ?? null;
        if (!existingQuote) {
          return c.json({ error: "Quote not found" }, 404);
        }

        if (parsed.data.budgetItemId) {
          const budgetRows = await tx
            .select({ id: budgetItem.id })
            .from(budgetItem)
            .innerJoin(
              budgetCategory,
              eq(budgetCategory.id, budgetItem.categoryId),
            )
            .where(
              and(
                eq(budgetItem.id, parsed.data.budgetItemId),
                eq(budgetCategory.weddingId, weddingId),
              ),
            )
            .limit(1);

          if (!budgetRows[0]) {
            return c.json({ error: "Budget item not found" }, 404);
          }
        }

        const [updated] = await tx
          .update(vendorQuote)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(
            and(
              eq(vendorQuote.id, quoteId),
              eq(vendorQuote.vendorId, vendorId),
            ),
          )
          .returning();

        if (!updated) {
          return c.json({ error: "Quote not found" }, 404);
        }

        await recomputeLinkedBudgetItemsAfterQuoteChange(
          tx,
          weddingId,
          existingQuote,
          updated,
        );

        await recordWeddingFeatureUse(tx, c, "vendors");
        return c.json(updated);
      });
    },
  );

  app.delete(
    "/:weddingId/vendors/:vendorId/quotes/:quoteId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendorId = c.req.param("vendorId");
      const quoteId = c.req.param("quoteId");
      const response = await db.transaction(async (tx) => {
        const scopedQuote = await getScopedQuote(
          tx,
          weddingId,
          vendorId,
          quoteId,
        );
        if (!scopedQuote) {
          return c.json({ error: "Quote not found" }, 404);
        }

        const affectedBudgetItemId =
          scopedQuote.quote.status === "accepted"
            ? scopedQuote.quote.budgetItemId
            : null;

        const [deletedQuote] = (await tx
          .delete(vendorQuote)
          .where(
            and(
              eq(vendorQuote.id, quoteId),
              eq(vendorQuote.vendorId, vendorId),
            ),
          )
          .returning({ id: vendorQuote.id })) as Array<{ id: string }>;

        if (!deletedQuote) {
          return c.json({ error: "Quote not found" }, 404);
        }

        if (affectedBudgetItemId) {
          await recomputeLinkedBudgetItem(tx, weddingId, affectedBudgetItemId);
        }

        return c.body(null, 204);
      });

      if (response.status === 204) {
        await recordWeddingFeatureUse(db, c, "vendors");
      }

      return response;
    },
  );

  app.post(
    "/:weddingId/vendors/:vendorId/quotes/:quoteId/payments",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const quoteId = c.req.param("quoteId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = createVendorPaymentSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const scopedQuote = await getScopedQuote(
        db,
        weddingId,
        c.req.param("vendorId"),
        quoteId,
      );
      if (!scopedQuote) {
        return c.json({ error: "Quote not found" }, 404);
      }
      const foundQuote = scopedQuote.quote;
      if (foundQuote.status !== "accepted") {
        return c.json({ error: "Payments require an accepted quote" }, 400);
      }

      try {
        const created = await db.transaction(async (tx) => {
          const currentScopedQuote = await getScopedQuote(
            tx,
            weddingId,
            c.req.param("vendorId"),
            quoteId,
          );
          if (
            !currentScopedQuote ||
            currentScopedQuote.quote.status !== "accepted"
          ) {
            throw new VendorQuotePaymentConflictError();
          }
          const currentQuote = currentScopedQuote.quote;

          const [inserted] = await tx
            .insert(vendorPayment)
            .values({
              quoteId,
              ...parsed.data,
            })
            .returning();

          if (currentQuote.budgetItemId) {
            await recomputeLinkedBudgetItem(
              tx,
              weddingId,
              currentQuote.budgetItemId,
            );
          }

          await recordWeddingFeatureUse(tx, c, "vendors");
          return inserted;
        });

        return c.json(created, 201);
      } catch (error) {
        if (!(error instanceof VendorQuotePaymentConflictError)) {
          throw error;
        }
        return c.json({ error: "Quote changed before payment creation" }, 409);
      }
    },
  );

  app.patch(
    "/:weddingId/vendors/:vendorId/quotes/:quoteId/payments/:paymentId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendorId = c.req.param("vendorId");
      const quoteId = c.req.param("quoteId");
      const paymentId = c.req.param("paymentId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;
      const parsed = updateVendorPaymentSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const scopedQuote = await getScopedQuote(
        db,
        weddingId,
        vendorId,
        quoteId,
      );
      if (!scopedQuote) {
        return c.json({ error: "Quote not found" }, 404);
      }

      const updated = await db.transaction(async (tx) => {
        const currentScopedQuote = await getScopedQuote(
          tx,
          weddingId,
          vendorId,
          quoteId,
        );
        if (!currentScopedQuote) {
          return null;
        }
        const currentQuote = currentScopedQuote.quote;

        const [payment] = await tx
          .update(vendorPayment)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(
            and(
              eq(vendorPayment.id, paymentId),
              eq(vendorPayment.quoteId, quoteId),
            ),
          )
          .returning();

        if (!payment) {
          return null;
        }

        if (currentQuote.budgetItemId) {
          await recomputeLinkedBudgetItem(
            tx,
            weddingId,
            currentQuote.budgetItemId,
          );
        }

        await recordWeddingFeatureUse(tx, c, "vendors");
        return payment;
      });

      if (!updated) {
        return c.json({ error: "Payment not found" }, 404);
      }

      return c.json(updated);
    },
  );

  app.delete(
    "/:weddingId/vendors/:vendorId/quotes/:quoteId/payments/:paymentId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const vendorId = c.req.param("vendorId");
      const quoteId = c.req.param("quoteId");
      const paymentId = c.req.param("paymentId");
      const scopedQuote = await getScopedQuote(
        db,
        weddingId,
        vendorId,
        quoteId,
      );
      if (!scopedQuote) {
        return c.json({ error: "Quote not found" }, 404);
      }

      const deleted = await db.transaction(async (tx) => {
        const currentScopedQuote = await getScopedQuote(
          tx,
          weddingId,
          vendorId,
          quoteId,
        );
        if (!currentScopedQuote) {
          return null;
        }
        const currentQuote = currentScopedQuote.quote;

        const [payment] = await tx
          .delete(vendorPayment)
          .where(
            and(
              eq(vendorPayment.id, paymentId),
              eq(vendorPayment.quoteId, quoteId),
            ),
          )
          .returning({ id: vendorPayment.id });

        if (!payment) {
          return null;
        }

        if (currentQuote.budgetItemId) {
          await recomputeLinkedBudgetItem(
            tx,
            weddingId,
            currentQuote.budgetItemId,
          );
        }

        return payment;
      });

      if (!deleted) {
        return c.json({ error: "Payment not found" }, 404);
      }

      await recordWeddingFeatureUse(db, c, "vendors");
      return c.body(null, 204);
    },
  );

  return app;
}
