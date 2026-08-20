import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import {
  guest,
  budgetCategory,
  budgetItem,
  vendor,
  vendorQuote,
  vendorPayment,
} from "../db/schema";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";
import { requireWeddingFeature } from "../middleware/feature-gate";
import { getLatestAcceptedQuotesByVendorId } from "../lib/vendor-financials";

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

const FORMULA_INJECTION_RE = /^\s*[=+\-@\t\r\n]/;
const FORMULA_AFTER_LINE_BREAK_RE = /(\r\n|\r|\n)([=+\-@\t])/g;

/**
 * Sanitizes a CSV cell value against formula injection attacks.
 * If the cell starts with a spreadsheet formula trigger character
 * (=, +, -, @, TAB, CR), including after leading whitespace, a leading
 * single-quote is prepended so spreadsheet applications treat the value as
 * plain text.
 */
export function sanitizeCsvCell(value: string): string {
  const prefixed = FORMULA_INJECTION_RE.test(value) ? `'${value}` : value;
  return prefixed.replace(FORMULA_AFTER_LINE_BREAK_RE, "$1'$2");
}

function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  function escape(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return "";
    const str = typeof val === "string" ? sanitizeCsvCell(val) : String(val);
    if (
      str.includes(",") ||
      str.includes('"') ||
      str.includes("\r") ||
      str.includes("\n")
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
  return [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}

export function exportRoutes(db: Database, auth: Auth) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  // GET /:weddingId/export/guests.csv
  app.get(
    "/:weddingId/export/guests.csv",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const rows = await db
        .select()
        .from(guest)
        .where(eq(guest.weddingId, weddingId));

      const csvRows = rows.map((g) => [
        g.firstName,
        g.lastName,
        g.email,
        g.phone,
        g.side,
        g.groupName,
        g.rsvpStatus,
        g.dietaryTags.join("|"),
        g.dietaryNotes,
      ]);

      const csv = toCsv(
        [
          "firstName",
          "lastName",
          "email",
          "phone",
          "side",
          "groupName",
          "rsvpStatus",
          "dietaryTags",
          "dietaryNotes",
        ],
        csvRows,
      );

      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header("Content-Disposition", 'attachment; filename="guests.csv"');
      return c.body(csv);
    },
  );

  // GET /:weddingId/export/budget.csv
  app.get(
    "/:weddingId/export/budget.csv",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const categories = await db
        .select()
        .from(budgetCategory)
        .where(eq(budgetCategory.weddingId, weddingId));

      const categoryIds = categories.map((cat) => cat.id);

      const filteredItems =
        categoryIds.length > 0
          ? await db
              .select()
              .from(budgetItem)
              .where(inArray(budgetItem.categoryId, categoryIds))
          : [];

      const csvRows: (string | number | null | undefined)[][] = [];

      for (const cat of categories) {
        csvRows.push([
          "category",
          cat.name,
          cat.estimatedCents,
          null,
          null,
          null,
        ]);

        const catItems = filteredItems.filter(
          (item) => item.categoryId === cat.id,
        );
        for (const item of catItems) {
          csvRows.push([
            "item",
            item.name,
            item.estimatedCents,
            item.quotedCents,
            item.paidCents,
            item.notes,
          ]);
        }
      }

      const csv = toCsv(
        ["type", "name", "estimatedCents", "quotedCents", "paidCents", "notes"],
        csvRows,
      );

      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header("Content-Disposition", 'attachment; filename="budget.csv"');
      return c.body(csv);
    },
  );

  // GET /:weddingId/export/vendors.csv
  app.get(
    "/:weddingId/export/vendors.csv",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const featureError = await requireWeddingFeature(db, c, "vendors", {
        recordUse: false,
      });
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");

      const rows = await db
        .select()
        .from(vendor)
        .where(eq(vendor.weddingId, weddingId));

      const vendorIds = rows.map((row) => row.id);
      const acceptedQuotes =
        vendorIds.length > 0
          ? await db
              .select()
              .from(vendorQuote)
              .where(inArray(vendorQuote.vendorId, vendorIds))
          : [];
      const activeAcceptedQuotes = [
        ...getLatestAcceptedQuotesByVendorId(acceptedQuotes).values(),
      ];
      const acceptedQuoteIds = activeAcceptedQuotes.map((quote) => quote.id);
      const payments =
        acceptedQuoteIds.length > 0
          ? await db
              .select()
              .from(vendorPayment)
              .where(inArray(vendorPayment.quoteId, acceptedQuoteIds))
          : [];

      const acceptedQuoteTotals = new Map(
        activeAcceptedQuotes.map((quote) => [
          quote.vendorId,
          quote.amountCents,
        ]),
      );
      const quoteVendorIds = new Map(
        activeAcceptedQuotes.map((quote) => [quote.id, quote.vendorId]),
      );
      const paymentTotals = new Map<string, number>();
      for (const payment of payments) {
        const vendorId = quoteVendorIds.get(payment.quoteId);
        if (!vendorId) continue;
        paymentTotals.set(
          vendorId,
          (paymentTotals.get(vendorId) ?? 0) + payment.amountCents,
        );
      }

      const csvRows = rows.map((v) => [
        v.companyName,
        v.primaryContactName,
        v.email,
        v.phone,
        v.contractStatus,
        acceptedQuoteTotals.get(v.id) ?? 0,
        paymentTotals.get(v.id) ?? 0,
      ]);

      const csv = toCsv(
        [
          "companyName",
          "primaryContactName",
          "email",
          "phone",
          "contractStatus",
          "totalAcceptedQuotedCents",
          "totalPaidCents",
        ],
        csvRows,
      );

      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header("Content-Disposition", 'attachment; filename="vendors.csv"');
      return c.body(csv);
    },
  );

  return app;
}
