import { describe, expect, it, vi } from "vitest";
import { createMarketingDb } from "../../src/db/marketing-client";

const drizzle = vi.hoisted(() => vi.fn(() => ({ kind: "db" })));

vi.mock("drizzle-orm/d1", () => ({
  drizzle,
}));

describe("createMarketingDb", () => {
  it("creates a Drizzle D1 client with the marketing schema", () => {
    const d1 = {} as D1Database;

    expect(createMarketingDb(d1)).toEqual({ kind: "db" });
    expect(drizzle).toHaveBeenCalledWith(
      d1,
      expect.objectContaining({
        schema: expect.any(Object),
      }),
    );
  });
});
