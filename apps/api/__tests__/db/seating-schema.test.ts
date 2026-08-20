import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { seatingChart } from "../../src/db/seating-schema";

describe("seatingChart schema", () => {
  it("exposes a cascade foreign key to wedding", () => {
    const config = getTableConfig(seatingChart);
    const foreignKey = config.foreignKeys[0];
    const reference = foreignKey?.reference();

    expect(config.name).toBe("seating_chart");
    expect(config.foreignKeys).toHaveLength(1);
    expect(foreignKey?.onDelete).toBe("cascade");
    expect(reference?.foreignTable).toBeDefined();
    expect(reference?.foreignColumns[0]?.name).toBe("id");
  });
});
