import { describe, it, expect } from "vitest";
import {
  createGuestSchema,
  updateGuestSchema,
  bulkUpdateRsvpSchema,
  csvRowSchema,
} from "../src/guest-schemas";

describe("createGuestSchema", () => {
  it("accepts valid input with required fields only", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with all fields", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "+1-555-0100",
      side: "partner1",
      groupName: "Doe Family",
      dietaryTags: ["vegan", "gluten_free"],
      dietaryNotes: "Please avoid cross-contamination",
      rsvpStatus: "accepted",
      primaryGuestId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("defaults side to 'mutual'", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.side).toBe("mutual");
    }
  });

  it("defaults rsvpStatus to 'pending'", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rsvpStatus).toBe("pending");
    }
  });

  it("defaults dietaryTags to empty array", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dietaryTags).toEqual([]);
    }
  });

  it("trims whitespace from firstName", () => {
    const result = createGuestSchema.safeParse({
      firstName: "  Jane  ",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Jane");
    }
  });

  it("trims whitespace from lastName", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "  Doe  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastName).toBe("Doe");
    }
  });

  it("rejects empty firstName", () => {
    const result = createGuestSchema.safeParse({
      firstName: "",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects firstName exceeding 100 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "a".repeat(101),
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("accepts firstName at exactly 100 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "a".repeat(100),
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty lastName", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects lastName exceeding 100 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts lastName at exactly 100 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "a".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null email", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: null,
    });
    expect(result.success).toBe(true);
  });

  it("normalizes blank optional email to null", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it("trims optional email", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "  jane@example.com  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("jane@example.com");
    }
  });

  it("normalizes blank optional text fields to null", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      phone: "   ",
      groupName: "   ",
      dietaryNotes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeNull();
      expect(result.data.groupName).toBeNull();
      expect(result.data.dietaryNotes).toBeNull();
    }
  });

  it("trims optional text fields", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      phone: "  +1-555-0100  ",
      groupName: "  Doe Family  ",
      dietaryNotes: "  No nuts  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+1-555-0100");
      expect(result.data.groupName).toBe("Doe Family");
      expect(result.data.dietaryNotes).toBe("No nuts");
    }
  });

  it("rejects phone exceeding 50 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      phone: "1".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("accepts phone at exactly 50 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      phone: "1".repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid side value", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      side: "both",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid side values", () => {
    for (const side of ["partner1", "partner2", "mutual"] as const) {
      const result = createGuestSchema.safeParse({
        firstName: "Jane",
        lastName: "Doe",
        side,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid rsvpStatus value", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      rsvpStatus: "maybe",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid rsvpStatus values", () => {
    for (const rsvpStatus of [
      "pending",
      "invited",
      "accepted",
      "declined",
    ] as const) {
      const result = createGuestSchema.safeParse({
        firstName: "Jane",
        lastName: "Doe",
        rsvpStatus,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid dietaryTag value", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryTags: ["pizza_only"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid dietary tag values", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryTags: [
        "vegetarian",
        "vegan",
        "gluten_free",
        "halal",
        "kosher",
        "nut_allergy",
        "dairy_free",
        "other",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 8 dietary tags", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryTags: [
        "vegetarian",
        "vegan",
        "gluten_free",
        "halal",
        "kosher",
        "nut_allergy",
        "dairy_free",
        "other",
        "vegetarian",
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects dietaryNotes exceeding 500 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryNotes: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts dietaryNotes at exactly 500 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryNotes: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("rejects groupName exceeding 100 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      groupName: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts groupName at exactly 100 characters", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      groupName: "a".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid primaryGuestId (non-UUID)", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      primaryGuestId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null primaryGuestId", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      primaryGuestId: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid UUID for primaryGuestId", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      primaryGuestId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateGuestSchema", () => {
  it("accepts empty object", () => {
    const result = updateGuestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with firstName only", () => {
    const result = updateGuestSchema.safeParse({ firstName: "John" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with rsvpStatus only", () => {
    const result = updateGuestSchema.safeParse({ rsvpStatus: "accepted" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with dietaryTags only", () => {
    const result = updateGuestSchema.safeParse({
      dietaryTags: ["vegetarian"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid rsvpStatus in partial update", () => {
    const result = updateGuestSchema.safeParse({ rsvpStatus: "unknown" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email in partial update", () => {
    const result = updateGuestSchema.safeParse({ email: "bad-email" });
    expect(result.success).toBe(false);
  });

  it("normalizes blank optional email to null", () => {
    const result = updateGuestSchema.safeParse({ email: "   " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it("rejects invalid side in partial update", () => {
    const result = updateGuestSchema.safeParse({ side: "none" });
    expect(result.success).toBe(false);
  });

  it("normalizes blank optional text fields to null", () => {
    const result = updateGuestSchema.safeParse({
      phone: "   ",
      groupName: "   ",
      dietaryNotes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeNull();
      expect(result.data.groupName).toBeNull();
      expect(result.data.dietaryNotes).toBeNull();
    }
  });
});

describe("bulkUpdateRsvpSchema", () => {
  it("accepts valid array of id + rsvpStatus objects", () => {
    const result = bulkUpdateRsvpSchema.safeParse([
      { id: "550e8400-e29b-41d4-a716-446655440000", rsvpStatus: "accepted" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts multiple items", () => {
    const result = bulkUpdateRsvpSchema.safeParse([
      { id: "550e8400-e29b-41d4-a716-446655440000", rsvpStatus: "accepted" },
      { id: "550e8400-e29b-41d4-a716-446655440001", rsvpStatus: "declined" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects empty array", () => {
    const result = bulkUpdateRsvpSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects invalid rsvpStatus", () => {
    const result = bulkUpdateRsvpSchema.safeParse([
      { id: "550e8400-e29b-41d4-a716-446655440000", rsvpStatus: "maybe" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID id", () => {
    const result = bulkUpdateRsvpSchema.safeParse([
      { id: "not-a-uuid", rsvpStatus: "accepted" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects item missing id", () => {
    const result = bulkUpdateRsvpSchema.safeParse([{ rsvpStatus: "accepted" }]);
    expect(result.success).toBe(false);
  });

  it("rejects item missing rsvpStatus", () => {
    const result = bulkUpdateRsvpSchema.safeParse([
      { id: "550e8400-e29b-41d4-a716-446655440000" },
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts all valid rsvpStatus values in bulk", () => {
    const result = bulkUpdateRsvpSchema.safeParse([
      { id: "550e8400-e29b-41d4-a716-446655440000", rsvpStatus: "pending" },
      { id: "550e8400-e29b-41d4-a716-446655440001", rsvpStatus: "invited" },
      { id: "550e8400-e29b-41d4-a716-446655440002", rsvpStatus: "accepted" },
      { id: "550e8400-e29b-41d4-a716-446655440003", rsvpStatus: "declined" },
    ]);
    expect(result.success).toBe(true);
  });
});

describe("csvRowSchema", () => {
  it("accepts valid row with required fields only", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid row with all fields", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      phone: "+1-555-0100",
      side: "partner2",
      group_name: "Doe Family",
      dietary_tags: "vegan,gluten_free",
      dietary_notes: "Please avoid cross-contamination",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty first_name", () => {
    const result = csvRowSchema.safeParse({
      first_name: "",
      last_name: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects first_name exceeding 100 characters", () => {
    const result = csvRowSchema.safeParse({
      first_name: "a".repeat(101),
      last_name: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty last_name", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects last_name exceeding 100 characters", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      email: "bad-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid email", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("normalizes blank optional email cell to undefined", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      email: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeUndefined();
    }
  });

  it("trims optional email cells", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      email: "  jane@example.com  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("jane@example.com");
    }
  });

  it("rejects invalid side", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      side: "both",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid side values", () => {
    for (const side of ["partner1", "partner2", "mutual"] as const) {
      const result = csvRowSchema.safeParse({
        first_name: "Jane",
        last_name: "Doe",
        side,
      });
      expect(result.success).toBe(true);
    }
  });

  it("dietary_tags is a raw string (not parsed)", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      dietary_tags: "vegan,gluten_free,halal",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dietary_tags).toBe("vegan,gluten_free,halal");
    }
  });

  it("normalizes blank optional text cells to undefined", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      phone: "   ",
      group_name: "   ",
      dietary_notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeUndefined();
      expect(result.data.group_name).toBeUndefined();
      expect(result.data.dietary_notes).toBeUndefined();
    }
  });

  it("trims optional text cells", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      phone: "  +1-555-0100  ",
      group_name: "  Doe Family  ",
      dietary_notes: "  No nuts  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+1-555-0100");
      expect(result.data.group_name).toBe("Doe Family");
      expect(result.data.dietary_notes).toBe("No nuts");
    }
  });

  it("rejects phone exceeding 50 characters", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      phone: "1".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects dietary_notes exceeding 500 characters", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      dietary_notes: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from first_name", () => {
    const result = csvRowSchema.safeParse({
      first_name: "  Jane  ",
      last_name: "Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.first_name).toBe("Jane");
    }
  });

  it("trims whitespace from last_name", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "  Doe  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.last_name).toBe("Doe");
    }
  });

  it("rejects group_name exceeding 100 characters", () => {
    const result = csvRowSchema.safeParse({
      first_name: "Jane",
      last_name: "Doe",
      group_name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe("dietaryTags uniqueness", () => {
  it("rejects duplicate dietary tags in createGuestSchema", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryTags: ["vegan", "vegan"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("unique"))).toBe(true);
    }
  });

  it("accepts non-duplicate dietary tags in createGuestSchema", () => {
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      dietaryTags: ["vegan", "gluten_free"],
    });
    expect(result.success).toBe(true);
  });
});

describe("email max length — RFC 5321 (254 chars)", () => {
  it("rejects email over 254 characters in createGuestSchema", () => {
    const longLocal = "a".repeat(245);
    const email = `${longLocal}@example.com`; // 258 chars
    expect(email.length).toBeGreaterThan(254);
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email,
    });
    expect(result.success).toBe(false);
  });

  it("accepts email exactly 254 characters in createGuestSchema", () => {
    const domain = "example.com"; // 11 chars
    const atSign = 1;
    const localLen = 254 - domain.length - atSign; // 242
    const email = `${"a".repeat(localLen)}@${domain}`;
    expect(email.length).toBe(254);
    const result = createGuestSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email,
    });
    expect(result.success).toBe(true);
  });
});
