# Seating UX Improvements Implementation Plan


**Goal:** Add three UX improvements to the seating editor: (1) unassign button on occupied seat chips in the table canvas, (2) "Seated" section in the guest rail search showing where assigned guests sit, (3) auto-seat-group button for seating all unseated members of a group at the selected table.

**Architecture:** `seatGroupAtTable` helper added to `apps/app/src/lib/seating-draft.ts`. All UI changes in `apps/app/src/components/seating/seating-editor.tsx` (`SeatNode`/`GuestChip` for unassign, guest rail for seated search section, Inspector panel for auto-seat button). No API or schema changes.

**Tech Stack:** React 19, @dnd-kit, Lucide React, Tailwind CSS 4, Vitest + Testing Library

---

## Task 1: `seatGroupAtTable` helper in `seating-draft.ts`

**Files:**
- Modify: `apps/app/src/lib/seating-draft.ts`
- Modify: `apps/app/__tests__/lib/seating-draft.test.ts`

The `seatLinkedPartyAtTable` function at line 301 returns a full `SeatingDraftState`. The new `seatGroupAtTable` function returns `{ draftChart: SeatingChart; unseatedCount: number }` — this is intentional and must NOT be unified with `seatLinkedPartyAtTable`.

- [ ] **Step 1: Read the existing seating-draft.test.ts to understand test patterns**

  Read `apps/app/__tests__/lib/seating-draft.test.ts` to understand how test state/guest fixtures are built.

- [ ] **Step 2: Write failing tests**

  Add to `apps/app/__tests__/lib/seating-draft.test.ts` in a `describe("seatGroupAtTable")` block:

  ```typescript
  import { seatGroupAtTable } from "../../src/lib/seating-draft";
  // (import alongside existing imports — check exact import path in the test file)

  describe("seatGroupAtTable", () => {
    // Helper: build a minimal state with one table
    function makeState(tableCapacity = 8) {
      // Use the same makeChart/makeTable patterns as existing tests in this file
      // Build a SeatingDraftState with one table of given capacity
      // All seats empty
    }

    // Helper: build GuestWithPlusOnes fixture
    function makeGuest(id: string, groupName: string, plusOneIds: string[] = []): GuestWithPlusOnes {
      return {
        id,
        firstName: `Guest${id}`,
        lastName: "Test",
        email: null,
        rsvpStatus: "accepted",
        groupName,
        groupCue: groupName,
        partyLabel: null,
        sideLabel: null,
        primaryGuestId: null,
        plusOnes: plusOneIds.map((poId) => ({
          id: poId,
          firstName: `PlusOne${poId}`,
          lastName: "Test",
          email: null,
          rsvpStatus: "accepted",
          groupName,
          groupCue: groupName,
          partyLabel: null,
          sideLabel: null,
          primaryGuestId: id,
          plusOnes: [],
        })),
      };
    }

    it("seats all eligible unseated guests from a group at a table with sufficient capacity", () => {
      const state = makeState(8);
      const tableId = state.draftChart.tables[0].id;
      const guests = [
        makeGuest("g1", "Rivera Family"),
        makeGuest("g2", "Rivera Family"),
        makeGuest("g3", "Other Group"),
      ];

      const result = seatGroupAtTable(state, guests, "Rivera Family", tableId);

      expect(result.unseatedCount).toBe(0);
      const seatedIds = result.draftChart.tables[0].seats
        .map((s) => s.guestId)
        .filter(Boolean);
      expect(seatedIds).toContain("g1");
      expect(seatedIds).toContain("g2");
      expect(seatedIds).not.toContain("g3");
    });

    it("stops adding guests when the table is full; returns correct unseatedCount", () => {
      const state = makeState(2); // only 2 seats
      const tableId = state.draftChart.tables[0].id;
      const guests = [
        makeGuest("g1", "Big Family"),
        makeGuest("g2", "Big Family"),
        makeGuest("g3", "Big Family"), // won't fit
      ];

      const result = seatGroupAtTable(state, guests, "Big Family", tableId);

      // 2 fit, 1 cannot
      expect(result.unseatedCount).toBe(1);
    });

    it("skips households where any member is already seated", () => {
      // Pre-seat g1 by assigning guestId in the state
      const state = makeState(8);
      const tableId = state.draftChart.tables[0].id;
      // Manually assign g1 to seat 0
      const stateWithG1Seated = {
        ...state,
        draftChart: {
          ...state.draftChart,
          tables: state.draftChart.tables.map((t) => ({
            ...t,
            seats: t.seats.map((s, i) =>
              i === 0 ? { ...s, guestId: "g1" } : s,
            ),
          })),
        },
      };
      const guests = [makeGuest("g1", "Rivera"), makeGuest("g2", "Rivera")];

      const result = seatGroupAtTable(stateWithG1Seated, guests, "Rivera", tableId);

      // g1 already seated — skip household; g2 should be seated (different household)
      const seatedIds = result.draftChart.tables[0].seats
        .map((s) => s.guestId)
        .filter(Boolean);
      expect(seatedIds).toContain("g1"); // unchanged from pre-seat
      expect(seatedIds).toContain("g2");
    });

    it("skips households where a plus-one is already seated", () => {
      const state = makeState(8);
      const tableId = state.draftChart.tables[0].id;
      // Pre-seat plus-one "po1" of primary guest "g1"
      const stateWithPo1Seated = {
        ...state,
        draftChart: {
          ...state.draftChart,
          tables: state.draftChart.tables.map((t) => ({
            ...t,
            seats: t.seats.map((s, i) =>
              i === 0 ? { ...s, guestId: "po1" } : s,
            ),
          })),
        },
      };
      const guests = [makeGuest("g1", "Smith", ["po1"])];

      const result = seatGroupAtTable(stateWithPo1Seated, guests, "Smith", tableId);

      // g1's household has po1 already seated → skip g1's household entirely
      const seatedIds = result.draftChart.tables[0].seats
        .map((s) => s.guestId)
        .filter(Boolean);
      // Should still have po1 in seat 0, but g1 should NOT be newly seated
      expect(seatedIds).toContain("po1");
      expect(seatedIds).not.toContain("g1");
    });

    it("returns unseatedCount: 0 when all guests in the group fit", () => {
      const state = makeState(8);
      const tableId = state.draftChart.tables[0].id;
      const guests = [makeGuest("g1", "Tiny Group")];

      const result = seatGroupAtTable(state, guests, "Tiny Group", tableId);

      expect(result.unseatedCount).toBe(0);
    });

    it("returns original draftChart unchanged when group has no unseated guests", () => {
      const state = makeState(8);
      const tableId = state.draftChart.tables[0].id;
      // Pre-seat g1
      const stateWithG1 = {
        ...state,
        draftChart: {
          ...state.draftChart,
          tables: state.draftChart.tables.map((t) => ({
            ...t,
            seats: t.seats.map((s, i) =>
              i === 0 ? { ...s, guestId: "g1" } : s,
            ),
          })),
        },
      };
      const guests = [makeGuest("g1", "Solo Group")];

      const result = seatGroupAtTable(stateWithG1, guests, "Solo Group", tableId);

      expect(result.unseatedCount).toBe(0);
      expect(result.draftChart).toEqual(stateWithG1.draftChart);
    });
  });
  ```

  **Important:** Adapt `makeState`, `makeGuest` to use whatever factory helpers already exist in the test file. Read the test file first.

- [ ] **Step 3: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/lib/seating-draft.test.ts
  ```

  Expected: `seatGroupAtTable` not found.

- [ ] **Step 4: Implement `seatGroupAtTable` in `seating-draft.ts`**

  Add after `canSeatLinkedPartyAtTable` (line ~353):

  ```typescript
  export function seatGroupAtTable(
    state: SeatingDraftState,
    guests: GuestWithPlusOnes[],
    groupName: string,
    tableId: string,
  ): { draftChart: SeatingChart; unseatedCount: number } {
    // All assigned guest IDs in the current state
    const assignedIds = new Set(
      state.draftChart.tables.flatMap((table) =>
        table.seats.flatMap((seat) => (seat.guestId ? [seat.guestId] : [])),
      ),
    );

    // Filter to primary guests in the group
    const groupPrimaries = guests.filter(
      (g) => g.groupName === groupName && g.primaryGuestId === null,
    );

    let currentState = state;
    let unseatedCount = 0;

    for (const primary of groupPrimaries) {
      // Skip if any household member (primary or plus-ones) is already seated
      const householdIds = [primary.id, ...primary.plusOnes.map((po) => po.id)];
      const householdAlreadySeated = householdIds.some((id) =>
        assignedIds.has(id),
      );
      if (householdAlreadySeated) {
        continue;
      }

      // Try to seat the household via seatLinkedPartyAtTable
      const nextState = seatLinkedPartyAtTable(
        currentState,
        guests,
        primary.id,
        tableId,
      );

      if (nextState === currentState) {
        // Table is full — couldn't seat this household
        unseatedCount += 1;
      } else {
        currentState = nextState;
        // Update assignedIds for subsequent iterations
        householdIds.forEach((id) => assignedIds.add(id));
      }
    }

    return { draftChart: currentState.draftChart, unseatedCount };
  }
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/lib/seating-draft.test.ts
  ```

- [ ] **Step 6: Check coverage for seating-draft.ts**

  ```bash
  pnpm --filter @kaiplan/app test:coverage -- --reporter=text 2>&1 | grep seating-draft
  ```

  Expected: ≥ 95%.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/app/src/lib/seating-draft.ts apps/app/__tests__/lib/seating-draft.test.ts
  git commit -m "feat(app): add seatGroupAtTable helper to seating-draft"
  ```

---

## Task 2: Unassign button on occupied seat chips

**Files:**
- Modify: `apps/app/src/components/seating/seating-editor.tsx`
- Create: `apps/app/__tests__/components/seating/seating-editor.test.tsx`

The `SeatNode` component (line 243) renders a `GuestChip` over the seat when occupied. Add an `×` button inside the chip that dispatches `unassignGuestFromSeat`. The button needs `e.stopPropagation()` to avoid triggering the DnD drag sensor.

The `dispatch` function lives in `SeatingEditor` (the parent). The `SeatNode` currently receives only `tableId`, `seatIndex`, `label`, `left`, `top`, `guest`, `selectedGuestId`, `onGuestSelect`. Add an `onUnassign` callback prop.

- [ ] **Step 1: Write failing tests**

  Create `apps/app/__tests__/components/seating/seating-editor.test.tsx`.

  **Important:** Read existing test files (e.g., `apps/app/__tests__/components/seating/`) to find how `SeatingEditor` is typically rendered in tests. Check if there's an existing test file to build on.

  If no existing test file, use this pattern:

  ```tsx
  import { describe, expect, it, vi } from "vitest";
  import { render, screen, fireEvent } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { SeatingEditor } from "../../../src/components/seating/seating-editor";
  import type { SeatingChart, GuestWithPlusOnes } from "@kaiplan/shared";

  function makeEmptyChart(): SeatingChart {
    return {
      id: "chart-1",
      weddingId: "w-1",
      version: 1,
      width: 1200,
      height: 800,
      tables: [],
    };
  }

  function makeChartWithSeat(guestId: string): SeatingChart {
    return {
      ...makeEmptyChart(),
      tables: [
        {
          id: "table-1",
          name: "Table 1",
          shape: "round",
          capacity: 8,
          x: 100,
          y: 100,
          seats: [
            { id: "seat-1", positionIndex: 0, guestId },
            ...Array.from({ length: 7 }, (_, i) => ({
              id: `seat-${i + 2}`,
              positionIndex: i + 1,
              guestId: undefined,
            })),
          ],
        },
      ],
    };
  }

  const avaGuest: GuestWithPlusOnes = {
    id: "guest-ava",
    firstName: "Ava",
    lastName: "Rivera",
    email: "ava@example.com",
    rsvpStatus: "accepted",
    groupName: "Rivera Family",
    groupCue: "Rivera Family",
    partyLabel: null,
    sideLabel: null,
    primaryGuestId: null,
    plusOnes: [],
  };

  describe("SeatingEditor — unassign button", () => {
    it("renders an unassign button on each occupied seat chip", () => {
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[avaGuest]}
          initialChart={makeChartWithSeat("guest-ava")}
          onSave={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("button", { name: /unassign ava rivera/i }),
      ).toBeInTheDocument();
    });

    it("clicking unassign removes guest from seat and they reappear in the guest rail", async () => {
      const user = userEvent.setup();
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[avaGuest]}
          initialChart={makeChartWithSeat("guest-ava")}
          onSave={vi.fn()}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /unassign ava rivera/i }),
      );

      // Ava should now appear in the unseated guest rail
      expect(screen.getByText("Ava Rivera")).toBeInTheDocument();
      // Unassign button should be gone
      expect(
        screen.queryByRole("button", { name: /unassign ava rivera/i }),
      ).not.toBeInTheDocument();
    });

    it("unassign button click does not trigger drag behaviour (stopPropagation)", () => {
      // Render and click the unassign button using fireEvent — verify no drag state changes
      const { container } = render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[avaGuest]}
          initialChart={makeChartWithSeat("guest-ava")}
          onSave={vi.fn()}
        />,
      );

      const btn = screen.getByRole("button", { name: /unassign ava rivera/i });
      const clickEvent = new MouseEvent("click", { bubbles: true });
      const stopPropagationSpy = vi.spyOn(clickEvent, "stopPropagation");
      btn.dispatchEvent(clickEvent);
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/seating/seating-editor.test.tsx
  ```

- [ ] **Step 3: Modify `SeatNode` to accept and forward `onUnassign`**

  In `seating-editor.tsx`, add `onUnassign` to `SeatNode`'s props interface:

  ```typescript
  function SeatNode({
    tableId,
    seatIndex,
    label,
    left,
    top,
    guest,
    selectedGuestId,
    onGuestSelect,
    onUnassign,  // NEW
  }: {
    tableId: string;
    seatIndex: number;
    label: string;
    left: number;
    top: number;
    guest: FlatGuest | null;
    selectedGuestId: string | null;
    onGuestSelect: (guestId: string) => void;
    onUnassign?: (guestId: string) => void;  // NEW — optional to avoid breaking callers
  }) {
  ```

  Inside the `{guest ? ... : null}` block in `SeatNode`, add the unassign button alongside `GuestChip`:

  ```tsx
  {guest ? (
    <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
      <div className="relative">
        <GuestChip
          guest={guest}
          selected={guest.id === selectedGuestId}
          compact
          onClick={() => onGuestSelect(guest.id)}
        />
        {onUnassign ? (
          <button
            type="button"
            aria-label={`Unassign ${guest.firstName} ${guest.lastName}`}
            onClick={(e) => {
              e.stopPropagation();
              onUnassign(guest.id);
            }}
            className="absolute -right-1 -top-1 z-20 rounded-full bg-background p-0.5 text-muted-foreground shadow hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </div>
  ) : null}
  ```

  Add `X` to the Lucide imports at the top of the file.

- [ ] **Step 4: Wire `onUnassign` in `TableCard`**

  `TableCard` calls `SeatNode`. Add `onUnassign` to `TableCard`'s props and forward it:

  ```typescript
  function TableCard({
    table,
    selected,
    assignedGuests,
    selectedGuestId,
    onSelect,
    onGuestSelect,
    onUnassign,  // NEW
  }: {
    // ... existing props
    onUnassign: (guestId: string) => void;  // NEW
  }) {
  ```

  Pass it to `SeatNode`:
  ```tsx
  <SeatNode
    key={seat.id}
    tableId={table.id}
    seatIndex={seatIndex}
    label={...}
    left={coordinates.left}
    top={coordinates.top}
    guest={guest}
    selectedGuestId={selectedGuestId}
    onGuestSelect={onGuestSelect}
    onUnassign={onUnassign}  // NEW
  />
  ```

- [ ] **Step 5: Wire `onUnassign` dispatch in `SeatingEditor`'s `TableCard` usage**

  In `SeatingEditor`'s return JSX, where `TableCard` is rendered (around line 825):

  ```tsx
  <TableCard
    key={table.id}
    table={table}
    selected={table.id === state.selectedTableId}
    assignedGuests={assignedGuestMap}
    selectedGuestId={selectedGuestId}
    onSelect={() =>
      dispatch({ type: "selectTable", tableId: table.id })
    }
    onGuestSelect={setSelectedGuestId}
    onUnassign={(guestId) =>
      dispatch({ type: "unassignGuestFromSeat", guestId })
    }
  />
  ```

- [ ] **Step 6: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/seating/seating-editor.test.tsx
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add apps/app/src/components/seating/seating-editor.tsx apps/app/__tests__/components/seating/seating-editor.test.tsx
  git commit -m "feat(app): add unassign button to occupied seat chips in seating editor"
  ```

---

## Task 3: "Seated" search section in guest rail

**Files:**
- Modify: `apps/app/src/components/seating/seating-editor.tsx`
- Modify: `apps/app/__tests__/components/seating/seating-editor.test.tsx`

When `search` has ≥1 character, derive `seatedMatchingGuests` — guests who are in the `assignedGuestIds` set and whose name matches the search string. Show them in a "Seated" section below the unseated list. Clicking a seated guest row dispatches `{ type: "selectTable", tableId }` using reducer state, NOT a new `useState`.

- [ ] **Step 1: Write failing tests**

  Add to `apps/app/__tests__/components/seating/seating-editor.test.tsx`:

  ```typescript
  describe("SeatingEditor — seated guest search", () => {
    it("shows a Seated section when search matches an assigned guest", async () => {
      const user = userEvent.setup();
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[avaGuest]}
          initialChart={makeChartWithSeat("guest-ava")}
          onSave={vi.fn()}
        />,
      );

      await user.type(
        screen.getByPlaceholderText(/search guests/i),
        "Ava",
      );

      expect(screen.getByText("Seated")).toBeInTheDocument();
      // Should show Ava Rivera with the table name
      expect(screen.getByText(/ava rivera/i)).toBeInTheDocument();
      expect(screen.getByText(/table 1/i)).toBeInTheDocument();
    });

    it("does not show Seated section when search is empty", () => {
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[avaGuest]}
          initialChart={makeChartWithSeat("guest-ava")}
          onSave={vi.fn()}
        />,
      );
      expect(screen.queryByText("Seated")).not.toBeInTheDocument();
    });

    it("clicking a seated guest row selects that table in the workspace", async () => {
      const user = userEvent.setup();
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[avaGuest]}
          initialChart={makeChartWithSeat("guest-ava")}
          onSave={vi.fn()}
        />,
      );

      await user.type(
        screen.getByPlaceholderText(/search guests/i),
        "Ava",
      );

      const seatedRow = screen.getByRole("button", { name: /ava rivera.*table 1/i });
      await user.click(seatedRow);

      // Table 1 should now be selected — it gets the selected ring/border
      // The TableCard for table-1 should have a selected class/aria indicator
      // (Check the actual rendered output and match accordingly)
      expect(screen.getAllByText("Table 1").length).toBeGreaterThan(0);
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/seating/seating-editor.test.tsx
  ```

- [ ] **Step 3: Add `seatedMatchingGuests` derivation in `SeatingEditor`**

  After the `unseatedGuests` useMemo (line ~429), add:

  ```typescript
  const seatedMatchingGuests = useMemo(() => {
    if (search.trim().length === 0) return [];
    return flatGuests
      .filter((guest) => {
        if (!assignedGuestIds.has(guest.id)) return false;
        const fullName = `${guest.firstName} ${guest.lastName}`.toLowerCase();
        return fullName.includes(search.toLowerCase());
      })
      .map((guest) => {
        const table = state.draftChart.tables.find((t) =>
          t.seats.some((s) => s.guestId === guest.id),
        );
        return { guest, table: table ?? null };
      });
  }, [search, flatGuests, assignedGuestIds, state.draftChart.tables]);
  ```

- [ ] **Step 4: Render the "Seated" section in the guest rail JSX**

  After the unseated guests `<div className="space-y-2">...</div>` block (line ~777), add:

  ```tsx
  {seatedMatchingGuests.length > 0 ? (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Seated
      </p>
      {seatedMatchingGuests.map(({ guest, table }) => (
        <button
          key={guest.id}
          type="button"
          aria-label={`${guest.firstName} ${guest.lastName} — ${table?.name ?? "Unknown table"}`}
          onClick={() => {
            if (table) {
              dispatch({ type: "selectTable", tableId: table.id });
            }
          }}
          className="w-full rounded-lg border border-border bg-secondary/10 px-3 py-2 text-left text-sm hover:bg-secondary/20"
        >
          <span className="font-medium text-foreground">
            {guest.firstName} {guest.lastName}
          </span>
          {table ? (
            <span className="ml-2 text-xs text-muted-foreground">
              — {table.name}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  ) : null}
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/seating/seating-editor.test.tsx
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/app/src/components/seating/seating-editor.tsx apps/app/__tests__/components/seating/seating-editor.test.tsx
  git commit -m "feat(app): show seated guests in search results with table location"
  ```

---

## Task 4: Auto-seat group button

**Files:**
- Modify: `apps/app/src/components/seating/seating-editor.tsx`
- Modify: `apps/app/__tests__/components/seating/seating-editor.test.tsx`

When a table is selected AND `search` exactly matches a group name AND there are unseated guests in that group, show an "Seat all N from X here" button in the Inspector panel. On click, call `seatGroupAtTable` and dispatch `replaceDraftChart`. If `unseatedCount > 0`, show an inline message. Use `useState<string | null>(null)` for `seatGroupMessage`. Clear it on `selectedTable` or `search` change.

- [ ] **Step 1: Write failing tests**

  Add to `apps/app/__tests__/components/seating/seating-editor.test.tsx`:

  ```typescript
  function makeChartWithSelectedTable(): SeatingChart {
    return {
      ...makeEmptyChart(),
      tables: [
        {
          id: "table-1",
          name: "Table 1",
          shape: "round",
          capacity: 2,  // small to test overflow
          x: 100,
          y: 100,
          seats: [
            { id: "seat-1", positionIndex: 0, guestId: undefined },
            { id: "seat-2", positionIndex: 1, guestId: undefined },
          ],
        },
      ],
    };
  }

  const samGuest: GuestWithPlusOnes = {
    id: "guest-sam",
    firstName: "Sam",
    lastName: "Rivera",
    email: null,
    rsvpStatus: "accepted",
    groupName: "Rivera Family",
    groupCue: "Rivera Family",
    partyLabel: null,
    sideLabel: null,
    primaryGuestId: null,
    plusOnes: [],
  };

  describe("SeatingEditor — auto-seat group", () => {
    it("shows auto-seat button when a table is selected and search exactly matches a group name with unseated guests", async () => {
      const user = userEvent.setup();
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[
            { ...avaGuest, groupName: "Rivera Family" },
            { ...samGuest, groupName: "Rivera Family" },
          ]}
          initialChart={makeChartWithSelectedTable()}
          onSave={vi.fn()}
        />,
      );

      // Select table 1
      await user.click(screen.getByRole("button", { name: /table 1/i }));

      // Type exact group name
      await user.type(screen.getByPlaceholderText(/search guests/i), "Rivera Family");

      expect(
        screen.getByRole("button", { name: /seat all.*rivera family.*here/i }),
      ).toBeInTheDocument();
    });

    it("auto-seat button is NOT shown when no table is selected", async () => {
      const user = userEvent.setup();
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[{ ...avaGuest, groupName: "Rivera Family" }]}
          initialChart={makeEmptyChart()}
          onSave={vi.fn()}
        />,
      );

      await user.type(screen.getByPlaceholderText(/search guests/i), "Rivera Family");

      expect(
        screen.queryByRole("button", { name: /seat all.*here/i }),
      ).not.toBeInTheDocument();
    });

    it("auto-seat button is NOT shown when search doesn't exactly match a group", async () => {
      const user = userEvent.setup();
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[{ ...avaGuest, groupName: "Rivera Family" }]}
          initialChart={makeChartWithSelectedTable()}
          onSave={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /table 1/i }));
      await user.type(screen.getByPlaceholderText(/search guests/i), "Rivera"); // partial match

      expect(
        screen.queryByRole("button", { name: /seat all.*here/i }),
      ).not.toBeInTheDocument();
    });

    it("clicking auto-seat seats guests and shows overflow message when some couldn't fit", async () => {
      const user = userEvent.setup();
      const thirdGuest: GuestWithPlusOnes = {
        id: "guest-bob",
        firstName: "Bob",
        lastName: "Rivera",
        email: null,
        rsvpStatus: "accepted",
        groupName: "Rivera Family",
        groupCue: "Rivera Family",
        partyLabel: null,
        sideLabel: null,
        primaryGuestId: null,
        plusOnes: [],
      };
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[
            { ...avaGuest, groupName: "Rivera Family" },
            { ...samGuest, groupName: "Rivera Family" },
            thirdGuest,
          ]}
          initialChart={makeChartWithSelectedTable()} // capacity 2
          onSave={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /table 1/i }));
      await user.type(screen.getByPlaceholderText(/search guests/i), "Rivera Family");
      await user.click(
        screen.getByRole("button", { name: /seat all.*rivera family.*here/i }),
      );

      // Overflow message should appear
      expect(
        screen.getByText(/could not be seated/i),
      ).toBeInTheDocument();
    });

    it("overflow message clears when search query changes", async () => {
      const user = userEvent.setup();
      const thirdGuest: GuestWithPlusOnes = {
        id: "guest-bob",
        firstName: "Bob",
        lastName: "Rivera",
        email: null,
        rsvpStatus: "accepted",
        groupName: "Rivera Family",
        groupCue: "Rivera Family",
        partyLabel: null,
        sideLabel: null,
        primaryGuestId: null,
        plusOnes: [],
      };
      render(
        <SeatingEditor
          weddingName="Test Wedding"
          guests={[
            { ...avaGuest, groupName: "Rivera Family" },
            { ...samGuest, groupName: "Rivera Family" },
            thirdGuest,
          ]}
          initialChart={makeChartWithSelectedTable()}
          onSave={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: /table 1/i }));
      await user.type(screen.getByPlaceholderText(/search guests/i), "Rivera Family");
      await user.click(
        screen.getByRole("button", { name: /seat all.*rivera family.*here/i }),
      );
      expect(screen.getByText(/could not be seated/i)).toBeInTheDocument();

      // Clear and retype — message should vanish
      await user.clear(screen.getByPlaceholderText(/search guests/i));
      expect(screen.queryByText(/could not be seated/i)).not.toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/seating/seating-editor.test.tsx
  ```

- [ ] **Step 3: Add state and logic to `SeatingEditor`**

  In `SeatingEditor`, add new state after existing state declarations:

  ```typescript
  const [seatGroupMessage, setSeatGroupMessage] = useState<string | null>(null);
  ```

  Add a `useEffect` to clear the message when table or search changes:

  ```typescript
  useEffect(() => {
    setSeatGroupMessage(null);
  }, [state.selectedTableId, search]);
  ```

  Add a derived `unseatedGroupCount` in the component:

  ```typescript
  const unseatedGroupCount = useMemo(() => {
    if (!selectedTable || search.trim() === "") return 0;
    return flatGuests.filter(
      (g) =>
        g.groupName === search.trim() &&
        g.primaryGuestId === null &&
        !assignedGuestIds.has(g.id),
    ).length;
  }, [selectedTable, search, flatGuests, assignedGuestIds]);
  ```

  Add a `handleSeatGroup` function:

  ```typescript
  function handleSeatGroup() {
    if (!selectedTable) return;
    const groupName = search.trim();
    const { draftChart, unseatedCount } = seatGroupAtTable(
      state,
      guests,
      groupName,
      selectedTable.id,
    );
    dispatch({ type: "replaceDraftChart", chart: draftChart });
    if (unseatedCount > 0) {
      setSeatGroupMessage(
        `${unseatedCount} guest(s) could not be seated — table may be full.`,
      );
    }
  }
  ```

  Add `import { seatGroupAtTable } from "../../lib/seating-draft";` to the imports (alongside existing seating-draft imports).

- [ ] **Step 4: Render the auto-seat button in the Inspector panel**

  In the Inspector panel JSX, after the "Seat linked party here" button block (which is inside `{selectedGuest ? ... : null}` around line 960), add the group auto-seat button OUTSIDE the selectedGuest block but INSIDE the `{selectedTable ? ... : null}` block:

  ```tsx
  {selectedTable && unseatedGroupCount > 0 && search.trim().length > 0 &&
    flatGuests.some((g) => g.groupName === search.trim()) ? (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleSeatGroup}
      >
        Seat all {unseatedGroupCount} from &quot;{search.trim()}&quot; here
      </Button>
      {seatGroupMessage ? (
        <p className="mt-2 text-xs text-muted-foreground">{seatGroupMessage}</p>
      ) : null}
    </div>
  ) : null}
  ```

  **Important:** The button should only show when `search` exactly matches a group name. The condition `flatGuests.some((g) => g.groupName === search.trim())` handles this — it checks for an exact match against `groupName` field.

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/seating/seating-editor.test.tsx
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/app/src/components/seating/seating-editor.tsx apps/app/__tests__/components/seating/seating-editor.test.tsx
  git commit -m "feat(app): add auto-seat group button to seating inspector"
  ```

---

## Task 5: Full quality gate

- [ ] **Step 1: Run app tests and coverage**

  ```bash
  pnpm --filter @kaiplan/app test:coverage -- --reporter=text 2>&1 | grep -E "seating-draft|seating-editor"
  ```

  Expected: `seating-draft.ts` ≥ 95%, `seating-editor.tsx` ≥ 95%.

- [ ] **Step 2: Run typecheck and lint**

  ```bash
  pnpm run typecheck && pnpm run lint
  ```

- [ ] **Step 3: Fix any coverage gaps or type errors**

  If `seating-editor.tsx` is below 95%, read the coverage report, identify uncovered lines, and add targeted tests in `seating-editor.test.tsx`.

- [ ] **Step 4: Commit any fixes**

  ```bash
  git add apps/app/
  git commit -m "test(app): close coverage gaps on seating-editor and seating-draft"
  ```

---

## Verification

1. `pnpm --filter @kaiplan/app test:coverage` — `seating-draft.ts` and `seating-editor.tsx` ≥ 95%
2. `pnpm run typecheck` — clean
3. `pnpm run lint` — clean
4. Occupied seat chips have a small `×` button visible
5. Clicking `×` removes the guest and they reappear in the unseated rail
6. Typing a seated guest's name in search shows a "Seated" section with table name
7. Clicking the seated guest row highlights their table in the workspace
8. Typing an exact group name while a table is selected shows the auto-seat button
9. Auto-seat button seats available guests; overflow message appears if table fills up
