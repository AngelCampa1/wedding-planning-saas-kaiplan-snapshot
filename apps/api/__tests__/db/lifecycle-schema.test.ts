import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { user } from "../../src/db/auth-schema";
import { userLifecycleEmail } from "../../src/db/lifecycle-schema";

describe("userLifecycleEmail schema", () => {
  it("defines the lifecycle tracking table and unique user-step index", () => {
    const config = getTableConfig(userLifecycleEmail);

    expect(config.name).toBe("user_lifecycle_email");
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "step_key",
        "status",
        "sent_at",
        "attempts",
        "last_error",
        "created_at",
        "updated_at",
      ]),
    );
    expect(
      config.indexes.some(
        (index) =>
          index.config.name === "user_lifecycle_email_user_step_unique" &&
          index.config.unique,
      ),
    ).toBe(true);
    expect(config.foreignKeys[0]?.reference().foreignTable).toBe(user);
  });
});
