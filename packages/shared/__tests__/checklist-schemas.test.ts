import { describe, it, expect } from "vitest";
import {
  MILESTONE_BUCKETS,
  BUCKET_LABELS,
  checklistTaskSchema,
  createChecklistTaskSchema,
  updateChecklistTaskSchema,
  checklistResponseSchema,
  type MilestoneBucket,
  type ChecklistTask,
  type CreateChecklistTaskInput,
  type UpdateChecklistTaskInput,
  type ChecklistResponse,
} from "../src/checklist-schemas";

const VALID_TASK = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  weddingId: "550e8400-e29b-41d4-a716-446655440001",
  bucket: "3_to_6mo" as MilestoneBucket,
  title: "Book venue",
  notes: null,
  dueOffsetDays: null,
  completedAt: null,
  sortOrder: 0,
  createdBy: "user-1",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("MILESTONE_BUCKETS", () => {
  it("contains all 8 expected bucket values", () => {
    expect(MILESTONE_BUCKETS).toHaveLength(8);
    expect(MILESTONE_BUCKETS).toContain("12mo_plus");
    expect(MILESTONE_BUCKETS).toContain("9_to_12mo");
    expect(MILESTONE_BUCKETS).toContain("6_to_9mo");
    expect(MILESTONE_BUCKETS).toContain("3_to_6mo");
    expect(MILESTONE_BUCKETS).toContain("1_to_3mo");
    expect(MILESTONE_BUCKETS).toContain("under_1mo");
    expect(MILESTONE_BUCKETS).toContain("week_of");
    expect(MILESTONE_BUCKETS).toContain("day_of");
  });
});

describe("BUCKET_LABELS", () => {
  it("exists and covers all 8 buckets", () => {
    expect(BUCKET_LABELS).toBeDefined();
    expect(Object.keys(BUCKET_LABELS)).toHaveLength(8);
    for (const bucket of MILESTONE_BUCKETS) {
      expect(BUCKET_LABELS[bucket]).toBeDefined();
      expect(typeof BUCKET_LABELS[bucket]).toBe("string");
      expect(BUCKET_LABELS[bucket].length).toBeGreaterThan(0);
    }
  });

  it("has correct label for each bucket", () => {
    expect(BUCKET_LABELS["12mo_plus"]).toBe("12+ Months Out");
    expect(BUCKET_LABELS["9_to_12mo"]).toBe("9–12 Months Out");
    expect(BUCKET_LABELS["6_to_9mo"]).toBe("6–9 Months Out");
    expect(BUCKET_LABELS["3_to_6mo"]).toBe("3–6 Months Out");
    expect(BUCKET_LABELS["1_to_3mo"]).toBe("1–3 Months Out");
    expect(BUCKET_LABELS["under_1mo"]).toBe("Under 1 Month Out");
    expect(BUCKET_LABELS["week_of"]).toBe("Week Of");
    expect(BUCKET_LABELS["day_of"]).toBe("Day Of");
  });
});

describe("checklistTaskSchema", () => {
  it("parses a valid task with all fields", () => {
    const result = checklistTaskSchema.safeParse(VALID_TASK);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(VALID_TASK.id);
      expect(result.data.bucket).toBe("3_to_6mo");
    }
  });

  it("parses a task with optional notes and dueOffsetDays", () => {
    const result = checklistTaskSchema.safeParse({
      ...VALID_TASK,
      notes: "Some notes",
      dueOffsetDays: -90,
      completedAt: "2024-06-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("Some notes");
      expect(result.data.dueOffsetDays).toBe(-90);
    }
  });

  it("rejects invalid bucket value", () => {
    const result = checklistTaskSchema.safeParse({
      ...VALID_TASK,
      bucket: "invalid_bucket",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { id: _, ...withoutId } = VALID_TASK;
    const result = checklistTaskSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });

  it("allows all bucket enum values", () => {
    for (const bucket of MILESTONE_BUCKETS) {
      const result = checklistTaskSchema.safeParse({ ...VALID_TASK, bucket });
      expect(result.success).toBe(true);
    }
  });
});

describe("createChecklistTaskSchema", () => {
  it("parses minimal valid create input", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "Book photographer",
      bucket: "6_to_9mo",
    });
    expect(result.success).toBe(true);
  });

  it("parses full create input with optional fields", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "Book photographer",
      bucket: "6_to_9mo",
      notes: "Get referrals first",
      dueOffsetDays: -270,
      sortOrder: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("Get referrals first");
      expect(result.data.dueOffsetDays).toBe(-270);
      expect(result.data.sortOrder).toBe(5);
    }
  });

  it("rejects empty title", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "",
      bucket: "6_to_9mo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only title", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "   ",
      bucket: "6_to_9mo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 500 characters", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "a".repeat(501),
      bucket: "6_to_9mo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes exceeding 1000 characters", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "Book photographer",
      bucket: "6_to_9mo",
      notes: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("normalizes blank notes to null", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "Book photographer",
      bucket: "6_to_9mo",
      notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  it("trims notes", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "Book photographer",
      bucket: "6_to_9mo",
      notes: "  Get referrals first  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("Get referrals first");
    }
  });

  it("rejects missing bucket", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "Some task",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid bucket", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "Some task",
      bucket: "not_a_bucket",
    });
    expect(result.success).toBe(false);
  });

  it("accepts title of exactly 500 characters", () => {
    const result = createChecklistTaskSchema.safeParse({
      title: "a".repeat(500),
      bucket: "day_of",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateChecklistTaskSchema", () => {
  it("rejects an empty update object", () => {
    const result = updateChecklistTaskSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("At least one field"))).toBe(true);
    }
  });

  it("accepts a partial update with a single field", () => {
    const result = updateChecklistTaskSchema.safeParse({ title: "New title" });
    expect(result.success).toBe(true);
  });

  it("parses a partial update with only title (named variant)", () => {
    const result = updateChecklistTaskSchema.safeParse({
      title: "Updated title",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Updated title");
    }
  });

  it("parses setting completedAt to null (uncheck)", () => {
    const result = updateChecklistTaskSchema.safeParse({
      completedAt: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completedAt).toBeNull();
    }
  });

  it("parses setting completedAt to a datetime string (check)", () => {
    const result = updateChecklistTaskSchema.safeParse({
      completedAt: "2024-06-15T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completedAt).toBe("2024-06-15T10:00:00.000Z");
    }
  });

  it("parses updating notes to null", () => {
    const result = updateChecklistTaskSchema.safeParse({
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty string title when provided", () => {
    const result = updateChecklistTaskSchema.safeParse({
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only title when provided", () => {
    const result = updateChecklistTaskSchema.safeParse({
      title: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes exceeding 1000 characters when provided", () => {
    const result = updateChecklistTaskSchema.safeParse({
      notes: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("normalizes blank notes to null", () => {
    const result = updateChecklistTaskSchema.safeParse({
      notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  it("rejects invalid bucket when provided", () => {
    const result = updateChecklistTaskSchema.safeParse({
      bucket: "bad_bucket",
    });
    expect(result.success).toBe(false);
  });
});

describe("checklistResponseSchema", () => {
  it("parses a valid checklist response", () => {
    const result = checklistResponseSchema.safeParse({
      tasks: [VALID_TASK],
      totalCount: 1,
      completedCount: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tasks).toHaveLength(1);
      expect(result.data.totalCount).toBe(1);
      expect(result.data.completedCount).toBe(0);
    }
  });

  it("parses an empty response", () => {
    const result = checklistResponseSchema.safeParse({
      tasks: [],
      totalCount: 0,
      completedCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing totalCount", () => {
    const result = checklistResponseSchema.safeParse({
      tasks: [],
      completedCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing completedCount", () => {
    const result = checklistResponseSchema.safeParse({
      tasks: [],
      totalCount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("TypeScript type inference", () => {
  it("MilestoneBucket type is assignable from valid bucket strings", () => {
    const bucket: MilestoneBucket = "week_of";
    expect(MILESTONE_BUCKETS).toContain(bucket);
  });

  it("ChecklistTask type matches schema shape", () => {
    const task: ChecklistTask = {
      ...VALID_TASK,
      notes: null,
      dueOffsetDays: null,
      completedAt: null,
    };
    expect(task.id).toBe(VALID_TASK.id);
  });

  it("CreateChecklistTaskInput type matches schema shape", () => {
    const input: CreateChecklistTaskInput = {
      title: "Book caterer",
      bucket: "3_to_6mo",
    };
    expect(input.title).toBe("Book caterer");
  });

  it("UpdateChecklistTaskInput type is all optional", () => {
    const update: UpdateChecklistTaskInput = {};
    expect(update).toBeDefined();
  });

  it("ChecklistResponse type matches schema shape", () => {
    const response: ChecklistResponse = {
      tasks: [],
      totalCount: 0,
      completedCount: 0,
    };
    expect(response.totalCount).toBe(0);
  });
});
