import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import {
  saveSeatingSchema,
  SEATING_WORKSPACE_HEIGHT,
  SEATING_WORKSPACE_WIDTH,
  type SeatingChart,
  type SeatingSummary,
} from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import { guest } from "../db/guest-schema";
import { seatingChart } from "../db/seating-schema";
import { lockSeatingChart } from "../lib/seating-cleanup";
import { readJsonObjectBody } from "../lib/json-body";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

type AppEnv = { Bindings: Env; Variables: Variables };

type SaveSeatingChartResult =
  | { ok: true; row: typeof seatingChart.$inferSelect }
  | { ok: false; status: 400; error: string };

const EMPTY_CHART: SeatingChart = {
  width: SEATING_WORKSPACE_WIDTH,
  height: SEATING_WORKSPACE_HEIGHT,
  tables: [],
};

function requireWriter(c: Context<AppEnv>) {
  if (c.get("weddingRole") === "viewer") {
    return c.json({ error: "Viewers cannot modify seating charts" }, 403);
  }

  return null;
}

function computeSummary(chart: SeatingChart): SeatingSummary {
  const seatCount = chart.tables.reduce(
    (total, table) => total + table.seats.length,
    0,
  );
  const assignedSeatCount = chart.tables.reduce((total, table) => {
    return (
      total +
      table.seats.reduce(
        (seatTotal, seat) => seatTotal + (seat.guestId ? 1 : 0),
        0,
      )
    );
  }, 0);

  return {
    tableCount: chart.tables.length,
    seatCount,
    assignedSeatCount,
    unassignedSeatCount: seatCount - assignedSeatCount,
  };
}

function collectAssignedGuestIds(chart: SeatingChart) {
  const ids: string[] = [];

  for (const table of chart.tables) {
    for (const seat of table.seats) {
      if (seat.guestId) {
        ids.push(seat.guestId);
      }
    }
  }

  return ids;
}

function cleanStaleAssignments(
  chart: SeatingChart,
  validGuestIds: Set<string>,
) {
  let changed = false;

  const tables = chart.tables.map((table) => {
    let tableChanged = false;
    const seats = table.seats.map((seat) => {
      if (seat.guestId && !validGuestIds.has(seat.guestId)) {
        changed = true;
        tableChanged = true;
        const { guestId: _guestId, ...rest } = seat;
        return rest;
      }

      return seat;
    });

    return tableChanged ? { ...table, seats } : table;
  });

  return {
    chart: changed ? { ...chart, tables } : chart,
    changed,
  };
}

async function saveSeatingChart(
  db: Database,
  weddingId: string,
  chart: SeatingChart,
): Promise<SaveSeatingChartResult> {
  // M13: Wrap GET-validate-upsert in a transaction with a SELECT FOR UPDATE
  // on the seating chart row to serialize concurrent saves and prevent lost
  // updates.
  const row = await db.transaction(async (tx) => {
    // Acquire an advisory row lock on the seating chart (or wedding row if no
    // chart row exists yet) to prevent two concurrent PUTs from interleaving.
    await lockSeatingChart(tx, weddingId);

    const assignedGuestIds = collectAssignedGuestIds(chart);
    const uniqueAssignedGuestIds = [...new Set(assignedGuestIds)];

    if (uniqueAssignedGuestIds.length > 0) {
      const guests = await tx
        .select({
          id: guest.id,
          rsvpStatus: guest.rsvpStatus,
        })
        .from(guest)
        .where(
          and(
            eq(guest.weddingId, weddingId),
            inArray(guest.id, uniqueAssignedGuestIds),
          ),
        );

      if (guests.length !== uniqueAssignedGuestIds.length) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Some assigned guests do not belong to this wedding",
        };
      }

      if (guests.some((row) => row.rsvpStatus === "declined")) {
        return {
          ok: false as const,
          status: 400 as const,
          error: "Declined guests cannot be assigned to seating",
        };
      }
    }

    const [saved] = await tx
      .insert(seatingChart)
      .values({
        weddingId,
        chart,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: seatingChart.weddingId,
        set: {
          chart,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!saved) {
      throw new Error("Failed to save seating chart");
    }

    return { ok: true as const, row: saved };
  });

  return row;
}

export function seatingRoutes(db: Database, auth: Auth) {
  const app = new Hono<AppEnv>();
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  app.get(
    "/:weddingId/seating",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const [saved] = await db
        .select()
        .from(seatingChart)
        .where(eq(seatingChart.weddingId, weddingId))
        .limit(1);

      const savedChart = saved?.chart;
      const chart = savedChart
        ? saveSeatingSchema.parse(savedChart)
        : EMPTY_CHART;

      if (savedChart) {
        const assignedGuestIds = [...new Set(collectAssignedGuestIds(chart))];

        if (assignedGuestIds.length > 0) {
          const guests = await db
            .select({
              id: guest.id,
              rsvpStatus: guest.rsvpStatus,
            })
            .from(guest)
            .where(
              and(
                eq(guest.weddingId, weddingId),
                inArray(guest.id, assignedGuestIds),
              ),
            );

          const validGuestIds = new Set(
            guests
              .filter((row) => row.rsvpStatus !== "declined")
              .map((row) => row.id),
          );

          const cleaned = cleanStaleAssignments(chart, validGuestIds);
          return c.json({
            chart: cleaned.chart,
            summary: computeSummary(cleaned.chart),
          });
        }
      }

      return c.json({
        chart,
        summary: computeSummary(chart),
      });
    },
  );

  app.put(
    "/:weddingId/seating",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = saveSeatingSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const saved = await saveSeatingChart(db, weddingId, parsed.data);
      if (!saved.ok) {
        return c.json({ error: saved.error }, saved.status);
      }

      const chart = saveSeatingSchema.parse(saved.row.chart);

      return c.json({
        chart,
        summary: computeSummary(chart),
      });
    },
  );

  return app;
}
