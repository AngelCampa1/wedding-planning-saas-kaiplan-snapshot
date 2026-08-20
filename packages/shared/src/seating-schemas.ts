import { z } from "zod";
import {
  SEATING_MAX_CAPACITY,
  SEATING_MAX_TABLES,
  SEATING_MIN_CAPACITY,
  SEATING_TABLE_FOOTPRINT,
  SEATING_WORKSPACE_HEIGHT,
  SEATING_WORKSPACE_WIDTH,
} from "./constants";

export const seatingSeatSchema = z.object({
  id: z.string().uuid(),
  positionIndex: z.number().int().min(0),
  guestId: z.string().uuid().optional(),
});

const seatingTableBaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  capacity: z
    .number()
    .int()
    .min(SEATING_MIN_CAPACITY)
    .max(SEATING_MAX_CAPACITY),
  x: z.number().int().min(0).max(SEATING_WORKSPACE_WIDTH),
  y: z.number().int().min(0).max(SEATING_WORKSPACE_HEIGHT),
  seats: z.array(seatingSeatSchema),
});

function validateSeatCountMatchesCapacity(
  table: { capacity: number; seats: Array<unknown> },
  ctx: z.RefinementCtx,
) {
  if (table.seats.length !== table.capacity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Seat count must match table capacity.",
      path: ["seats"],
    });
  }
}

function validateSeatPositionIndexes(
  table: { seats: Array<{ positionIndex: number }> },
  ctx: z.RefinementCtx,
) {
  const sortedPositionIndexes = [...table.seats]
    .map((seat) => seat.positionIndex)
    .sort((a, b) => a - b);
  const uniquePositionIndexes = new Set(sortedPositionIndexes);

  if (uniquePositionIndexes.size !== sortedPositionIndexes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Seat position indexes must be unique.",
      path: ["seats"],
    });
    return;
  }

  for (let index = 0; index < sortedPositionIndexes.length; index += 1) {
    if (sortedPositionIndexes[index] !== index) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Seat position indexes must be contiguous starting at 0.",
        path: ["seats"],
      });
      return;
    }
  }
}

export const roundSeatingTableSchema = seatingTableBaseSchema
  .extend({
    shape: z.literal("round"),
    orientation: z.never().optional(),
  })
  .superRefine(validateSeatCountMatchesCapacity)
  .superRefine(validateSeatPositionIndexes);

export const rectangleSeatingTableSchema = seatingTableBaseSchema
  .extend({
    shape: z.literal("rectangle"),
    orientation: z.enum(["horizontal", "vertical"]).optional(),
  })
  .superRefine(validateSeatCountMatchesCapacity)
  .superRefine(validateSeatPositionIndexes);

export const seatingTableSchema = z.union([
  roundSeatingTableSchema,
  rectangleSeatingTableSchema,
]);

function validateUniqueGuestIdsAcrossSeats(
  chart: { tables: Array<{ seats: Array<{ guestId?: string }> }> },
  ctx: z.RefinementCtx,
) {
  const guestLocations = new Map<
    string,
    { tableIndex: number; seatIndex: number }
  >();

  chart.tables.forEach((table, tableIndex) => {
    table.seats.forEach((seat, seatIndex) => {
      if (!seat.guestId) {
        return;
      }

      if (guestLocations.has(seat.guestId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Guest ids must be unique across all assigned seats.",
          path: ["tables", tableIndex, "seats", seatIndex, "guestId"],
        });
        return;
      }

      guestLocations.set(seat.guestId, { tableIndex, seatIndex });
    });
  });
}

function validateUniqueTableAndSeatIds(
  chart: {
    tables: Array<{
      id: string;
      seats: Array<{ id: string }>;
    }>;
  },
  ctx: z.RefinementCtx,
) {
  const tableIds = new Set<string>();
  const seatIds = new Set<string>();

  chart.tables.forEach((table, tableIndex) => {
    if (tableIds.has(table.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Table ids must be unique across the chart.",
        path: ["tables", tableIndex, "id"],
      });
    } else {
      tableIds.add(table.id);
    }

    table.seats.forEach((seat, seatIndex) => {
      if (seatIds.has(seat.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Seat ids must be unique across the chart.",
          path: ["tables", tableIndex, "seats", seatIndex, "id"],
        });
        return;
      }

      seatIds.add(seat.id);
    });
  });
}

function validateTablesStayWithinWorkspace(
  chart: {
    width: number;
    height: number;
    tables: Array<{
      x: number;
      y: number;
    }>;
  },
  ctx: z.RefinementCtx,
) {
  const maxX = chart.width - SEATING_TABLE_FOOTPRINT;
  const maxY = chart.height - SEATING_TABLE_FOOTPRINT;

  chart.tables.forEach((table, tableIndex) => {
    if (table.x > maxX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Table must stay within the workspace width.",
        path: ["tables", tableIndex, "x"],
      });
    }

    if (table.y > maxY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Table must stay within the workspace height.",
        path: ["tables", tableIndex, "y"],
      });
    }
  });
}

export const seatingChartSchema = z
  .object({
    width: z
      .number()
      .int()
      .refine((value) => value === SEATING_WORKSPACE_WIDTH, {
        message: `Workspace width must be ${SEATING_WORKSPACE_WIDTH}.`,
      }),
    height: z
      .number()
      .int()
      .refine((value) => value === SEATING_WORKSPACE_HEIGHT, {
        message: `Workspace height must be ${SEATING_WORKSPACE_HEIGHT}.`,
      }),
    tables: z.array(seatingTableSchema).max(SEATING_MAX_TABLES),
  })
  .superRefine(validateUniqueTableAndSeatIds)
  .superRefine(validateTablesStayWithinWorkspace)
  .superRefine(validateUniqueGuestIdsAcrossSeats);

export const saveSeatingSchema = seatingChartSchema;

export type SaveSeatingInput = z.infer<typeof saveSeatingSchema>;
