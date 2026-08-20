import { describe, expect, it, vi } from "vitest";
import {
  removeGuestFromSeatingChart,
  removeGuestsFromSeatingChart,
} from "../../src/lib/seating-cleanup";
import type { Database } from "../../src/db/client";

function makeSelectBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockResolvedValue(rows);
  return builder;
}

function makeInsertBuilder() {
  const builder: Record<string, unknown> = {};
  builder.values = vi.fn().mockReturnValue(builder);
  builder.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  return builder;
}

function makeDb(rows: unknown[]) {
  const insertBuilder = makeInsertBuilder();
  const db = {
    select: vi.fn().mockReturnValue(makeSelectBuilder(rows)),
    insert: vi.fn().mockReturnValue(insertBuilder),
    execute: vi.fn().mockResolvedValue(undefined),
    insertBuilder,
  };
  return db;
}

const chart = {
  width: 1200,
  height: 800,
  tables: [
    {
      id: "b0000000-0000-4000-8000-000000000001",
      name: "Table 1",
      shape: "round" as const,
      capacity: 2,
      x: 0,
      y: 0,
      seats: [
        {
          id: "a0000000-0000-4000-8000-000000000001",
          positionIndex: 0,
          guestId: "00000000-0000-4000-8000-000000000001",
        },
        {
          id: "a0000000-0000-4000-8000-000000000002",
          positionIndex: 1,
          guestId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    },
  ],
};

describe("seating cleanup", () => {
  it("returns without reading when no guest ids are provided", async () => {
    const db = makeDb([]);

    await removeGuestsFromSeatingChart(
      db as unknown as Pick<Database, "select" | "insert" | "execute">,
      "wedding-1",
      [],
    );

    expect(db.execute).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns when no seating chart exists", async () => {
    const db = makeDb([]);

    await removeGuestsFromSeatingChart(
      db as unknown as Pick<Database, "select" | "insert" | "execute">,
      "wedding-1",
      ["00000000-0000-4000-8000-000000000001"],
    );

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.select).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns when the chart is invalid", async () => {
    const db = makeDb([{ chart: { invalid: true } }]);

    await removeGuestsFromSeatingChart(
      db as unknown as Pick<Database, "select" | "insert" | "execute">,
      "wedding-1",
      ["00000000-0000-4000-8000-000000000001"],
    );

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns when no assigned seats match the guest ids", async () => {
    const db = makeDb([{ chart }]);

    await removeGuestsFromSeatingChart(
      db as unknown as Pick<Database, "select" | "insert" | "execute">,
      "wedding-1",
      ["00000000-0000-4000-8000-000000000003"],
    );

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("upserts a chart with matching guest assignments removed", async () => {
    const db = makeDb([{ chart }]);

    await removeGuestFromSeatingChart(
      db as unknown as Pick<Database, "select" | "insert" | "execute">,
      "wedding-1",
      "00000000-0000-4000-8000-000000000001",
    );

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.insert).toHaveBeenCalledOnce();
    expect(db.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        weddingId: "wedding-1",
        chart: expect.objectContaining({
          tables: expect.arrayContaining([
            expect.objectContaining({
              seats: expect.not.arrayContaining([
                expect.objectContaining({
                  guestId: "00000000-0000-4000-8000-000000000001",
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });
});
