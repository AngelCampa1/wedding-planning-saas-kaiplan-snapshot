import { describe, it, expect } from "vitest";
import {
  createWeddingSchema,
  updateWeddingSchema,
  inviteMemberSchema,
} from "../src/schemas";
import {
  BILLING_PLANS,
  INVITABLE_WEDDING_ROLES,
  PRICING_TIERS,
  WEDDING_ROLES,
} from "../src/constants";

describe("createWeddingSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = createWeddingSchema.safeParse({
      name: "Sarah & James",
      date: "2027-06-15",
      budgetCents: 3000000,
      currency: "USD",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = createWeddingSchema.safeParse({
      name: "Our Wedding",
      date: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // null means "no budget configured" (default); 0 means explicitly set to zero
      expect(result.data.budgetCents).toBe(null);
      expect(result.data.currency).toBe("USD");
      expect(result.data.timezone).toBe("America/New_York");
    }
  });

  it("rejects empty name", () => {
    const result = createWeddingSchema.safeParse({
      name: "",
      date: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const result = createWeddingSchema.safeParse({
      name: "   ",
      date: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 200 characters", () => {
    const result = createWeddingSchema.safeParse({
      name: "a".repeat(201),
      date: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative budget", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      budgetCents: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts another valid ISO 4217 currency code", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      currency: "EUR",
    });
    expect(result.success).toBe(true);
  });

  it("rejects lowercase currency codes", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      currency: "usd",
    });
    expect(result.success).toBe(false);
  });

  it("rejects currency codes shorter than three characters", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      currency: "US",
    });
    expect(result.success).toBe(false);
  });

  it("rejects currency codes longer than three characters", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      currency: "USDX",
    });
    expect(result.success).toBe(false);
  });

  it("rejects currency codes with digits", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      currency: "US1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts nested IANA timezone", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      timezone: "America/Argentina/Buenos_Aires",
    });
    expect(result.success).toBe(true);
  });

  it("accepts Etc offset-style IANA timezone", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      timezone: "Etc/GMT+1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty timezone", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      timezone: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects obviously invalid timezone strings", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      timezone: "Not/A_Real_Zone",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateWeddingSchema", () => {
  it("accepts partial updates", () => {
    const result = updateWeddingSchema.safeParse({ name: "Updated Name" });
    expect(result.success).toBe(true);
  });

  it("rejects whitespace-only name", () => {
    const result = updateWeddingSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts empty object", () => {
    const result = updateWeddingSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("inviteMemberSchema", () => {
  it("accepts valid editor invite", () => {
    const result = inviteMemberSchema.safeParse({
      email: "partner@example.com",
      role: "editor",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid viewer invite", () => {
    const result = inviteMemberSchema.safeParse({
      email: "family@example.com",
      role: "viewer",
    });
    expect(result.success).toBe(true);
  });

  it("trims invite email before validation", () => {
    const result = inviteMemberSchema.safeParse({
      email: "  partner@example.com  ",
      role: "editor",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("partner@example.com");
    }
  });

  it("rejects owner role in invite", () => {
    const result = inviteMemberSchema.safeParse({
      email: "someone@example.com",
      role: "owner",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = inviteMemberSchema.safeParse({
      email: "not-an-email",
      role: "editor",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string invite email", () => {
    const result = inviteMemberSchema.safeParse({
      email: 123,
      role: "editor",
    });

    expect(result.success).toBe(false);
  });

  it("accepts every non-owner role in INVITABLE_WEDDING_ROLES", () => {
    for (const role of INVITABLE_WEDDING_ROLES) {
      const result = inviteMemberSchema.safeParse({
        email: "x@example.com",
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it("keeps INVITABLE_WEDDING_ROLES in sync with WEDDING_ROLES minus owner", () => {
    expect(INVITABLE_WEDDING_ROLES).not.toContain("owner");
    for (const role of WEDDING_ROLES) {
      if (role === "owner") continue;
      expect(INVITABLE_WEDDING_ROLES).toContain(role);
    }
  });
});

describe("billing plan constants", () => {
  it("derives PRICING_TIERS from BILLING_PLANS minus free", () => {
    expect(PRICING_TIERS).toEqual(
      BILLING_PLANS.filter((plan) => plan !== "free"),
    );
  });

  it("never contains free in PRICING_TIERS", () => {
    expect(PRICING_TIERS).not.toContain("free");
  });

  it("keeps PRICING_TIERS and BILLING_PLANS in sync", () => {
    for (const plan of BILLING_PLANS) {
      if (plan === "free") {
        expect(PRICING_TIERS).not.toContain(plan);
      } else {
        expect(PRICING_TIERS).toContain(plan);
      }
    }
  });
});

describe("inviteMemberSchema email max length (254 chars)", () => {
  it("rejects email over 254 characters", () => {
    const longLocal = "a".repeat(245);
    const email = `${longLocal}@example.com`; // 258 chars
    expect(email.length).toBeGreaterThan(254);
    const result = inviteMemberSchema.safeParse({
      email,
      role: "editor",
    });
    expect(result.success).toBe(false);
  });
});
