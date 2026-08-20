import { describe, expect, it } from "vitest";
import {
  buildUnsubscribeBackfillSql,
  extractWranglerJsonPayload,
  parseD1Results,
} from "./backfill-marketing-unsubscribes";

describe("extractWranglerJsonPayload", () => {
  it("returns clean JSON arrays unchanged", () => {
    const raw = '[{"results":[{"name":"unsubscribed_at"}]}]';
    expect(extractWranglerJsonPayload(raw)).toBe(raw);
  });

  it("strips leading wrangler progress noise before the JSON array", () => {
    const raw =
      '├ Checking if file needs uploading\n[{"results":[{"name":"unsubscribed_at"}]}]';
    expect(JSON.parse(extractWranglerJsonPayload(raw)) as unknown).toEqual([
      { results: [{ name: "unsubscribed_at" }] },
    ]);
  });

  it("strips trailing wrangler summary text after the JSON array", () => {
    const raw = '[{"results":[{"count":1}]}]\n🚣 Executed 1 command in 0.50ms';
    expect(JSON.parse(extractWranglerJsonPayload(raw)) as unknown).toEqual([
      { results: [{ count: 1 }] },
    ]);
  });

  it("handles a bare JSON object payload", () => {
    const raw = 'noise {"results":[{"exists":1}]} trailing';
    expect(JSON.parse(extractWranglerJsonPayload(raw)) as unknown).toEqual({
      results: [{ exists: 1 }],
    });
  });

  it("returns the original string when no JSON bracket is present", () => {
    expect(extractWranglerJsonPayload("no json here")).toBe("no json here");
  });
});

describe("parseD1Results", () => {
  it("reads rows from wrangler's array-shaped --command output", () => {
    const raw =
      '[{"results":[{"name":"unsubscribed_at"},{"name":"email"}],"success":true,"meta":{}}]';
    expect(parseD1Results<{ name: string }>(raw)).toEqual([
      { name: "unsubscribed_at" },
      { name: "email" },
    ]);
  });

  it("reads rows from a single object envelope", () => {
    const raw = '{"results":[{"count":2}]}';
    expect(parseD1Results<{ count: number }>(raw)).toEqual([{ count: 2 }]);
  });

  it("reads rows from a nested result envelope", () => {
    const raw = '{"result":[{"results":[{"marker_exists":1}]}]}';
    expect(parseD1Results<{ marker_exists: number }>(raw)).toEqual([
      { marker_exists: 1 },
    ]);
  });

  it("tolerates wrangler progress noise around the array payload", () => {
    const raw =
      '├ Checking if file needs uploading\n[{"results":[{"name":"unsubscribed_at"}]}]\n🚣 done';
    expect(parseD1Results<{ name: string }>(raw)).toEqual([
      { name: "unsubscribed_at" },
    ]);
  });

  it("returns an empty array when no rows are present", () => {
    expect(parseD1Results('[{"results":[]}]')).toEqual([]);
  });
});

describe("buildUnsubscribeBackfillSql", () => {
  it("builds a backfill transaction when both legacy and current columns exist", () => {
    const sql = buildUnsubscribeBackfillSql([
      "unsubscribed_at",
      "nurture_unsubscribed_at",
    ]);
    expect(sql).toContain("UPDATE signups");
    expect(sql).toContain(
      "SET unsubscribed_at = COALESCE(unsubscribed_at, nurture_unsubscribed_at)",
    );
    expect(sql).toContain(
      "ALTER TABLE signups DROP COLUMN nurture_unsubscribed_at;",
    );
  });

  it("returns null when the legacy column is gone and the backfill already completed", () => {
    expect(buildUnsubscribeBackfillSql(["unsubscribed_at"], true)).toBeNull();
  });

  it("throws when the legacy column is gone but no completion marker exists", () => {
    expect(() =>
      buildUnsubscribeBackfillSql(["unsubscribed_at"], false),
    ).toThrow(/nurture_unsubscribed_at is missing/);
  });

  it("throws when the current unsubscribed_at column is missing", () => {
    expect(() => buildUnsubscribeBackfillSql([])).toThrow(
      /requires signups\.unsubscribed_at/,
    );
  });
});
