import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { guest } from "../../src/db/guest-schema";

describe("guest schema", () => {
  it("removes the old single composite unique constraint", () => {
    const config = getTableConfig(guest);
    // Old constraint was named "guest_wedding_name_primary" — must be gone.
    const oldConstraint = config.uniqueConstraints.find(
      (u) => u.name === "guest_wedding_name_primary",
    );
    expect(oldConstraint).toBeUndefined();
  });

  it("defines two partial unique indexes (primary and plus-one)", () => {
    const config = getTableConfig(guest);
    const primaryIdx = config.indexes.find(
      (i) => i.config.name === "guest_primary_name_unique",
    );
    const plusOneIdx = config.indexes.find(
      (i) => i.config.name === "guest_plusone_name_unique",
    );

    expect(primaryIdx).toBeDefined();
    expect(plusOneIdx).toBeDefined();
  });

  it("primary index is unique and has a WHERE clause", () => {
    const config = getTableConfig(guest);
    const primaryIdx = config.indexes.find(
      (i) => i.config.name === "guest_primary_name_unique",
    );

    expect(primaryIdx?.config.unique).toBe(true);
    // The WHERE clause should reference IS NULL condition
    expect(primaryIdx?.config.where).toBeDefined();
  });

  it("plus-one index is unique and has a WHERE clause", () => {
    const config = getTableConfig(guest);
    const plusOneIdx = config.indexes.find(
      (i) => i.config.name === "guest_plusone_name_unique",
    );

    expect(plusOneIdx?.config.unique).toBe(true);
    // The WHERE clause should reference IS NOT NULL condition
    expect(plusOneIdx?.config.where).toBeDefined();
  });

  it("primary index covers weddingId, firstName, lastName columns", () => {
    const config = getTableConfig(guest);
    const primaryIdx = config.indexes.find(
      (i) => i.config.name === "guest_primary_name_unique",
    );

    const colNames = primaryIdx?.config.columns.map((c) => {
      // Drizzle index column can be a column reference or expression
      if (typeof c === "object" && c !== null && "name" in c) {
        return (c as { name: string }).name;
      }
      return null;
    });

    expect(colNames).toContain("wedding_id");
    expect(colNames).toContain("first_name");
    expect(colNames).toContain("last_name");
  });

  it("plus-one index covers weddingId, firstName, lastName, primaryGuestId", () => {
    const config = getTableConfig(guest);
    const plusOneIdx = config.indexes.find(
      (i) => i.config.name === "guest_plusone_name_unique",
    );

    const colNames = plusOneIdx?.config.columns.map((c) => {
      if (typeof c === "object" && c !== null && "name" in c) {
        return (c as { name: string }).name;
      }
      return null;
    });

    expect(colNames).toContain("wedding_id");
    expect(colNames).toContain("first_name");
    expect(colNames).toContain("last_name");
    expect(colNames).toContain("primary_guest_id");
  });

  it("has cascade FK from weddingId to wedding.id", () => {
    const config = getTableConfig(guest);
    // weddingId FK: foreign columns resolve to "id" and the local col is "wedding_id"
    const weddingFk = config.foreignKeys.find((fk) => {
      const localCols = fk.reference().columns.map((c) => c.name);
      return localCols.includes("wedding_id");
    });

    expect(weddingFk).toBeDefined();
    expect(weddingFk?.onDelete).toBe("cascade");
  });

  it("has cascade FK from primaryGuestId to guest.id (self-reference)", () => {
    const config = getTableConfig(guest);
    const selfFk = config.foreignKeys.find((fk) => {
      const localCols = fk.reference().columns.map((c) => c.name);
      return localCols.includes("primary_guest_id");
    });

    expect(selfFk).toBeDefined();
    expect(selfFk?.onDelete).toBe("cascade");
  });
});

describe("billing-schema FK cascade", () => {
  it("subscription.userId has cascade FK to user.id", async () => {
    const { subscription } = await import("../../src/db/billing-schema");
    const config = getTableConfig(subscription);
    // The userId PK column also has a references() FK to user.id
    expect(config.foreignKeys.length).toBeGreaterThanOrEqual(1);
    const userFk = config.foreignKeys[0];
    expect(userFk?.onDelete).toBe("cascade");
    const ref = userFk?.reference();
    expect(ref?.foreignColumns[0]?.name).toBe("id");
  });

  it("M11: processedWebhookEvent has processedAt index for cleanup queries", async () => {
    const { processedWebhookEvent } =
      await import("../../src/db/billing-schema");
    const config = getTableConfig(processedWebhookEvent);
    const idx = config.indexes.find(
      (i) => i.config.name === "processed_webhook_event_processed_at_idx",
    );
    expect(idx).toBeDefined();
  });

  it("subscription.stripeCustomerId is unique when present", async () => {
    const { subscription } = await import("../../src/db/billing-schema");
    const config = getTableConfig(subscription);
    const idx = config.indexes.find(
      (i) => i.config.name === "subscription_stripe_customer_id_unique",
    );

    expect(idx?.config.unique).toBe(true);
    expect(idx?.config.where).toBeDefined();
  });
});

describe("wedding schema FK set null", () => {
  it("wedding.createdBy has set-null FK to user.id", async () => {
    const { wedding } = await import("../../src/db/schema");
    const config = getTableConfig(wedding);
    const createdByFk = config.foreignKeys.find((fk) => {
      const localCols = fk.reference().columns.map((c) => c.name);
      return localCols.includes("created_by");
    });

    expect(createdByFk).toBeDefined();
    expect(createdByFk?.onDelete).toBe("set null");
    const ref = createdByFk?.reference();
    expect(ref?.foreignColumns[0]?.name).toBe("id");
  });
});
