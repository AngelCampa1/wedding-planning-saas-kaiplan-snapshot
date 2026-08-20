import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { emailPreference } from "../../src/db/marketing-schema";

describe("marketing email preference schema", () => {
  it("enforces one global preference row per email and preference type", () => {
    const config = getTableConfig(emailPreference);
    const index = config.indexes.find(
      (idx) => idx.config.name === "email_preference_global_unique",
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
  });

  it("enforces one wedding-scoped preference row per email, wedding, and preference type", () => {
    const config = getTableConfig(emailPreference);
    const index = config.indexes.find(
      (idx) => idx.config.name === "email_preference_wedding_unique",
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
  });
});
