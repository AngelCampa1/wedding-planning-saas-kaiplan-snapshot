import { describe, expect, it } from "vitest";
import { getLatestAcceptedQuotesByVendorId } from "../../src/lib/vendor-financials";

describe("getLatestAcceptedQuotesByVendorId", () => {
  it("ignores non-accepted quotes and keeps the newest accepted quote per vendor", () => {
    const result = getLatestAcceptedQuotesByVendorId([
      {
        id: "pending-newer",
        vendorId: "vendor-1",
        status: "pending",
        amountCents: 999,
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        id: "accepted-old",
        vendorId: "vendor-1",
        status: "accepted",
        amountCents: 100,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "accepted-new",
        vendorId: "vendor-1",
        status: "accepted",
        amountCents: 200,
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);

    expect(result.get("vendor-1")).toMatchObject({ id: "accepted-new" });
  });

  it("falls back to createdAt and id ordering when updatedAt ties", () => {
    const result = getLatestAcceptedQuotesByVendorId([
      {
        id: "quote-a",
        vendorId: "vendor-1",
        status: "accepted",
        updatedAt: "2026-02-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "quote-b",
        vendorId: "vendor-1",
        status: "accepted",
        updatedAt: "2026-02-01T00:00:00.000Z",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "quote-c",
        vendorId: "vendor-2",
        status: "accepted",
        updatedAt: "not-a-date",
        createdAt: null,
      },
      {
        id: "quote-d",
        vendorId: "vendor-2",
        status: "accepted",
        updatedAt: "not-a-date",
        createdAt: null,
      },
    ]);

    expect(result.get("vendor-1")).toMatchObject({ id: "quote-b" });
    expect(result.get("vendor-2")).toMatchObject({ id: "quote-d" });
  });

  it("keeps the current accepted quote when a later candidate is older", () => {
    const result = getLatestAcceptedQuotesByVendorId([
      {
        id: "quote-new",
        vendorId: "vendor-1",
        status: "accepted",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "quote-old",
        vendorId: "vendor-1",
        status: "accepted",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(result.get("vendor-1")).toMatchObject({ id: "quote-new" });
  });
});
