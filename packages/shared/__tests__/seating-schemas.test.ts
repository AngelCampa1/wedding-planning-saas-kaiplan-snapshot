import { describe, it, expect } from "vitest";
import type { SaveSeatingInput } from "../src";
import {
  saveSeatingSchema,
  seatingChartSchema,
  seatingTableSchema,
} from "../src/seating-schemas";
import {
  SEATING_MAX_CAPACITY,
  SEATING_MAX_TABLES,
  SEATING_MIN_CAPACITY,
  SEATING_TABLE_FOOTPRINT,
  SEATING_WORKSPACE_HEIGHT,
  SEATING_WORKSPACE_WIDTH,
} from "../src/constants";

const roundTable: SaveSeatingInput["tables"][number] = {
  id: "550e8400-e29b-41d4-a716-446655440100",
  name: "Table 1",
  shape: "round",
  capacity: 8,
  x: 120,
  y: 200,
  seats: [
    { id: "550e8400-e29b-41d4-a716-446655440101", positionIndex: 0 },
    { id: "550e8400-e29b-41d4-a716-446655440102", positionIndex: 1 },
    { id: "550e8400-e29b-41d4-a716-446655440103", positionIndex: 2 },
    { id: "550e8400-e29b-41d4-a716-446655440104", positionIndex: 3 },
    { id: "550e8400-e29b-41d4-a716-446655440105", positionIndex: 4 },
    { id: "550e8400-e29b-41d4-a716-446655440106", positionIndex: 5 },
    { id: "550e8400-e29b-41d4-a716-446655440107", positionIndex: 6 },
    { id: "550e8400-e29b-41d4-a716-446655440108", positionIndex: 7 },
  ],
};

const rectangleTable: SaveSeatingInput["tables"][number] = {
  id: "550e8400-e29b-41d4-a716-446655440200",
  name: "Head Table",
  shape: "rectangle",
  capacity: 6,
  orientation: "horizontal",
  x: 320,
  y: 180,
  seats: [
    { id: "550e8400-e29b-41d4-a716-446655440201", positionIndex: 0 },
    {
      id: "550e8400-e29b-41d4-a716-446655440202",
      positionIndex: 1,
      guestId: "550e8400-e29b-41d4-a716-446655440301",
    },
    { id: "550e8400-e29b-41d4-a716-446655440203", positionIndex: 2 },
    { id: "550e8400-e29b-41d4-a716-446655440204", positionIndex: 3 },
    { id: "550e8400-e29b-41d4-a716-446655440205", positionIndex: 4 },
    { id: "550e8400-e29b-41d4-a716-446655440206", positionIndex: 5 },
  ],
};

describe("seating schemas", () => {
  it("uses the approved seating defaults", () => {
    expect(SEATING_MAX_TABLES).toBe(40);
    expect(SEATING_MIN_CAPACITY).toBe(2);
    expect(SEATING_MAX_CAPACITY).toBe(20);
    expect(SEATING_WORKSPACE_WIDTH).toBe(1200);
    expect(SEATING_WORKSPACE_HEIGHT).toBe(800);
  });

  it("accepts valid round and rectangle tables", () => {
    const result = seatingChartSchema.safeParse({
      width: 1200,
      height: 800,
      tables: [roundTable, rectangleTable],
    });

    expect(result.success).toBe(true);
  });

  it("accepts save payload through the shared input type", () => {
    const input: SaveSeatingInput = {
      width: 1200,
      height: 800,
      tables: [roundTable, rectangleTable],
    };

    const result = saveSeatingSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects a seat count mismatch", () => {
    const result = seatingTableSchema.safeParse({
      ...roundTable,
      seats: roundTable.seats.slice(0, 7),
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate seat position indexes", () => {
    const result = seatingTableSchema.safeParse({
      ...roundTable,
      seats: roundTable.seats.map((seat, index) =>
        index === 1 ? { ...seat, positionIndex: 0 } : seat,
      ),
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-contiguous seat position indexes", () => {
    const result = seatingTableSchema.safeParse({
      ...roundTable,
      seats: roundTable.seats.map((seat, index) =>
        index === 7 ? { ...seat, positionIndex: 8 } : seat,
      ),
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate guest ids across seats", () => {
    const result = seatingChartSchema.safeParse({
      width: 1200,
      height: 800,
      tables: [
        {
          ...roundTable,
          seats: roundTable.seats.map((seat, index) => ({
            ...seat,
            guestId:
              index < 2 ? "550e8400-e29b-41d4-a716-446655440400" : undefined,
          })),
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate table ids across the chart", () => {
    const result = seatingChartSchema.safeParse({
      width: 1200,
      height: 800,
      tables: [
        roundTable,
        {
          ...rectangleTable,
          id: roundTable.id,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate seat ids across all seats", () => {
    const result = seatingChartSchema.safeParse({
      width: 1200,
      height: 800,
      tables: [
        roundTable,
        {
          ...rectangleTable,
          seats: rectangleTable.seats.map((seat, index) =>
            index === 0
              ? {
                  ...seat,
                  id: roundTable.seats[0].id,
                }
              : seat,
          ),
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-uuid guest ids", () => {
    const result = seatingTableSchema.safeParse({
      ...rectangleTable,
      seats: rectangleTable.seats.map((seat, index) =>
        index === 0 ? { ...seat, guestId: "not-a-uuid" } : seat,
      ),
    });

    expect(result.success).toBe(false);
  });

  it("rejects more than the maximum number of tables", () => {
    const tables = Array.from(
      { length: SEATING_MAX_TABLES + 1 },
      (_, index) => ({
        ...roundTable,
        id: `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, "0")}`,
        name: `Table ${index + 1}`,
      }),
    );

    const result = seatingChartSchema.safeParse({
      width: 1200,
      height: 800,
      tables,
    });

    expect(result.success).toBe(false);
  });

  it("enforces seating capacity bounds", () => {
    const tooSmall = seatingTableSchema.safeParse({
      ...roundTable,
      capacity: SEATING_MIN_CAPACITY - 1,
      seats: roundTable.seats.slice(0, SEATING_MIN_CAPACITY - 1),
    });
    expect(tooSmall.success).toBe(false);

    const tooLarge = seatingTableSchema.safeParse({
      ...roundTable,
      capacity: SEATING_MAX_CAPACITY + 1,
      seats: Array.from({ length: SEATING_MAX_CAPACITY + 1 }, (_, index) => ({
        id: `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, "0")}`,
        positionIndex: index,
      })),
    });
    expect(tooLarge.success).toBe(false);
  });

  it("rejects non-standard workspace dimensions", () => {
    const wrongWidth = seatingChartSchema.safeParse({
      width: SEATING_WORKSPACE_WIDTH + 1,
      height: SEATING_WORKSPACE_HEIGHT,
      tables: [roundTable],
    });
    const wrongHeight = seatingChartSchema.safeParse({
      width: SEATING_WORKSPACE_WIDTH,
      height: SEATING_WORKSPACE_HEIGHT + 1,
      tables: [roundTable],
    });

    expect(wrongWidth.success).toBe(false);
    expect(wrongHeight.success).toBe(false);
  });

  it("rejects table x coordinate exceeding workspace width", () => {
    const result = seatingTableSchema.safeParse({
      ...roundTable,
      x: SEATING_WORKSPACE_WIDTH + 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects table y coordinate exceeding workspace height", () => {
    const result = seatingTableSchema.safeParse({
      ...roundTable,
      y: SEATING_WORKSPACE_HEIGHT + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts table x coordinate equal to workspace width", () => {
    const result = seatingTableSchema.safeParse({
      ...roundTable,
      x: SEATING_WORKSPACE_WIDTH,
    });
    expect(result.success).toBe(true);
  });

  it("accepts table y coordinate equal to workspace height", () => {
    const result = seatingTableSchema.safeParse({
      ...roundTable,
      y: SEATING_WORKSPACE_HEIGHT,
    });
    expect(result.success).toBe(true);
  });

  it("rejects tables positioned outside the fixed workspace", () => {
    const result = seatingChartSchema.safeParse({
      width: SEATING_WORKSPACE_WIDTH,
      height: SEATING_WORKSPACE_HEIGHT,
      tables: [
        {
          ...roundTable,
          x: SEATING_WORKSPACE_WIDTH - SEATING_TABLE_FOOTPRINT + 1,
        },
        {
          ...rectangleTable,
          id: "550e8400-e29b-41d4-a716-446655440210",
          y: SEATING_WORKSPACE_HEIGHT - SEATING_TABLE_FOOTPRINT + 1,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts tables at the exact footprint workspace boundary", () => {
    const result = seatingChartSchema.safeParse({
      width: SEATING_WORKSPACE_WIDTH,
      height: SEATING_WORKSPACE_HEIGHT,
      tables: [
        {
          ...roundTable,
          x: SEATING_WORKSPACE_WIDTH - SEATING_TABLE_FOOTPRINT,
          y: SEATING_WORKSPACE_HEIGHT - SEATING_TABLE_FOOTPRINT,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
