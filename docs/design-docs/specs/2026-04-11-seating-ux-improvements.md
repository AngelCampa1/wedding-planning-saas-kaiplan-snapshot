# Seating Chart UX Improvements


**Goal:** Surface three missing UX features in the seating editor: (1) unassign a guest from a seat directly from the table view, (2) locate which table a guest is assigned to from the guest panel, (3) auto-seat all guests in a group at a chosen table.

**Architecture:** All changes in `apps/app/src/components/seating/seating-editor.tsx` and `apps/app/src/lib/seating-draft.ts`. The `unassignGuestFromSeat` action already exists in the reducer — it just has no UI trigger. No API changes. No schema changes.

**Tech Stack:** React 19, @dnd-kit, Lucide React, Tailwind CSS 4

---

## Prerequisite: Understand existing state shape

Before implementing, read:
- `apps/app/src/lib/seating-draft.ts` in full — note the `SeatingDraftState` shape, the action types, `seatLinkedPartyAtTable` return type, and `unassignGuestFromSeat` handler
- `apps/app/src/components/seating/seating-editor.tsx` lines 400–700 — find exactly where occupied seat chips are rendered and how `selectedTableId` / `selectedGuestId` are tracked in reducer state vs. local state

**`seating-editor.tsx` is a component file, not a route file. It is NOT exempt from coverage. 95% coverage applies.**

---

## Current Gaps

### Gap 1: No way to unassign a guest from a seat in the UI

The `seatingDraftReducer` already handles `{ type: "unassignGuestFromSeat", guestId }` (action defined at line 46, handler at line 448 of `seating-draft.ts`), but `seating-editor.tsx` never dispatches it. A user who assigns the wrong guest must either drag them elsewhere or undo — there is no direct "remove from seat" button.

**Fix:** Add an `×` button to each occupied seat chip in the table canvas. On click, dispatch `{ type: "unassignGuestFromSeat", guestId }`. Use `e.stopPropagation()` to prevent triggering the drag sensor.

```tsx
<button
  aria-label={`Unassign ${guestName}`}
  onClick={(e) => {
    e.stopPropagation();
    dispatch({ type: "unassignGuestFromSeat", guestId });
  }}
  className="ml-1 text-muted-foreground hover:text-destructive"
>
  <X className="h-3 w-3" />
</button>
```

### Gap 2: No way to find where a seated guest is assigned from the guest panel

Once a guest is assigned to a table, they disappear from the unassigned panel. There is no way to see which table they are at without scanning all tables visually.

**Fix:** When the search input has text (≥ 1 character), extend the search to also match already-seated guests and show them in a "Seated" section below the unassigned list. Clicking a seated guest's row dispatches `{ type: "selectTable", tableId }` to the reducer (which selects and scrolls to that table in the workspace). This uses the existing reducer action — do NOT use a separate `useState` for this; `selectedTableId` is in reducer state.

Implementation:
1. Derive `seatedMatchingGuests` from `flatGuests` — filter all guests where `state.draftChart` has an assignment for that guest ID, and name matches the search string
2. For each, find their `tableId` from `state.draftChart.tables[*].seats`
3. Render as non-draggable rows showing: `{firstName} {lastName}` — `{tableName}`
4. On click: `dispatch({ type: "selectTable", tableId })`

No new state. Fully derived from existing `state.draftChart` and `flatGuests`.

### Gap 3: Auto-seat a group

Seating guests one-by-one is tedious for large parties. When a table is selected and the search string exactly matches a group name, show an action button to seat all unseated members of that group at that table.

**New helper:** `seatGroupAtTable` in `seating-draft.ts`

```typescript
export function seatGroupAtTable(
  state: SeatingDraftState,
  guests: GuestWithPlusOnes[],
  groupName: string,
  tableId: string,
): { draftChart: SeatingChart; unseatedCount: number }
```

Note: This returns `{ draftChart, unseatedCount }` — a plain object, NOT a `SeatingDraftState`. This is intentional: the caller dispatches `replaceDraftChart` with `.draftChart` and uses `unseatedCount` to show overflow feedback. This diverges from `seatLinkedPartyAtTable` which returns `SeatingDraftState`; the difference is documented here so the implementer doesn't try to unify them.

**Algorithm:**
1. Filter `guests` to only primary guests where `guest.groupName === groupName`
2. For each primary guest in the group: skip if any member of their household (primary OR any plus-one) is already seated — do not move already-seated guests
3. For each eligible unseated household, call `seatLinkedPartyAtTable(currentState, guests, guestId, tableId)`; if it returns a state change, update `currentState` with the new `draftChart`
4. Count how many primary guests were skipped because the table ran out of capacity; return `{ draftChart: currentState.draftChart, unseatedCount }`

**UI:** In the sidebar, when a table is selected AND `searchQuery` exactly matches a group name AND there are unseated guests in that group, render below the "Seat linked party here" button:

```tsx
<Button variant="outline" size="sm" onClick={handleSeatGroup}>
  Seat all {N} from "{groupName}" here
</Button>
{seatGroupMessage ? (
  <p className="mt-2 text-xs text-muted-foreground">{seatGroupMessage}</p>
) : null}
```

After clicking, if `unseatedCount > 0`, set local state `seatGroupMessage` to: `"{unseatedCount} guest(s) could not be seated — table may be full."` Use `useState<string | null>(null)` for this inline message. Do NOT introduce a toast library; the existing `!canSeatParty` pattern in the sidebar already uses an inline `<p>` for this purpose.

Clear `seatGroupMessage` whenever `selectedTable` or `searchQuery` changes.

---

## Testing

### `apps/app/__tests__/lib/seating-draft.test.ts` (add cases)

- `seatGroupAtTable`: seats all eligible unseated guests from a group at a table with sufficient capacity
- `seatGroupAtTable`: stops adding guests when the table is full; returns correct `unseatedCount`
- `seatGroupAtTable`: skips households where any member is already seated (does not move them)
- `seatGroupAtTable`: returns `{ unseatedCount: 0 }` when all guests in the group fit
- `seatGroupAtTable`: returns original `draftChart` unchanged when group has no unseated guests

### `apps/app/__tests__/components/seating/seating-editor.test.tsx` (create)

- Renders an unassign button (aria-label "Unassign {name}") on each occupied seat chip
- Clicking the unassign button removes the guest from the seat (they reappear in the unassigned panel)
- Clicking the unassign button does NOT trigger drag behaviour (stopPropagation)
- When search query matches a seated guest, a "Seated" section appears showing their table name
- Clicking a seated guest row in the "Seated" section selects that table in the workspace
- When search exactly matches a group name, a table is selected, and there are unseated guests in that group, the auto-seat button appears
- Auto-seat button is NOT shown when no table is selected
- Auto-seat button is NOT shown when search doesn't exactly match a group
- Clicking auto-seat seats the guests and shows an inline overflow message if some couldn't fit
- Inline overflow message clears when the search query changes

**Note:** The seating editor uses `@dnd-kit`. Drag-and-drop interactions in tests use `fireEvent` or user events rather than actual pointer events. Focus tests on state-change outcomes (what is rendered after the action), not on drag mechanics.

95% coverage required on `seating-draft.ts` (new function and any modified paths) and `seating-editor.tsx` component file.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `apps/app/src/lib/seating-draft.ts` | Add `seatGroupAtTable` helper |
| `apps/app/src/components/seating/seating-editor.tsx` | Unassign buttons; seated-guest search section; auto-seat group button + inline message |
| `apps/app/__tests__/lib/seating-draft.test.ts` | Add `seatGroupAtTable` tests |
| `apps/app/__tests__/components/seating/seating-editor.test.tsx` | Create — test all 3 new interactions |
