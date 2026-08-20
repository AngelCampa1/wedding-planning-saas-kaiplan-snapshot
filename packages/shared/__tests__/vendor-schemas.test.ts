import { describe, it, expect } from "vitest";
import {
  createVendorSchema,
  updateVendorSchema,
  createVendorQuoteSchema,
  updateVendorQuoteSchema,
  createVendorPaymentSchema,
  updateVendorPaymentSchema,
  CONTRACT_STATUSES,
  VENDOR_QUOTE_STATUSES,
  VENDOR_PAYMENT_TYPES,
} from "../src";

describe("vendor constants", () => {
  it("exports the expected contract statuses", () => {
    expect(CONTRACT_STATUSES).toEqual(["none", "sent", "signed"]);
  });

  it("exports the expected quote statuses", () => {
    expect(VENDOR_QUOTE_STATUSES).toEqual(["pending", "accepted", "rejected"]);
  });

  it("exports the expected payment types", () => {
    expect(VENDOR_PAYMENT_TYPES).toEqual(["deposit", "installment", "final"]);
  });
});

describe("createVendorSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Sofia Ramos",
      companyName: "Golden Hour Photo",
      email: "hello@goldenhour.test",
      phone: "+1 (555) 123-4567",
      categoryId: "00000000-0000-4000-8000-000000000201",
      contractStatus: "sent",
      contractUrl: "https://docs.example.com/contracts/photo",
      contractSentAt: "2026-04-07",
      contractSignedAt: null,
      notes: "Prefers email contact",
    });
    expect(result.success).toBe(true);
  });

  it("defaults optional fields", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contractStatus).toBe("none");
      expect(result.data.email).toBeNull();
      expect(result.data.phone).toBeNull();
      expect(result.data.contractUrl).toBeNull();
      expect(result.data.contractSentAt).toBeNull();
      expect(result.data.contractSignedAt).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });

  it("normalizes blank optional contact fields to null", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      email: "   ",
      phone: "   ",
      contractUrl: "   ",
      notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
      expect(result.data.phone).toBeNull();
      expect(result.data.contractUrl).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });

  it("trims optional contact fields", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      email: "  hello@goldenhour.test  ",
      phone: "  +1 (555) 123-4567  ",
      contractUrl: "  https://docs.example.com/contracts/photo  ",
      notes: "  Prefers email contact  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("hello@goldenhour.test");
      expect(result.data.phone).toBe("+1 (555) 123-4567");
      expect(result.data.contractUrl).toBe(
        "https://docs.example.com/contracts/photo",
      );
      expect(result.data.notes).toBe("Prefers email contact");
    }
  });

  it("rejects invalid email", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid contract URL", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      contractUrl: "ftp://not-supported.test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a plain non-URL string for contractUrl without throwing", () => {
    // Verifies that the try/catch in httpsUrlField.refine returns false
    // instead of letting new URL(v) propagate an unhandled TypeError.
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      contractUrl: "not-a-url-at-all",
    });
    expect(result.success).toBe(false);
  });

  it("rejects http contract URL", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      contractUrl: "http://example.com/contract",
    });
    expect(result.success).toBe(false);
  });

  it("accepts uppercase HTTPS protocol in contract URL", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      contractUrl: "HTTPS://example.com/contract",
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes above 500 chars", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      notes: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed category ids and blank names", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "   ",
      companyName: "Vendors Inc.",
      categoryId: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateVendorSchema", () => {
  it("accepts partial updates", () => {
    const result = updateVendorSchema.safeParse({
      contractStatus: "signed",
      contractSignedAt: "2026-04-08",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = updateVendorSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("normalizes blank optional contact fields to null", () => {
    const result = updateVendorSchema.safeParse({
      email: "   ",
      phone: "   ",
      contractUrl: "   ",
      notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
      expect(result.data.phone).toBeNull();
      expect(result.data.contractUrl).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });
});

describe("createVendorQuoteSchema", () => {
  it("accepts valid quote input", () => {
    const result = createVendorQuoteSchema.safeParse({
      amountCents: 250000,
      quotedAt: "2026-04-07",
      status: "accepted",
      budgetItemId: "00000000-0000-4000-8000-000000000301",
      notes: "Includes second shooter",
    });
    expect(result.success).toBe(true);
  });

  it("defaults status to pending and budgetItemId to null", () => {
    const result = createVendorQuoteSchema.safeParse({
      amountCents: 250000,
      quotedAt: "2026-04-07",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("pending");
      expect(result.data.budgetItemId).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });

  it("rejects invalid amount", () => {
    const result = createVendorQuoteSchema.safeParse({
      amountCents: -1,
      quotedAt: "2026-04-07",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed budget item ids", () => {
    const result = createVendorQuoteSchema.safeParse({
      amountCents: 250000,
      quotedAt: "2026-04-07",
      budgetItemId: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });

  it("normalizes blank notes to null", () => {
    const result = createVendorQuoteSchema.safeParse({
      amountCents: 250000,
      quotedAt: "2026-04-07",
      notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });
});

describe("updateVendorQuoteSchema", () => {
  it("accepts partial update", () => {
    const result = updateVendorQuoteSchema.safeParse({
      status: "rejected",
      notes: "Too expensive",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = updateVendorQuoteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("trims notes", () => {
    const result = updateVendorQuoteSchema.safeParse({
      notes: "  Too expensive  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("Too expensive");
    }
  });
});

describe("createVendorPaymentSchema", () => {
  it("accepts valid payment input", () => {
    const result = createVendorPaymentSchema.safeParse({
      paymentType: "deposit",
      amountCents: 50000,
      paidAt: "2026-04-09",
      notes: "Paid by card",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid payment type", () => {
    const result = createVendorPaymentSchema.safeParse({
      paymentType: "wire",
      amountCents: 50000,
      paidAt: "2026-04-09",
    });
    expect(result.success).toBe(false);
  });

  it("normalizes blank notes to null", () => {
    const result = createVendorPaymentSchema.safeParse({
      paymentType: "deposit",
      amountCents: 50000,
      paidAt: "2026-04-09",
      notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });
});

describe("updateVendorPaymentSchema", () => {
  it("accepts partial update", () => {
    const result = updateVendorPaymentSchema.safeParse({
      amountCents: 75000,
      notes: "Updated amount",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = updateVendorPaymentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("date field sanity range", () => {
  it("rejects dates before 2000-01-01 in contractSentAt", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      contractSentAt: "1999-12-31",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("reasonable range"))).toBe(true);
    }
  });

  it("rejects dates after 2100-12-31 in contractSentAt", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      contractSentAt: "2101-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts dates in range 2000-2100", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "Planner",
      companyName: "Vendors Inc.",
      categoryId: "00000000-0000-4000-8000-000000000201",
      contractSentAt: "2026-04-18",
    });
    expect(result.success).toBe(true);
  });

  it("rejects out-of-range quotedAt in createVendorQuoteSchema", () => {
    const result = createVendorQuoteSchema.safeParse({
      amountCents: 100,
      quotedAt: "1900-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range paidAt in createVendorPaymentSchema", () => {
    const result = createVendorPaymentSchema.safeParse({
      paymentType: "deposit",
      amountCents: 100,
      paidAt: "2200-01-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("email max length — RFC 5321 (254 chars)", () => {
  it("rejects vendor email over 254 characters", () => {
    const longLocal = "a".repeat(245);
    const email = `${longLocal}@example.com`; // 258 chars
    expect(email.length).toBeGreaterThan(254);
    const result = createVendorSchema.safeParse({
      primaryContactName: "John Smith",
      companyName: "Acme Corp",
      email,
      categoryId: "00000000-0000-4000-8000-000000000201",
    });
    expect(result.success).toBe(false);
  });
});

describe("notes max length (500 chars)", () => {
  it("rejects vendor notes over 500 characters", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "John Smith",
      companyName: "Acme Corp",
      categoryId: "00000000-0000-4000-8000-000000000201",
      notes: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts vendor notes exactly 500 characters", () => {
    const result = createVendorSchema.safeParse({
      primaryContactName: "John Smith",
      companyName: "Acme Corp",
      categoryId: "00000000-0000-4000-8000-000000000201",
      notes: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });
});
