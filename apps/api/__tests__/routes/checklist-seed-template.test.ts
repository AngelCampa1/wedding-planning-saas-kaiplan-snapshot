import { describe, it, expect } from "vitest";
import { SEED_TASKS } from "../../src/routes/checklist-seed-template";
import { MILESTONE_BUCKETS, BUCKET_LABELS } from "@kaiplan/shared";

describe("SEED_TASKS", () => {
  it("contains at least 60 tasks", () => {
    expect(SEED_TASKS.length).toBeGreaterThanOrEqual(60);
  });

  it("all tasks have non-empty string titles", () => {
    for (const task of SEED_TASKS) {
      expect(typeof task.title).toBe("string");
      expect(task.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("all tasks have valid bucket values", () => {
    const validBuckets = new Set(MILESTONE_BUCKETS);
    for (const task of SEED_TASKS) {
      expect(validBuckets.has(task.bucket)).toBe(true);
    }
  });

  it("every bucket has at least 1 task", () => {
    const bucketSet = new Set(SEED_TASKS.map((t) => t.bucket));
    for (const bucket of MILESTONE_BUCKETS) {
      expect(bucketSet.has(bucket)).toBe(true);
    }
  });

  it("tasks with dueOffsetDays have integer values or null", () => {
    for (const task of SEED_TASKS) {
      if (task.dueOffsetDays !== null) {
        expect(Number.isInteger(task.dueOffsetDays)).toBe(true);
      }
    }
  });

  it("has tasks in the 12mo_plus bucket", () => {
    const bucket12plus = SEED_TASKS.filter((t) => t.bucket === "12mo_plus");
    expect(bucket12plus.length).toBeGreaterThanOrEqual(1);
  });

  it("has tasks in the day_of bucket", () => {
    const dayOf = SEED_TASKS.filter((t) => t.bucket === "day_of");
    expect(dayOf.length).toBeGreaterThanOrEqual(1);
  });
});

describe("BUCKET_LABELS", () => {
  it("has a label for every bucket in MILESTONE_BUCKETS", () => {
    for (const bucket of MILESTONE_BUCKETS) {
      expect(BUCKET_LABELS[bucket]).toBeDefined();
      expect(typeof BUCKET_LABELS[bucket]).toBe("string");
      expect(BUCKET_LABELS[bucket].trim().length).toBeGreaterThan(0);
    }
  });

  it("has correct human-readable labels", () => {
    expect(BUCKET_LABELS["12mo_plus"]).toBe("12+ Months Out");
    expect(BUCKET_LABELS["9_to_12mo"]).toBe("9–12 Months Out");
    expect(BUCKET_LABELS["6_to_9mo"]).toBe("6–9 Months Out");
    expect(BUCKET_LABELS["3_to_6mo"]).toBe("3–6 Months Out");
    expect(BUCKET_LABELS["1_to_3mo"]).toBe("1–3 Months Out");
    expect(BUCKET_LABELS["under_1mo"]).toBe("Under 1 Month Out");
    expect(BUCKET_LABELS["week_of"]).toBe("Week Of");
    expect(BUCKET_LABELS["day_of"]).toBe("Day Of");
  });

  it("covers exactly 8 buckets", () => {
    expect(Object.keys(BUCKET_LABELS)).toHaveLength(8);
  });
});
