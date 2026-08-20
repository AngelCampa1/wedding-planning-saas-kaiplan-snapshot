import { eq, sql } from "drizzle-orm";
import { saveSeatingSchema, type SeatingChart } from "@kaiplan/shared";
import type { Database } from "../db/client";
import { seatingChart } from "../db/seating-schema";

type SeatingCleanupClient = Pick<Database, "select" | "insert" | "execute">;

export async function lockSeatingChart(
  tx: SeatingCleanupClient,
  weddingId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT wedding_id FROM seating_chart WHERE wedding_id = ${weddingId} FOR UPDATE`,
  );
  await tx.execute(
    sql`SELECT id FROM wedding WHERE id = ${weddingId} FOR UPDATE`,
  );
}

export async function removeGuestsFromSeatingChart(
  tx: SeatingCleanupClient,
  weddingId: string,
  guestIds: readonly string[],
): Promise<void> {
  const guestIdSet = new Set(guestIds);
  if (guestIdSet.size === 0) {
    return;
  }

  await lockSeatingChart(tx, weddingId);

  const [row] = await tx
    .select()
    .from(seatingChart)
    .where(eq(seatingChart.weddingId, weddingId))
    .limit(1);

  if (!row) {
    return;
  }

  let chart: SeatingChart;
  try {
    chart = saveSeatingSchema.parse(row.chart);
  } catch {
    return;
  }

  let changed = false;
  const cleaned: SeatingChart = {
    ...chart,
    tables: chart.tables.map((table) => ({
      ...table,
      seats: table.seats.map((seat) => {
        if (seat.guestId && guestIdSet.has(seat.guestId)) {
          changed = true;
          const { guestId: _removed, ...rest } = seat;
          return rest;
        }
        return seat;
      }),
    })),
  };

  if (!changed) {
    return;
  }

  const now = new Date();
  await tx
    .insert(seatingChart)
    .values({
      weddingId,
      chart: cleaned,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: seatingChart.weddingId,
      set: {
        chart: cleaned,
        updatedAt: now,
      },
    });
}

export function removeGuestFromSeatingChart(
  tx: SeatingCleanupClient,
  weddingId: string,
  guestId: string,
): Promise<void> {
  return removeGuestsFromSeatingChart(tx, weddingId, [guestId]);
}
