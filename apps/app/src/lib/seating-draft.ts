import type {
  Guest,
  GuestWithPlusOnes,
  SeatingChart,
  SeatingTable,
  SeatingTableShape,
} from "@kaiplan/shared";
import {
  SEATING_TABLE_FOOTPRINT,
  SEATING_WORKSPACE_HEIGHT,
  SEATING_WORKSPACE_WIDTH,
} from "@kaiplan/shared";

export interface SeatingDraftState {
  savedChart: SeatingChart;
  draftChart: SeatingChart;
  selectedTableId: string | null;
  /** Guest IDs displaced by the most recent capacity-shrink operation. Cleared on next action. */
  displacedGuestIds: string[];
}

export type SeatingDraftAction =
  | { type: "replaceFromServer"; chart: SeatingChart }
  | { type: "updateSavedChart"; chart: SeatingChart }
  | { type: "replaceDraftChart"; chart: SeatingChart }
  | { type: "resetToSavedChart" }
  | { type: "selectTable"; tableId: string | null }
  | { type: "addTable"; shape: SeatingTableShape }
  | {
      type: "updateSelectedTable";
      patch: Partial<
        Pick<SeatingTable, "name" | "capacity" | "orientation" | "x" | "y">
      >;
    }
  | { type: "moveTableBy"; tableId: string; deltaX: number; deltaY: number }
  | {
      type: "assignGuestToSeat";
      guestId: string;
      tableId: string;
      seatIndex: number;
    }
  | { type: "unassignGuestFromSeat"; guestId: string }
  | { type: "deleteTable"; tableId: string };

const DEFAULT_TABLE_CAPACITY: Record<SeatingTableShape, number> = {
  round: 8,
  rectangle: 6,
};

function createSeats(
  _tableId: string,
  capacity: number,
  previous?: SeatingTable["seats"],
) {
  return Array.from({ length: capacity }, (_, seatIndex) => ({
    id: previous?.[seatIndex]?.id ?? crypto.randomUUID(),
    positionIndex: seatIndex,
    guestId: previous?.[seatIndex]?.guestId,
  }));
}

function createTable(
  shape: SeatingTableShape,
  tableCount: number,
  chart: SeatingChart,
): SeatingTable {
  const tableId = crypto.randomUUID();
  const capacity = DEFAULT_TABLE_CAPACITY[shape];
  const maxX = Math.max(0, chart.width - SEATING_TABLE_FOOTPRINT);
  const maxY = Math.max(0, chart.height - SEATING_TABLE_FOOTPRINT);
  const xRange = Math.max(0, maxX - 80);
  const yRange = Math.max(0, maxY - 80);
  const base = {
    id: tableId,
    name: `${shape === "round" ? "Round" : "Rectangle"} Table ${tableCount + 1}`,
    shape,
    capacity,
    x: Math.min(maxX, 80 + ((tableCount * 48) % (xRange + 1))),
    y: Math.min(maxY, 80 + ((tableCount * 36) % (yRange + 1))),
    seats: createSeats(tableId, capacity),
  };

  if (shape === "rectangle") {
    return { ...base, shape, orientation: "horizontal" };
  }

  return base;
}

function updateTable(
  table: SeatingTable,
  patch: Partial<
    Pick<SeatingTable, "name" | "capacity" | "orientation" | "x" | "y">
  >,
  chart: SeatingChart,
): { updatedTable: SeatingTable; displacedGuestIds: string[] } {
  const nextCapacity = patch.capacity ?? table.capacity;

  // Detect guests displaced by capacity shrink
  const displacedGuestIds: string[] =
    nextCapacity < table.capacity
      ? table.seats
          .slice(nextCapacity)
          .flatMap((seat) => (seat.guestId ? [seat.guestId] : []))
      : [];

  const resizedSeats =
    nextCapacity === table.capacity
      ? table.seats
      : createSeats(table.id, nextCapacity, table.seats);
  const maxX = Math.max(0, chart.width - SEATING_TABLE_FOOTPRINT);
  const maxY = Math.max(0, chart.height - SEATING_TABLE_FOOTPRINT);
  const nextX = Math.min(maxX, Math.max(0, patch.x ?? table.x));
  const nextY = Math.min(maxY, Math.max(0, patch.y ?? table.y));

  if (table.shape === "rectangle") {
    return {
      updatedTable: {
        ...table,
        ...patch,
        capacity: nextCapacity,
        x: nextX,
        y: nextY,
        orientation: patch.orientation ?? table.orientation ?? "horizontal",
        seats: resizedSeats,
      },
      displacedGuestIds,
    };
  }

  const { orientation: _orientation, ...roundPatch } = patch;

  return {
    updatedTable: {
      ...table,
      ...roundPatch,
      capacity: nextCapacity,
      x: nextX,
      y: nextY,
      seats: resizedSeats,
    },
    displacedGuestIds,
  };
}

function clampTablePosition(chart: SeatingChart, x: number, y: number) {
  return {
    x: Math.min(chart.width - SEATING_TABLE_FOOTPRINT, Math.max(0, x)),
    y: Math.min(chart.height - SEATING_TABLE_FOOTPRINT, Math.max(0, y)),
  };
}

function clearGuestAssignments(chart: SeatingChart, guestId: string) {
  return {
    ...chart,
    tables: chart.tables.map((table) => ({
      ...table,
      seats: table.seats.map((seat) =>
        seat.guestId === guestId ? { ...seat, guestId: undefined } : seat,
      ),
    })),
  };
}

function assignGuest(
  chart: SeatingChart,
  guestId: string,
  tableId: string,
  seatIndex: number,
) {
  const cleared = clearGuestAssignments(chart, guestId);

  return {
    ...cleared,
    tables: cleared.tables.map((table) => {
      if (table.id !== tableId) {
        return table;
      }

      return {
        ...table,
        seats: table.seats.map((seat, index) =>
          index === seatIndex ? { ...seat, guestId } : seat,
        ),
      };
    }),
  };
}

function findLinkedPartyGuests(
  guests: GuestWithPlusOnes[],
  guestId: string,
): Guest[] {
  for (const primary of guests) {
    if (primary.id === guestId) {
      return [primary, ...primary.plusOnes];
    }

    const plusOne = primary.plusOnes.find((guest) => guest.id === guestId);
    if (plusOne) {
      return [primary, ...primary.plusOnes];
    }
  }

  return [];
}

function findContiguousSeatIndexes(
  table: SeatingTable,
  requiredSeats: number,
): number[] | null {
  if (requiredSeats <= 0) {
    return [];
  }

  const isSeatEmpty = (seatIndex: number) => !table.seats[seatIndex]?.guestId;

  if (table.shape === "round") {
    for (let startIndex = 0; startIndex < table.seats.length; startIndex += 1) {
      const seatIndexes = Array.from(
        { length: requiredSeats },
        (_, offset) => (startIndex + offset) % table.seats.length,
      );

      if (seatIndexes.every(isSeatEmpty)) {
        return seatIndexes;
      }
    }

    return null;
  }

  const seatsPerSide = Math.ceil(table.seats.length / 2);
  const seatGroups = [
    Array.from({ length: seatsPerSide }, (_, index) => index),
    Array.from(
      { length: table.seats.length - seatsPerSide },
      (_, index) => seatsPerSide + index,
    ),
  ].filter((group) => group.length > 0);

  for (const group of seatGroups) {
    for (
      let startIndex = 0;
      startIndex <= group.length - requiredSeats;
      startIndex += 1
    ) {
      const seatIndexes = group.slice(startIndex, startIndex + requiredSeats);

      if (seatIndexes.every(isSeatEmpty)) {
        return seatIndexes;
      }
    }
  }

  return null;
}

export function createSeatingDraftState(
  savedChart: SeatingChart,
): SeatingDraftState {
  return {
    savedChart: {
      ...savedChart,
      width: SEATING_WORKSPACE_WIDTH,
      height: SEATING_WORKSPACE_HEIGHT,
    },
    draftChart: {
      ...savedChart,
      width: SEATING_WORKSPACE_WIDTH,
      height: SEATING_WORKSPACE_HEIGHT,
    },
    selectedTableId: null,
    displacedGuestIds: [],
  };
}

export function isSeatingDraftDirty(state: SeatingDraftState) {
  return JSON.stringify(state.savedChart) !== JSON.stringify(state.draftChart);
}

export function getSeatingDraftStats(
  state: SeatingDraftState,
  guests: GuestWithPlusOnes[],
) {
  const seatCount = state.draftChart.tables.reduce(
    (total, table) => total + table.seats.length,
    0,
  );
  const assignedGuestIds = state.draftChart.tables.flatMap((table) =>
    table.seats.flatMap((seat) => (seat.guestId ? [seat.guestId] : [])),
  );
  const seatableGuests = guests.flatMap((primary) => [
    primary,
    ...primary.plusOnes,
  ]);

  return {
    tableCount: state.draftChart.tables.length,
    seatCount,
    assignedSeatCount: assignedGuestIds.length,
    unassignedSeatCount: seatCount - assignedGuestIds.length,
    unseatedGuestCount: seatableGuests.filter(
      (guest) => !assignedGuestIds.includes(guest.id),
    ).length,
    dirty: isSeatingDraftDirty(state),
  };
}

export function seatLinkedPartyAtTable(
  state: SeatingDraftState,
  guests: GuestWithPlusOnes[],
  guestId: string,
  tableId: string,
) {
  const table = state.draftChart.tables.find((item) => item.id === tableId);
  if (!table) {
    return state;
  }

  const party = findLinkedPartyGuests(guests, guestId).filter(
    (guest) => guest.rsvpStatus !== "declined",
  );
  const contiguousSeatIndexes = findContiguousSeatIndexes(table, party.length);

  if (party.length === 0 || !contiguousSeatIndexes) {
    return state;
  }

  return party.reduce(
    (nextState, guest, index) =>
      seatingDraftReducer(nextState, {
        type: "assignGuestToSeat",
        guestId: guest.id,
        tableId,
        seatIndex: contiguousSeatIndexes[index]!,
      }),
    state,
  );
}

export function canSeatLinkedPartyAtTable(
  state: SeatingDraftState,
  guests: GuestWithPlusOnes[],
  guestId: string,
  tableId: string,
) {
  const table = state.draftChart.tables.find((item) => item.id === tableId);
  if (!table) {
    return false;
  }

  const party = findLinkedPartyGuests(guests, guestId).filter(
    (guest) => guest.rsvpStatus !== "declined",
  );

  if (party.length === 0) {
    return false;
  }

  return findContiguousSeatIndexes(table, party.length) !== null;
}

export function seatGroupAtTable(
  state: SeatingDraftState,
  guests: GuestWithPlusOnes[],
  groupName: string,
  tableId: string,
): { draftChart: SeatingChart; unseatedCount: number } {
  // Build set of all currently assigned guest IDs
  const assignedIds = new Set(
    state.draftChart.tables.flatMap((table) =>
      table.seats.flatMap((seat) => (seat.guestId ? [seat.guestId] : [])),
    ),
  );

  // Only primary guests (primaryGuestId === null) in the named group
  const groupPrimaries = guests.filter(
    (g) => g.groupName === groupName && g.primaryGuestId === null,
  );

  let currentState = state;
  let unseatedCount = 0;

  for (const primary of groupPrimaries) {
    // Skip if any household member is already seated
    const householdIds = [primary.id, ...primary.plusOnes.map((po) => po.id)];
    if (householdIds.some((id) => assignedIds.has(id))) {
      continue;
    }

    // Try to seat the household
    const nextState = seatLinkedPartyAtTable(
      currentState,
      guests,
      primary.id,
      tableId,
    );

    if (nextState === currentState) {
      // Couldn't seat — table full
      unseatedCount += 1;
    } else {
      currentState = nextState;
      householdIds.forEach((id) => assignedIds.add(id));
    }
  }

  return { draftChart: currentState.draftChart, unseatedCount };
}

export function seatingDraftReducer(
  state: SeatingDraftState,
  action: SeatingDraftAction,
): SeatingDraftState {
  switch (action.type) {
    case "replaceFromServer":
      return createSeatingDraftState(action.chart);
    case "updateSavedChart":
      return {
        ...state,
        displacedGuestIds: [],
        savedChart: createSeatingDraftState(action.chart).savedChart,
      };
    case "replaceDraftChart":
      return {
        ...state,
        displacedGuestIds: [],
        draftChart: action.chart,
      };
    case "resetToSavedChart":
      return {
        ...state,
        displacedGuestIds: [],
        draftChart: state.savedChart,
      };
    case "selectTable":
      return {
        ...state,
        displacedGuestIds: [],
        selectedTableId: action.tableId,
      };
    case "addTable": {
      const table = createTable(
        action.shape,
        state.draftChart.tables.length,
        state.draftChart,
      );
      return {
        ...state,
        displacedGuestIds: [],
        selectedTableId: table.id,
        draftChart: {
          ...state.draftChart,
          tables: [...state.draftChart.tables, table],
        },
      };
    }
    case "updateSelectedTable": {
      let allDisplacedGuestIds: string[] = [];
      const updatedTables = state.draftChart.tables.map((table) => {
        if (table.id !== state.selectedTableId) {
          return table;
        }
        const { updatedTable, displacedGuestIds } = updateTable(
          table,
          action.patch,
          state.draftChart,
        );
        allDisplacedGuestIds = displacedGuestIds;
        return updatedTable;
      });
      return {
        ...state,
        displacedGuestIds: allDisplacedGuestIds,
        draftChart: {
          ...state.draftChart,
          tables: updatedTables,
        },
      };
    }
    case "moveTableBy":
      return {
        ...state,
        displacedGuestIds: [],
        draftChart: {
          ...state.draftChart,
          tables: state.draftChart.tables.map((table) =>
            table.id === action.tableId
              ? {
                  ...table,
                  ...clampTablePosition(
                    state.draftChart,
                    table.x + action.deltaX,
                    table.y + action.deltaY,
                  ),
                }
              : table,
          ),
        },
      };
    case "assignGuestToSeat":
      return {
        ...state,
        displacedGuestIds: [],
        draftChart: assignGuest(
          state.draftChart,
          action.guestId,
          action.tableId,
          action.seatIndex,
        ),
      };
    case "unassignGuestFromSeat":
      return {
        ...state,
        displacedGuestIds: [],
        draftChart: clearGuestAssignments(state.draftChart, action.guestId),
      };
    case "deleteTable":
      return {
        ...state,
        displacedGuestIds: [],
        selectedTableId:
          state.selectedTableId === action.tableId
            ? null
            : state.selectedTableId,
        draftChart: {
          ...state.draftChart,
          tables: state.draftChart.tables.filter(
            (table) => table.id !== action.tableId,
          ),
        },
      };
    default:
      return state;
  }
}
