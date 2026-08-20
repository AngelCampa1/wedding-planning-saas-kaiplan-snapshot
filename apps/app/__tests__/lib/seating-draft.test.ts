import { describe, expect, it } from "vitest";
import type { GuestWithPlusOnes, SeatingChart } from "@kaiplan/shared";
import {
  SEATING_TABLE_FOOTPRINT,
  SEATING_WORKSPACE_HEIGHT,
  SEATING_WORKSPACE_WIDTH,
} from "@kaiplan/shared";
import {
  canSeatLinkedPartyAtTable,
  createSeatingDraftState,
  getSeatingDraftStats,
  isSeatingDraftDirty,
  seatGroupAtTable,
  seatLinkedPartyAtTable,
  seatingDraftReducer,
} from "../../src/lib/seating-draft";

function makeChart(overrides: Partial<SeatingChart> = {}): SeatingChart {
  return {
    width: 1200,
    height: 800,
    tables: [],
    ...overrides,
  };
}

function makeGuest(
  overrides: Partial<GuestWithPlusOnes> = {},
): GuestWithPlusOnes {
  return {
    id: "guest-1",
    weddingId: "w-1",
    primaryGuestId: null,
    firstName: "Alice",
    lastName: "Smith",
    email: null,
    phone: null,
    side: "mutual",
    groupName: "Friends",
    dietaryTags: [],
    dietaryNotes: null,
    rsvpStatus: "accepted",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    plusOnes: [],
    ...overrides,
  };
}

describe("seating draft state", () => {
  it("replaces the saved chart from the server and clears selection", () => {
    const state = createSeatingDraftState(makeChart());
    const selected = seatingDraftReducer(state, {
      type: "selectTable",
      tableId: "table-1",
    });
    const nextChart = makeChart({
      tables: [
        {
          id: "table-2",
          name: "Updated",
          shape: "round",
          capacity: 2,
          x: 10,
          y: 20,
          seats: [
            { id: "seat-1", positionIndex: 0 },
            { id: "seat-2", positionIndex: 1 },
          ],
        },
      ],
    });

    const next = seatingDraftReducer(selected, {
      type: "replaceFromServer",
      chart: nextChart,
    });

    expect(next.savedChart).toEqual(nextChart);
    expect(next.draftChart).toEqual(nextChart);
    expect(next.selectedTableId).toBeNull();
  });

  it("replaces the draft chart without touching the saved chart", () => {
    const saved = makeChart({
      tables: [
        {
          id: "table-1",
          name: "Saved",
          shape: "round",
          capacity: 2,
          x: 0,
          y: 0,
          seats: [
            { id: "seat-1", positionIndex: 0 },
            { id: "seat-2", positionIndex: 1 },
          ],
        },
      ],
    });
    const state = createSeatingDraftState(saved);
    const draft = makeChart({
      tables: [
        {
          id: "table-2",
          name: "Draft",
          shape: "round",
          capacity: 2,
          x: 10,
          y: 10,
          seats: [
            { id: "seat-3", positionIndex: 0 },
            { id: "seat-4", positionIndex: 1 },
          ],
        },
      ],
    });

    const next = seatingDraftReducer(state, {
      type: "replaceDraftChart",
      chart: draft,
    });

    expect(next.savedChart).toEqual(saved);
    expect(next.draftChart).toEqual(draft);
    expect(isSeatingDraftDirty(next)).toBe(true);
  });

  it("updates the saved chart without overwriting the current draft", () => {
    const originalSaved = makeChart({
      tables: [
        {
          id: "table-1",
          name: "Original Saved",
          shape: "round",
          capacity: 2,
          x: 0,
          y: 0,
          seats: [
            { id: "seat-1", positionIndex: 0 },
            { id: "seat-2", positionIndex: 1 },
          ],
        },
      ],
    });
    const state = createSeatingDraftState(originalSaved);
    const edited = seatingDraftReducer(state, {
      type: "addTable",
      shape: "rectangle",
    });
    const nextSaved = makeChart({
      tables: [
        {
          id: "table-2",
          name: "Server Saved",
          shape: "round",
          capacity: 2,
          x: 10,
          y: 10,
          seats: [
            { id: "seat-3", positionIndex: 0 },
            { id: "seat-4", positionIndex: 1 },
          ],
        },
      ],
    });

    const next = seatingDraftReducer(edited, {
      type: "updateSavedChart",
      chart: nextSaved,
    });

    expect(next.savedChart).toEqual({
      ...nextSaved,
      width: SEATING_WORKSPACE_WIDTH,
      height: SEATING_WORKSPACE_HEIGHT,
    });
    expect(next.draftChart).toEqual(edited.draftChart);
    expect(isSeatingDraftDirty(next)).toBe(true);
  });

  it("creates rectangle tables with the default horizontal orientation", () => {
    const next = seatingDraftReducer(createSeatingDraftState(makeChart()), {
      type: "addTable",
      shape: "rectangle",
    });

    expect(next.draftChart.tables[0].shape).toBe("rectangle");
    expect(next.draftChart.tables[0].orientation).toBe("horizontal");
    expect(next.draftChart.tables[0].seats).toHaveLength(6);
  });

  it("ignores orientation updates on round tables and clamps moved tables at zero", () => {
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Round",
            shape: "round",
            capacity: 4,
            x: 5,
            y: 6,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
              { id: "seat-3", positionIndex: 2 },
              { id: "seat-4", positionIndex: 3 },
            ],
          },
        ],
      }),
    );

    const selected = seatingDraftReducer(state, {
      type: "selectTable",
      tableId: "table-1",
    });
    const updated = seatingDraftReducer(selected, {
      type: "updateSelectedTable",
      patch: { orientation: "vertical", capacity: 4 },
    });
    const moved = seatingDraftReducer(updated, {
      type: "moveTableBy",
      tableId: "table-1",
      deltaX: -50,
      deltaY: -60,
    });

    expect(updated.draftChart.tables[0].orientation).toBeUndefined();
    expect(moved.draftChart.tables[0].x).toBe(0);
    expect(moved.draftChart.tables[0].y).toBe(0);
  });

  it("clamps moved tables to the fixed workspace bounds", () => {
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Round",
            shape: "round",
            capacity: 4,
            x: 900,
            y: 550,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
              { id: "seat-3", positionIndex: 2 },
              { id: "seat-4", positionIndex: 3 },
            ],
          },
        ],
      }),
    );

    const moved = seatingDraftReducer(state, {
      type: "moveTableBy",
      tableId: "table-1",
      deltaX: 500,
      deltaY: 500,
    });

    expect(moved.draftChart.tables[0].x).toBe(
      SEATING_WORKSPACE_WIDTH - SEATING_TABLE_FOOTPRINT,
    );
    expect(moved.draftChart.tables[0].y).toBe(
      SEATING_WORKSPACE_HEIGHT - SEATING_TABLE_FOOTPRINT,
    );
  });

  it("adds a round table with seats and marks the draft dirty", () => {
    const state = createSeatingDraftState(makeChart());
    const next = seatingDraftReducer(state, {
      type: "addTable",
      shape: "round",
    });

    expect(next.draftChart.tables).toHaveLength(1);
    expect(next.draftChart.tables[0].shape).toBe("round");
    expect(next.draftChart.tables[0].capacity).toBe(8);
    expect(next.draftChart.tables[0].seats).toHaveLength(8);
    expect(next.draftChart.tables[0].x).toBeLessThanOrEqual(
      SEATING_WORKSPACE_WIDTH - SEATING_TABLE_FOOTPRINT,
    );
    expect(next.draftChart.tables[0].y).toBeLessThanOrEqual(
      SEATING_WORKSPACE_HEIGHT - SEATING_TABLE_FOOTPRINT,
    );
    expect(isSeatingDraftDirty(next)).toBe(true);
  });

  it("normalizes incoming charts back to the fixed workspace size", () => {
    const state = createSeatingDraftState(
      makeChart({
        width: 1600,
        height: 1000,
      }),
    );

    expect(state.savedChart.width).toBe(SEATING_WORKSPACE_WIDTH);
    expect(state.savedChart.height).toBe(SEATING_WORKSPACE_HEIGHT);
    expect(state.draftChart.width).toBe(SEATING_WORKSPACE_WIDTH);
    expect(state.draftChart.height).toBe(SEATING_WORKSPACE_HEIGHT);
  });

  it("updates the selected table fields and preserves assigned guests when capacity changes", () => {
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "rectangle",
            capacity: 4,
            orientation: "horizontal",
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0, guestId: "guest-a" },
              { id: "seat-2", positionIndex: 1, guestId: "guest-b" },
              { id: "seat-3", positionIndex: 2 },
              { id: "seat-4", positionIndex: 3 },
            ],
          },
        ],
      }),
    );

    const selected = seatingDraftReducer(state, {
      type: "selectTable",
      tableId: "table-1",
    });
    const next = seatingDraftReducer(selected, {
      type: "updateSelectedTable",
      patch: {
        name: "Head Table",
        capacity: 2,
        orientation: "vertical",
        x: 220,
        y: 240,
      },
    });

    expect(next.draftChart.tables[0].name).toBe("Head Table");
    expect(next.draftChart.tables[0].capacity).toBe(2);
    expect(next.draftChart.tables[0].orientation).toBe("vertical");
    expect(next.draftChart.tables[0].x).toBe(220);
    expect(next.draftChart.tables[0].y).toBe(240);
    expect(next.draftChart.tables[0].seats).toHaveLength(2);
    expect(next.draftChart.tables[0].seats[0].guestId).toBe("guest-a");
    expect(next.draftChart.tables[0].seats[1].guestId).toBe("guest-b");
  });

  it("populates displacedGuestIds when capacity shrinks past seated guests", () => {
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 4,
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0, guestId: "guest-a" },
              { id: "seat-2", positionIndex: 1, guestId: "guest-b" },
              { id: "seat-3", positionIndex: 2 },
              { id: "seat-4", positionIndex: 3, guestId: "guest-c" },
            ],
          },
        ],
      }),
    );

    const selected = seatingDraftReducer(state, {
      type: "selectTable",
      tableId: "table-1",
    });
    // Shrink to capacity 2 — seats at index 2 and 3 are dropped
    // seat-3 has no guest, seat-4 has guest-c → displaced = ["guest-c"]
    const next = seatingDraftReducer(selected, {
      type: "updateSelectedTable",
      patch: { capacity: 2 },
    });

    expect(next.displacedGuestIds).toEqual(["guest-c"]);
    expect(next.draftChart.tables[0].seats).toHaveLength(2);
  });

  it("clears displacedGuestIds on the next unrelated action", () => {
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 3,
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0, guestId: "guest-a" },
              { id: "seat-2", positionIndex: 1 },
              { id: "seat-3", positionIndex: 2, guestId: "guest-b" },
            ],
          },
        ],
      }),
    );

    const selected = seatingDraftReducer(state, {
      type: "selectTable",
      tableId: "table-1",
    });
    const afterShrink = seatingDraftReducer(selected, {
      type: "updateSelectedTable",
      patch: { capacity: 1 },
    });
    expect(afterShrink.displacedGuestIds.length).toBeGreaterThan(0);

    const afterNextAction = seatingDraftReducer(afterShrink, {
      type: "selectTable",
      tableId: null,
    });
    expect(afterNextAction.displacedGuestIds).toEqual([]);
  });

  it("has empty displacedGuestIds when no seated guests are displaced", () => {
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 4,
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0, guestId: "guest-a" },
              { id: "seat-2", positionIndex: 1 },
              { id: "seat-3", positionIndex: 2 },
              { id: "seat-4", positionIndex: 3 },
            ],
          },
        ],
      }),
    );

    const selected = seatingDraftReducer(state, {
      type: "selectTable",
      tableId: "table-1",
    });
    // Shrink to 2, but only seat-1 (index 0) is occupied — no one at index 2/3
    const next = seatingDraftReducer(selected, {
      type: "updateSelectedTable",
      patch: { capacity: 2 },
    });

    expect(next.displacedGuestIds).toEqual([]);
  });

  it("initializes displacedGuestIds as empty in createSeatingDraftState", () => {
    const state = createSeatingDraftState(makeChart());
    expect(state.displacedGuestIds).toEqual([]);
  });

  it("assigns, moves, and unassigns guests between seats", () => {
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 2,
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
            ],
          },
          {
            id: "table-2",
            name: "Table 2",
            shape: "round",
            capacity: 2,
            x: 300,
            y: 100,
            seats: [
              { id: "seat-3", positionIndex: 0 },
              { id: "seat-4", positionIndex: 1 },
            ],
          },
        ],
      }),
    );

    const assigned = seatingDraftReducer(state, {
      type: "assignGuestToSeat",
      guestId: "guest-1",
      tableId: "table-1",
      seatIndex: 0,
    });
    const moved = seatingDraftReducer(assigned, {
      type: "assignGuestToSeat",
      guestId: "guest-1",
      tableId: "table-2",
      seatIndex: 1,
    });
    const unassigned = seatingDraftReducer(moved, {
      type: "unassignGuestFromSeat",
      guestId: "guest-1",
    });

    expect(assigned.draftChart.tables[0].seats[0].guestId).toBe("guest-1");
    expect(moved.draftChart.tables[0].seats[0].guestId).toBeUndefined();
    expect(moved.draftChart.tables[1].seats[1].guestId).toBe("guest-1");
    expect(unassigned.draftChart.tables[1].seats[1].guestId).toBeUndefined();
  });

  it("computes stats including plus-ones and unseated counts", () => {
    const guests = [
      makeGuest({
        id: "guest-1",
        plusOnes: [
          makeGuest({
            id: "guest-2",
            primaryGuestId: "guest-1",
            firstName: "Pat",
          }),
        ],
      }),
      makeGuest({
        id: "guest-3",
        firstName: "Sam",
        rsvpStatus: "pending",
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 3,
            x: 0,
            y: 0,
            seats: [
              { id: "seat-1", positionIndex: 0, guestId: "guest-1" },
              { id: "seat-2", positionIndex: 1 },
              { id: "seat-3", positionIndex: 2 },
            ],
          },
        ],
      }),
    );

    const stats = getSeatingDraftStats(state, guests);

    expect(stats.tableCount).toBe(1);
    expect(stats.seatCount).toBe(3);
    expect(stats.assignedSeatCount).toBe(1);
    expect(stats.unassignedSeatCount).toBe(2);
    expect(stats.unseatedGuestCount).toBe(2);
  });

  it("resets to the last saved chart and clears dirty state", () => {
    const saved = makeChart({
      tables: [
        {
          id: "table-1",
          name: "Saved Table",
          shape: "round",
          capacity: 2,
          x: 50,
          y: 60,
          seats: [
            { id: "seat-1", positionIndex: 0 },
            { id: "seat-2", positionIndex: 1 },
          ],
        },
      ],
    });
    const state = createSeatingDraftState(saved);
    const edited = seatingDraftReducer(state, {
      type: "addTable",
      shape: "rectangle",
    });
    const reset = seatingDraftReducer(edited, { type: "resetToSavedChart" });

    expect(reset.draftChart).toEqual(saved);
    expect(isSeatingDraftDirty(reset)).toBe(false);
  });

  it("seats a linked party together when enough seats are available", () => {
    const guests = [
      makeGuest({
        id: "guest-1",
        firstName: "Alice",
        plusOnes: [
          makeGuest({
            id: "guest-2",
            primaryGuestId: "guest-1",
            firstName: "Bob",
            rsvpStatus: "accepted",
          }),
        ],
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 4,
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
              { id: "seat-3", positionIndex: 2 },
              { id: "seat-4", positionIndex: 3 },
            ],
          },
        ],
      }),
    );

    const next = seatLinkedPartyAtTable(state, guests, "guest-1", "table-1");
    const table = next.draftChart.tables[0];

    expect(table.seats[0].guestId).toBe("guest-1");
    expect(table.seats[1].guestId).toBe("guest-2");
    expect(getSeatingDraftStats(next, guests).assignedSeatCount).toBe(2);
  });

  it("returns the original state when the table is missing or the guest has no party", () => {
    const state = createSeatingDraftState(makeChart());
    const noTable = seatLinkedPartyAtTable(state, [], "guest-1", "missing");
    const declinedOnly = seatLinkedPartyAtTable(
      createSeatingDraftState(
        makeChart({
          tables: [
            {
              id: "table-1",
              name: "Table 1",
              shape: "round",
              capacity: 2,
              x: 0,
              y: 0,
              seats: [
                { id: "seat-1", positionIndex: 0 },
                { id: "seat-2", positionIndex: 1 },
              ],
            },
          ],
        }),
      ),
      [
        makeGuest({
          id: "guest-1",
          rsvpStatus: "declined",
          plusOnes: [],
        }),
      ],
      "guest-1",
      "table-1",
    );

    expect(noTable).toBe(state);
    expect(declinedOnly.draftChart.tables[0].seats[0].guestId).toBeUndefined();
  });

  it("returns false when the guest cannot be found in the linked-party list", () => {
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 2,
            x: 0,
            y: 0,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
            ],
          },
        ],
      }),
    );

    expect(
      canSeatLinkedPartyAtTable(state, [makeGuest()], "missing", "table-1"),
    ).toBe(false);
  });

  it("returns false when the table is missing or the party is empty", () => {
    const state = createSeatingDraftState(makeChart());
    const withTable = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 2,
            x: 0,
            y: 0,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
            ],
          },
        ],
      }),
    );

    expect(
      canSeatLinkedPartyAtTable(state, [makeGuest()], "guest-1", "missing"),
    ).toBe(false);
    expect(canSeatLinkedPartyAtTable(withTable, [], "guest-1", "table-1")).toBe(
      false,
    );
  });

  it("seats a party when the selected guest is a plus-one rather than the primary", () => {
    const guests = [
      makeGuest({
        id: "guest-1",
        firstName: "Alice",
        plusOnes: [
          makeGuest({
            id: "guest-2",
            primaryGuestId: "guest-1",
            firstName: "Bob",
            rsvpStatus: "accepted",
          }),
        ],
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 4,
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
              { id: "seat-3", positionIndex: 2 },
              { id: "seat-4", positionIndex: 3 },
            ],
          },
        ],
      }),
    );

    expect(canSeatLinkedPartyAtTable(state, guests, "guest-2", "table-1")).toBe(
      true,
    );

    const next = seatLinkedPartyAtTable(state, guests, "guest-2", "table-1");

    expect(next.draftChart.tables[0].seats[0].guestId).toBe("guest-1");
    expect(next.draftChart.tables[0].seats[1].guestId).toBe("guest-2");
  });

  it("returns the state for unknown reducer actions", () => {
    const state = createSeatingDraftState(makeChart());

    expect(seatingDraftReducer(state, { type: "unknown" } as never)).toBe(
      state,
    );
  });

  it("requires contiguous seats for the linked-party assist", () => {
    const guests = [
      makeGuest({
        id: "guest-1",
        firstName: "Alice",
        plusOnes: [
          makeGuest({
            id: "guest-2",
            primaryGuestId: "guest-1",
            firstName: "Bob",
            rsvpStatus: "accepted",
          }),
        ],
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "rectangle",
            capacity: 4,
            orientation: "horizontal",
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1, guestId: "other-guest" },
              { id: "seat-3", positionIndex: 2 },
              { id: "seat-4", positionIndex: 3, guestId: "another-guest" },
            ],
          },
        ],
      }),
    );

    expect(canSeatLinkedPartyAtTable(state, guests, "guest-1", "table-1")).toBe(
      false,
    );

    const next = seatLinkedPartyAtTable(state, guests, "guest-1", "table-1");

    expect(next).toEqual(state);
  });

  it("seats linked parties on rectangle tables when a contiguous run exists", () => {
    const guests = [
      makeGuest({
        id: "guest-1",
        firstName: "Alice",
        plusOnes: [
          makeGuest({
            id: "guest-2",
            primaryGuestId: "guest-1",
            firstName: "Bob",
            rsvpStatus: "accepted",
          }),
        ],
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "rectangle",
            capacity: 4,
            orientation: "horizontal",
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
              { id: "seat-3", positionIndex: 2, guestId: "other-guest" },
              { id: "seat-4", positionIndex: 3, guestId: "another-guest" },
            ],
          },
        ],
      }),
    );

    expect(canSeatLinkedPartyAtTable(state, guests, "guest-1", "table-1")).toBe(
      true,
    );

    const next = seatLinkedPartyAtTable(state, guests, "guest-1", "table-1");

    expect(next.draftChart.tables[0].seats[0].guestId).toBe("guest-1");
    expect(next.draftChart.tables[0].seats[1].guestId).toBe("guest-2");
  });

  it("seats linked parties across wrapped round seats and checks contiguous availability", () => {
    const guests = [
      makeGuest({
        id: "guest-1",
        firstName: "Alice",
        plusOnes: [
          makeGuest({
            id: "guest-2",
            primaryGuestId: "guest-1",
            firstName: "Pat",
            rsvpStatus: "accepted",
          }),
        ],
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 4,
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1, guestId: "other-guest" },
              { id: "seat-3", positionIndex: 2, guestId: "another-guest" },
              { id: "seat-4", positionIndex: 3 },
            ],
          },
        ],
      }),
    );

    expect(canSeatLinkedPartyAtTable(state, guests, "guest-1", "table-1")).toBe(
      true,
    );

    const next = seatLinkedPartyAtTable(state, guests, "guest-1", "table-1");

    expect(next.draftChart.tables[0].seats[3].guestId).toBe("guest-1");
    expect(next.draftChart.tables[0].seats[0].guestId).toBe("guest-2");
  });

  it("returns false when checking party seating for a missing table or unknown guest", () => {
    const guests = [makeGuest()];
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Table 1",
            shape: "round",
            capacity: 2,
            x: 0,
            y: 0,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
            ],
          },
        ],
      }),
    );

    expect(canSeatLinkedPartyAtTable(state, guests, "guest-1", "missing")).toBe(
      false,
    );
    expect(
      canSeatLinkedPartyAtTable(state, guests, "unknown-guest", "table-1"),
    ).toBe(false);
  });

  it("finds contiguous seats on one side of a rectangle table", () => {
    const guests = [
      makeGuest({
        id: "guest-1",
        plusOnes: [
          makeGuest({
            id: "guest-2",
            primaryGuestId: "guest-1",
            firstName: "Pat",
            rsvpStatus: "accepted",
          }),
        ],
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({
        tables: [
          {
            id: "table-1",
            name: "Rectangle Table",
            shape: "rectangle",
            capacity: 6,
            orientation: "horizontal",
            x: 100,
            y: 100,
            seats: [
              { id: "seat-1", positionIndex: 0 },
              { id: "seat-2", positionIndex: 1 },
              { id: "seat-3", positionIndex: 2, guestId: "occupied" },
              { id: "seat-4", positionIndex: 3, guestId: "occupied-2" },
              { id: "seat-5", positionIndex: 4 },
              { id: "seat-6", positionIndex: 5 },
            ],
          },
        ],
      }),
    );

    expect(canSeatLinkedPartyAtTable(state, guests, "guest-1", "table-1")).toBe(
      true,
    );

    const next = seatLinkedPartyAtTable(state, guests, "guest-1", "table-1");

    expect(next.draftChart.tables[0].seats[0].guestId).toBe("guest-1");
    expect(next.draftChart.tables[0].seats[1].guestId).toBe("guest-2");
  });
});

describe("seatGroupAtTable", () => {
  function makeTable8(id = "table-1") {
    return {
      id,
      name: "Table 1",
      shape: "round" as const,
      capacity: 8,
      x: 100,
      y: 100,
      seats: Array.from({ length: 8 }, (_, i) => ({
        id: `seat-${i + 1}`,
        positionIndex: i,
      })),
    };
  }

  it("seats all eligible unseated guests from a group at a table", () => {
    const guests = [
      makeGuest({
        id: "g1",
        groupName: "Rivera Family",
        primaryGuestId: null,
        plusOnes: [],
      }),
      makeGuest({
        id: "g2",
        groupName: "Rivera Family",
        primaryGuestId: null,
        plusOnes: [],
      }),
      makeGuest({
        id: "g3",
        groupName: "Other Group",
        primaryGuestId: null,
        plusOnes: [],
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({ tables: [makeTable8()] }),
    );

    const result = seatGroupAtTable(state, guests, "Rivera Family", "table-1");

    expect(result.unseatedCount).toBe(0);
    const seatedIds = result.draftChart.tables[0].seats
      .filter((s) => s.guestId)
      .map((s) => s.guestId);
    expect(seatedIds).toContain("g1");
    expect(seatedIds).toContain("g2");
    expect(seatedIds).not.toContain("g3");
  });

  it("stops adding guests when table is full; returns correct unseatedCount", () => {
    const smallTable = {
      id: "table-1",
      name: "Small Table",
      shape: "round" as const,
      capacity: 2,
      x: 100,
      y: 100,
      seats: [
        { id: "seat-1", positionIndex: 0 },
        { id: "seat-2", positionIndex: 1 },
      ],
    };
    const guests = [
      makeGuest({
        id: "g1",
        groupName: "Big Family",
        primaryGuestId: null,
        plusOnes: [],
      }),
      makeGuest({
        id: "g2",
        groupName: "Big Family",
        primaryGuestId: null,
        plusOnes: [],
      }),
      makeGuest({
        id: "g3",
        groupName: "Big Family",
        primaryGuestId: null,
        plusOnes: [],
      }),
    ];
    const state = createSeatingDraftState(makeChart({ tables: [smallTable] }));

    const result = seatGroupAtTable(state, guests, "Big Family", "table-1");

    expect(result.unseatedCount).toBe(1);
  });

  it("skips households where the primary guest is already seated", () => {
    const tableWithG1 = {
      id: "table-1",
      name: "Table 1",
      shape: "round" as const,
      capacity: 8,
      x: 100,
      y: 100,
      seats: [
        { id: "seat-1", positionIndex: 0, guestId: "g1" },
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `seat-${i + 2}`,
          positionIndex: i + 1,
        })),
      ],
    };
    const guests = [
      makeGuest({
        id: "g1",
        groupName: "Rivera",
        primaryGuestId: null,
        plusOnes: [],
      }),
      makeGuest({
        id: "g2",
        groupName: "Rivera",
        primaryGuestId: null,
        plusOnes: [],
      }),
    ];
    const state = createSeatingDraftState(makeChart({ tables: [tableWithG1] }));

    const result = seatGroupAtTable(state, guests, "Rivera", "table-1");

    // g1 remains in seat-1 (index 0) unchanged
    expect(result.draftChart.tables[0].seats[0].guestId).toBe("g1");
    // g2 was unseated before the call, now should be seated
    const seatedIds = result.draftChart.tables[0].seats
      .filter((s) => s.guestId)
      .map((s) => s.guestId);
    expect(seatedIds).toContain("g2");
    expect(result.unseatedCount).toBe(0);
  });

  it("skips households where a plus-one is already seated", () => {
    const tableWithPo1 = {
      id: "table-1",
      name: "Table 1",
      shape: "round" as const,
      capacity: 8,
      x: 100,
      y: 100,
      seats: [
        { id: "seat-1", positionIndex: 0, guestId: "po1" },
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `seat-${i + 2}`,
          positionIndex: i + 1,
        })),
      ],
    };
    const plusOne = makeGuest({
      id: "po1",
      primaryGuestId: "g1",
      groupName: "Smith",
    });
    const guests = [
      makeGuest({
        id: "g1",
        groupName: "Smith",
        primaryGuestId: null,
        plusOnes: [plusOne],
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({ tables: [tableWithPo1] }),
    );

    const result = seatGroupAtTable(state, guests, "Smith", "table-1");

    // g1's household already has po1 seated, so g1 should NOT be additionally placed
    const seatedIds = result.draftChart.tables[0].seats
      .filter((s) => s.guestId)
      .map((s) => s.guestId);
    // po1 is already there, g1 should NOT be added again
    expect(seatedIds.filter((id) => id === "g1")).toHaveLength(0);
  });

  it("returns unseatedCount: 0 when all group guests fit", () => {
    const guests = [
      makeGuest({
        id: "g1",
        groupName: "Solo",
        primaryGuestId: null,
        plusOnes: [],
      }),
    ];
    const state = createSeatingDraftState(
      makeChart({ tables: [makeTable8()] }),
    );

    const result = seatGroupAtTable(state, guests, "Solo", "table-1");

    expect(result.unseatedCount).toBe(0);
  });

  it("returns original draftChart unchanged when group has no unseated guests", () => {
    const tableWithG1 = {
      id: "table-1",
      name: "Table 1",
      shape: "round" as const,
      capacity: 8,
      x: 100,
      y: 100,
      seats: [
        { id: "seat-1", positionIndex: 0, guestId: "g1" },
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `seat-${i + 2}`,
          positionIndex: i + 1,
        })),
      ],
    };
    const guests = [
      makeGuest({
        id: "g1",
        groupName: "Preseated",
        primaryGuestId: null,
        plusOnes: [],
      }),
    ];
    const state = createSeatingDraftState(makeChart({ tables: [tableWithG1] }));

    const result = seatGroupAtTable(state, guests, "Preseated", "table-1");

    expect(result.draftChart).toEqual(state.draftChart);
    expect(result.unseatedCount).toBe(0);
  });

  it("deleteTable removes the table from the draft", () => {
    const state = createSeatingDraftState(makeChart());
    const withTable = seatingDraftReducer(state, {
      type: "addTable",
      shape: "round",
    });
    const tableId = withTable.draftChart.tables[0].id;

    const deleted = seatingDraftReducer(withTable, {
      type: "deleteTable",
      tableId,
    });

    expect(deleted.draftChart.tables).toHaveLength(0);
    expect(deleted.selectedTableId).toBeNull();
  });

  it("deleteTable leaves an unrelated selection alone", () => {
    const state = createSeatingDraftState(makeChart());
    const first = seatingDraftReducer(state, {
      type: "addTable",
      shape: "round",
    });
    const firstId = first.draftChart.tables[0].id;
    const second = seatingDraftReducer(first, {
      type: "addTable",
      shape: "rectangle",
    });
    const secondId = second.draftChart.tables[1].id;
    const selectedFirst = seatingDraftReducer(second, {
      type: "selectTable",
      tableId: firstId,
    });

    const afterDelete = seatingDraftReducer(selectedFirst, {
      type: "deleteTable",
      tableId: secondId,
    });

    expect(afterDelete.draftChart.tables).toHaveLength(1);
    expect(afterDelete.draftChart.tables[0].id).toBe(firstId);
    expect(afterDelete.selectedTableId).toBe(firstId);
  });
});
