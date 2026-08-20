import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  type Announcements,
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  Armchair,
  CircleDot,
  Move,
  RotateCw,
  Save,
  Search,
  Square,
  Trash2,
  Undo2,
  Users,
  X,
} from "lucide-react";
import type {
  Guest,
  GuestSide,
  GuestWithPlusOnes,
  SeatingChart,
  SeatingTable,
} from "@kaiplan/shared";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import {
  canSeatLinkedPartyAtTable,
  createSeatingDraftState,
  getSeatingDraftStats,
  seatGroupAtTable,
  seatLinkedPartyAtTable,
  seatingDraftReducer,
} from "../../lib/seating-draft";
import { cn } from "../../lib/utils";

const SIDE_LABELS: Record<GuestSide, string> = {
  partner1: "Partner 1",
  partner2: "Partner 2",
  mutual: "Mutual",
};

/**
 * Seating canvas pixel dimensions. These are domain-specific layout
 * constants for the seating editor — not design-system tokens. They
 * live as named constants so the dimensions are editable in one place
 * and flow into inline styles (keeping Tailwind's JIT class scanning
 * unaware of them, which is correct for domain-specific sizing).
 */
const SEATING = {
  /** Circular table footprint (px). Fixed size drives the seat layout math. */
  tableSize: 190,
  /** Minimum height of the three-column editor rails/workspace (px). */
  canvasMinHeight: 680,
  /** Width of the left guest rail and right inspector columns (px). */
  sidebarWidth: 320,
} as const;

interface SeatingEditorProps {
  weddingName: string;
  guests: GuestWithPlusOnes[];
  initialChart: SeatingChart;
  onSave: (chart: SeatingChart) => Promise<SeatingChart | void>;
  isSaving?: boolean;
  saveError?: string | null;
  canMutate?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

interface FlatGuest extends Guest {
  partyLabel: string | null;
  groupCue: string;
}

function pluralize(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

function flattenGuests(guests: GuestWithPlusOnes[]): FlatGuest[] {
  return guests.flatMap((primary) => {
    const partySize = 1 + primary.plusOnes.length;
    const groupCue = primary.groupName ?? `Side: ${SIDE_LABELS[primary.side]}`;

    return [
      {
        ...primary,
        partyLabel: partySize > 1 ? `${partySize} in party` : null,
        groupCue,
      },
      ...primary.plusOnes.map((plusOne) => ({
        ...plusOne,
        partyLabel: `Linked to ${primary.firstName} ${primary.lastName}`,
        groupCue,
      })),
    ];
  });
}

function getSeatCoordinates(
  table: SeatingTable,
  seatIndex: number,
  seatCount: number,
) {
  if (table.shape === "round") {
    const angle = (Math.PI * 2 * seatIndex) / seatCount - Math.PI / 2;
    const radius = 86;

    return {
      left: 95 + Math.cos(angle) * radius,
      top: 95 + Math.sin(angle) * radius,
    };
  }

  const isHorizontal = (table.orientation ?? "horizontal") === "horizontal";
  const perSide = Math.ceil(seatCount / 2);
  const sideIndex = seatIndex % perSide;
  const firstSide = seatIndex < perSide;
  const spacing = perSide > 1 ? 140 / (perSide - 1) : 0;

  if (isHorizontal) {
    return {
      left: 40 + sideIndex * spacing,
      top: firstSide ? 20 : 170,
    };
  }

  return {
    left: firstSide ? 20 : 170,
    top: 40 + sideIndex * spacing,
  };
}

function getGuestLabel(
  guestId: string | undefined,
  guests: Map<string, FlatGuest>,
) {
  if (!guestId) {
    return "Guest";
  }

  const guest = guests.get(guestId);
  if (!guest) {
    return "Guest";
  }

  return `${guest.firstName} ${guest.lastName}`;
}

function getTableLabel(tableId: string | undefined, tables: SeatingTable[]) {
  if (!tableId) {
    return "Table";
  }

  return tables.find((table) => table.id === tableId)?.name ?? "Table";
}

function getSeatLabel(
  tableId: string | undefined,
  seatIndex: number | undefined,
  tables: SeatingTable[],
) {
  const seatNumber = (seatIndex ?? 0) + 1;
  const tableLabel = getTableLabel(tableId, tables);

  if (tableLabel === "Table") {
    return `Seat ${seatNumber}`;
  }

  return `Seat ${seatNumber} at ${tableLabel}`;
}

function GuestChip({
  guest,
  selected,
  onClick,
  compact = false,
  canDrag = true,
}: {
  guest: FlatGuest;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
  canDrag?: boolean;
}) {
  const draggable = useDraggable({
    id: `guest:${guest.id}`,
    data: { type: "guest", guestId: guest.id },
    disabled: !canDrag,
  });

  return (
    <button
      type="button"
      ref={draggable.setNodeRef}
      onClick={onClick}
      style={{ transform: CSS.Translate.toString(draggable.transform) }}
      className={cn(
        "rounded-lg border text-left transition",
        compact ? "w-24 px-2 py-1 text-2xs" : "w-full px-3 py-2 text-sm",
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:border-primary/40",
      )}
      {...(canDrag ? draggable.attributes : {})}
      {...(canDrag ? draggable.listeners : {})}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate font-medium text-foreground",
              compact && "text-2xs",
            )}
          >
            {guest.firstName} {guest.lastName}
          </p>
          {!compact ? (
            <>
              <p className="text-xs text-muted-foreground">
                {guest.rsvpStatus}
                {guest.partyLabel ? ` - ${guest.partyLabel}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">{guest.groupCue}</p>
            </>
          ) : null}
        </div>
        {canDrag ? (
          <Move
            className={cn(
              "shrink-0 text-muted-foreground",
              compact ? "h-3 w-3" : "h-4 w-4",
            )}
          />
        ) : null}
      </div>
    </button>
  );
}

function SeatDrop({
  label,
  isOver,
  canDrop = true,
}: {
  label: string;
  isOver: boolean;
  canDrop?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-2xs font-medium shadow-sm transition",
        canDrop && isOver
          ? "border-primary bg-primary/15"
          : "border-border bg-background",
      )}
      aria-label={label}
      title={label}
    >
      <Armchair className="h-4 w-4" />
    </div>
  );
}

function SeatNode({
  tableId,
  seatIndex,
  label,
  left,
  top,
  guest,
  selectedGuestId,
  onGuestSelect,
  onUnassign,
  canMutate,
}: {
  tableId: string;
  seatIndex: number;
  label: string;
  left: number;
  top: number;
  guest: FlatGuest | null;
  selectedGuestId: string | null;
  onGuestSelect: (guestId: string) => void;
  onUnassign?: (guestId: string) => void;
  canMutate: boolean;
}) {
  const droppable = useDroppable({
    id: `seat:${tableId}:${seatIndex}`,
    data: { type: "seat", tableId, seatIndex },
    disabled: !canMutate,
  });

  return (
    <div ref={droppable.setNodeRef} style={{ left, top }} className="absolute">
      <SeatDrop label={label} isOver={droppable.isOver} canDrop={canMutate} />
      {guest ? (
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="relative">
            <GuestChip
              guest={guest}
              selected={guest.id === selectedGuestId}
              compact
              onClick={() => onGuestSelect(guest.id)}
              canDrag={canMutate}
            />
            {canMutate && onUnassign ? (
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
    </div>
  );
}

function TableCard({
  table,
  selected,
  assignedGuests,
  selectedGuestId,
  onSelect,
  onGuestSelect,
  onUnassign,
  canMutate,
}: {
  table: SeatingTable;
  selected: boolean;
  assignedGuests: Map<string, FlatGuest>;
  selectedGuestId: string | null;
  onSelect: () => void;
  onGuestSelect: (guestId: string) => void;
  onUnassign: (guestId: string) => void;
  canMutate: boolean;
}) {
  const draggable = useDraggable({
    id: `table:${table.id}`,
    data: { type: "table", tableId: table.id },
    disabled: !canMutate,
  });

  return (
    <div
      ref={draggable.setNodeRef}
      className={cn("absolute select-none", selected && "z-20")}
      style={{
        left: table.x,
        top: table.y,
        transform: CSS.Translate.toString(draggable.transform),
      }}
    >
      <div
        className="relative rounded-3xl border border-dashed border-border/70 bg-secondary/20 shadow-sm"
        style={{ height: SEATING.tableSize, width: SEATING.tableSize }}
      >
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border bg-background text-center shadow-sm transition hover:border-primary/40",
            table.shape === "round"
              ? "h-24 w-24 rounded-full"
              : (table.orientation ?? "horizontal") === "horizontal"
                ? "h-16 w-28 rounded-2xl"
                : "h-28 w-16 rounded-2xl",
            selected && "border-primary bg-primary/5",
          )}
        >
          <div>
            <p className="text-xs font-semibold text-foreground">
              {table.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {table.capacity} seats
            </p>
          </div>
        </button>

        {table.seats.map((seat, seatIndex) => {
          const coordinates = getSeatCoordinates(
            table,
            seatIndex,
            table.seats.length,
          );
          const guest = seat.guestId
            ? (assignedGuests.get(seat.guestId) ?? null)
            : null;

          return (
            <SeatNode
              key={seat.id}
              tableId={table.id}
              seatIndex={seatIndex}
              label={
                guest
                  ? `${guest.firstName} ${guest.lastName}`
                  : `Seat ${seatIndex + 1}`
              }
              left={coordinates.left}
              top={coordinates.top}
              guest={guest}
              selectedGuestId={selectedGuestId}
              onGuestSelect={onGuestSelect}
              onUnassign={onUnassign}
              canMutate={canMutate}
            />
          );
        })}
      </div>

      {canMutate ? (
        <button
          type="button"
          className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
          {...draggable.attributes}
          {...draggable.listeners}
        >
          <Move className="h-3.5 w-3.5" />
          Drag to reposition
        </button>
      ) : null}
    </div>
  );
}

export function SeatingEditor({
  weddingName,
  guests,
  initialChart,
  onSave,
  isSaving = false,
  saveError = null,
  canMutate = true,
  onDirtyChange,
}: SeatingEditorProps) {
  const [state, dispatch] = useReducer(
    seatingDraftReducer,
    initialChart,
    createSeatingDraftState,
  );
  const [search, setSearch] = useState("");
  const [rsvpFilter, setRsvpFilter] = useState<
    "all" | "accepted" | "invited" | "pending"
  >("all");
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const [isSubmitPending, setIsSubmitPending] = useState(false);
  const [seatGroupMessage, setSeatGroupMessage] = useState<string | null>(null);
  const latestDraftRef = useRef(state.draftChart);
  const latestInitialChartRef = useRef(initialChart);
  const latestDirtyRef = useRef(false);

  useEffect(() => {
    latestDraftRef.current = state.draftChart;
  }, [state.draftChart]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const flatGuests = useMemo(() => flattenGuests(guests), [guests]);
  const assignedGuestIds = useMemo(
    () =>
      new Set(
        state.draftChart.tables.flatMap((table) =>
          table.seats.flatMap((seat) => (seat.guestId ? [seat.guestId] : [])),
        ),
      ),
    [state.draftChart],
  );
  const assignedGuestMap = useMemo(
    () => new Map(flatGuests.map((guest) => [guest.id, guest])),
    [flatGuests],
  );
  const unseatedGuests = useMemo(
    () =>
      flatGuests.filter((guest) => {
        if (assignedGuestIds.has(guest.id)) {
          return false;
        }
        if (guest.rsvpStatus === "declined") {
          return false;
        }
        if (rsvpFilter !== "all" && guest.rsvpStatus !== rsvpFilter) {
          return false;
        }

        const fullName = `${guest.firstName} ${guest.lastName}`.toLowerCase();
        return fullName.includes(search.toLowerCase());
      }),
    [assignedGuestIds, flatGuests, rsvpFilter, search],
  );
  const seatedMatchingGuests = useMemo(() => {
    if (search.trim().length === 0) return [];
    return flatGuests
      .filter((g) => {
        if (!assignedGuestIds.has(g.id)) return false;
        const fullName = `${g.firstName} ${g.lastName}`.toLowerCase();
        return fullName.includes(search.toLowerCase());
      })
      .map((g) => {
        const table = state.draftChart.tables.find((t) =>
          t.seats.some((s) => s.guestId === g.id),
        );
        return { guest: g, table: table ?? null };
      });
  }, [search, flatGuests, assignedGuestIds, state.draftChart.tables]);
  const unseatedGroupCount = useMemo(() => {
    if (!state.selectedTableId || search.trim().length === 0) return 0;
    return flatGuests.filter(
      (g) =>
        g.groupName === search.trim() &&
        g.primaryGuestId === null &&
        !assignedGuestIds.has(g.id),
    ).length;
  }, [state.selectedTableId, search, flatGuests, assignedGuestIds]);
  const selectedTable = state.draftChart.tables.find(
    (table) => table.id === state.selectedTableId,
  );
  const selectedGuest =
    flatGuests.find((guest) => guest.id === selectedGuestId) ?? null;
  const stats = getSeatingDraftStats(state, guests);
  // Keep dirty ref in sync so the sync effect can read it without depending on it
  latestDirtyRef.current = stats.dirty;
  const tableSummaryLabel = pluralize(stats.tableCount, "table");
  const seatedSummaryLabel = pluralize(
    stats.assignedSeatCount,
    "seated",
    "seated",
  );

  useEffect(() => {
    if (latestInitialChartRef.current === initialChart) {
      return;
    }

    latestInitialChartRef.current = initialChart;
    dispatch({
      type: latestDirtyRef.current ? "updateSavedChart" : "replaceFromServer",
      chart: initialChart,
    });
  }, [initialChart]);

  const isBusy = isSaving || isSubmitPending;
  const railDrop = useDroppable({
    id: "guest-rail",
    data: { type: "rail" },
    disabled: !canMutate,
  });
  const canSeatParty =
    selectedGuest && selectedTable
      ? canSeatLinkedPartyAtTable(
          state,
          guests,
          selectedGuest.id,
          selectedTable.id,
        )
      : false;

  useEffect(() => {
    onDirtyChange?.(canMutate && stats.dirty);
  }, [canMutate, onDirtyChange, stats.dirty]);

  useEffect(() => {
    setSeatGroupMessage(null);
  }, [state.selectedTableId, search]);

  const accessibility = useMemo(() => {
    const announcements: Announcements = {
      onDragStart({ active }: DragStartEvent) {
        const data = active.data.current;
        if (data?.type === "guest") {
          return `Picked up ${getGuestLabel(
            data.guestId as string | undefined,
            assignedGuestMap,
          )}.`;
        }

        if (data?.type === "table") {
          return `Picked up ${getTableLabel(
            data.tableId as string | undefined,
            state.draftChart.tables,
          )}.`;
        }

        return undefined;
      },
      onDragOver({ active, over }: DragEndEvent) {
        const activeData = active.data.current;
        const overData = over?.data.current;
        if (activeData?.type !== "guest" || !overData) {
          return undefined;
        }

        const guestLabel = getGuestLabel(
          activeData.guestId as string | undefined,
          assignedGuestMap,
        );

        if (overData.type === "seat") {
          return `${guestLabel} is over ${getSeatLabel(
            overData.tableId as string | undefined,
            overData.seatIndex as number | undefined,
            state.draftChart.tables,
          )}.`;
        }

        if (overData.type === "rail") {
          return `${guestLabel} is over the guest rail.`;
        }

        return undefined;
      },
      onDragEnd({ active, over }: DragEndEvent) {
        const activeData = active.data.current;
        const overData = over?.data.current;
        if (!activeData) {
          return undefined;
        }

        if (activeData.type === "guest") {
          const guestLabel = getGuestLabel(
            activeData.guestId as string | undefined,
            assignedGuestMap,
          );

          if (overData?.type === "seat") {
            return `Placed ${guestLabel} in ${getSeatLabel(
              overData.tableId as string | undefined,
              overData.seatIndex as number | undefined,
              state.draftChart.tables,
            )}.`;
          }

          if (overData?.type === "rail") {
            return `Moved ${guestLabel} back to the guest rail.`;
          }

          return `${guestLabel} was not moved.`;
        }

        if (activeData.type === "table") {
          return `Moved ${getTableLabel(
            activeData.tableId as string | undefined,
            state.draftChart.tables,
          )}.`;
        }

        return undefined;
      },
      onDragCancel({ active }) {
        const data = active.data.current;
        if (data?.type === "guest") {
          return `Cancelled dragging ${getGuestLabel(
            data.guestId as string | undefined,
            assignedGuestMap,
          )}.`;
        }

        if (data?.type === "table") {
          return `Cancelled dragging ${getTableLabel(
            data.tableId as string | undefined,
            state.draftChart.tables,
          )}.`;
        }

        return undefined;
      },
    };

    return { announcements };
  }, [assignedGuestMap, state.draftChart.tables]);

  async function handleSave() {
    if (isBusy) {
      return;
    }

    const chartToSave = latestDraftRef.current;
    setIsSubmitPending(true);
    try {
      const savedChart = await onSave(chartToSave);
      if (savedChart && latestDraftRef.current === chartToSave) {
        dispatch({ type: "replaceFromServer", chart: savedChart });
      }
    } finally {
      setIsSubmitPending(false);
    }
  }

  function handleReset() {
    if (!stats.dirty || isBusy) {
      return;
    }

    if (!window.confirm("Discard your unsaved seating changes?")) {
      return;
    }

    dispatch({ type: "resetToSavedChart" });
  }

  function handleSeatGroup() {
    if (!selectedTable || !canMutate) return;
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

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === "guest") {
      const guest = assignedGuestMap.get(data.guestId as string);
      setActiveDragLabel(
        guest ? `${guest.firstName} ${guest.lastName}` : "Guest",
      );
      return;
    }

    if (data?.type === "table") {
      const table = state.draftChart.tables.find(
        (item) => item.id === data.tableId,
      );
      setActiveDragLabel(table?.name ?? "Table");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragLabel(null);
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    if (!activeData) {
      return;
    }

    if (activeData.type === "guest" && overData?.type === "seat") {
      dispatch({
        type: "assignGuestToSeat",
        guestId: activeData.guestId,
        tableId: overData.tableId,
        seatIndex: overData.seatIndex,
      });
      return;
    }

    if (activeData.type === "guest" && overData?.type === "rail") {
      dispatch({
        type: "unassignGuestFromSeat",
        guestId: activeData.guestId,
      });
      return;
    }

    if (activeData.type === "table") {
      dispatch({
        type: "moveTableBy",
        tableId: activeData.tableId,
        deltaX: event.delta.x,
        deltaY: event.delta.y,
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Seating Chart
          </h1>
          <p className="text-sm text-muted-foreground">
            {weddingName} - {tableSummaryLabel} - {seatedSummaryLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stats.dirty ? (
            <Badge variant="warning">Unsaved changes</Badge>
          ) : (
            <Badge variant="success">Saved</Badge>
          )}
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!stats.dirty || isBusy || !canMutate}
          >
            <Undo2 className="h-4 w-4" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!stats.dirty || isBusy || !canMutate}
          >
            <Save className="h-4 w-4" />
            Save chart
          </Button>
        </div>
      </div>

      {saveError ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-destructive" />
          <p>{saveError}</p>
        </div>
      ) : null}

      <DndContext
        accessibility={accessibility}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={canMutate ? handleDragStart : undefined}
        onDragEnd={canMutate ? handleDragEnd : undefined}
      >
        {/*
          The xl: grid template below uses the literal 320px twice. That
          value must stay in sync with SEATING.sidebarWidth above — it is
          kept as a literal here because Tailwind's JIT must see the class
          string at build time (interpolated template literals would not
          be scanned, and inline styles cannot express xl: media queries
          without an additional runtime plumbing).
        */}
        <div
          aria-busy={isBusy}
          className={cn(
            "grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]",
            isBusy && "pointer-events-none opacity-80",
          )}
        >
          <Card
            ref={railDrop.setNodeRef}
            className={cn(
              "xl:min-h-[680px]",
              canMutate && railDrop.isOver && "border-primary/60",
              !canMutate && "border-solid",
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Guest rail
              </CardTitle>
              <CardDescription>
                {canMutate
                  ? "Unseated accepted, invited, and pending guests stay here until you place them. Drag seated guests back here to unassign them."
                  : "Unseated accepted, invited, and pending guests stay here for review."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search guests"
                  className="pl-9"
                />
              </div>
              <Select
                value={rsvpFilter}
                onChange={(event) =>
                  setRsvpFilter(event.target.value as typeof rsvpFilter)
                }
                aria-label="Filter unseated guests by RSVP"
                className="w-full"
              >
                <option value="all">All unseated RSVP</option>
                <option value="accepted">Accepted</option>
                <option value="invited">Invited</option>
                <option value="pending">Pending</option>
              </Select>
              <div className="space-y-2">
                {unseatedGuests.map((guest) => (
                  <GuestChip
                    key={guest.id}
                    guest={guest}
                    selected={guest.id === selectedGuestId}
                    onClick={() => setSelectedGuestId(guest.id)}
                    canDrag={canMutate}
                  />
                ))}
                {unseatedGuests.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                    No unseated guests match the current filters.
                  </p>
                ) : null}
              </div>
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
            </CardContent>
          </Card>

          <Card className="overflow-hidden xl:min-h-[680px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDot className="h-4 w-4" />
                Workspace
              </CardTitle>
              <CardDescription>
                {canMutate
                  ? "Drag guests onto seats, move seated guests between seats, or drag them back to the guest rail to unassign them."
                  : "Review the saved seating layout without moving guests or tables."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="relative overflow-auto rounded-card border border-dashed border-border bg-secondary/10"
                role="region"
                aria-label="Seating chart canvas"
                tabIndex={0}
              >
                <div
                  className="relative"
                  style={{
                    width: state.draftChart.width,
                    height: state.draftChart.height,
                    minHeight: 560,
                  }}
                >
                  {state.draftChart.tables.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                      <Armchair className="h-10 w-10" />
                      <p className="text-sm">
                        Add your first table to start placing guests.
                      </p>
                    </div>
                  ) : null}
                  {state.draftChart.tables.map((table) => (
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
                      onUnassign={(guestId) => {
                        if (canMutate) {
                          dispatch({ type: "unassignGuestFromSeat", guestId });
                        }
                      }}
                      canMutate={canMutate}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:min-h-[680px]">
            <CardHeader>
              <CardTitle>Inspector</CardTitle>
              <CardDescription>
                Configure tables and use quick actions for linked parties.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => dispatch({ type: "addTable", shape: "round" })}
                  disabled={!canMutate}
                >
                  <CircleDot className="h-4 w-4" />
                  Add round table
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    dispatch({ type: "addTable", shape: "rectangle" })
                  }
                  disabled={!canMutate}
                >
                  <Square className="h-4 w-4" />
                  Add rectangle
                </Button>
              </div>

              {selectedTable ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Table name
                    </label>
                    <Input
                      value={selectedTable.name}
                      onChange={(event) =>
                        dispatch({
                          type: "updateSelectedTable",
                          patch: { name: event.target.value },
                        })
                      }
                      disabled={!canMutate}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Capacity
                      </label>
                      <Input
                        type="number"
                        min={2}
                        max={20}
                        value={selectedTable.capacity}
                        onChange={(event) =>
                          dispatch({
                            type: "updateSelectedTable",
                            patch: {
                              capacity:
                                Number(event.target.value) ||
                                selectedTable.capacity,
                            },
                          })
                        }
                        disabled={!canMutate}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Shape
                      </label>
                      <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-foreground">
                        {selectedTable.shape}
                      </div>
                    </div>
                  </div>
                  {selectedTable.shape === "rectangle" ? (
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Orientation
                      </label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={
                            (selectedTable.orientation ?? "horizontal") ===
                            "horizontal"
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            dispatch({
                              type: "updateSelectedTable",
                              patch: { orientation: "horizontal" },
                            })
                          }
                          disabled={!canMutate}
                        >
                          Horizontal
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            (selectedTable.orientation ?? "horizontal") ===
                            "vertical"
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            dispatch({
                              type: "updateSelectedTable",
                              patch: { orientation: "vertical" },
                            })
                          }
                          disabled={!canMutate}
                        >
                          <RotateCw className="h-4 w-4" />
                          Vertical
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {selectedGuest ? (
                    <div className="rounded-lg border border-border bg-secondary/20 p-3">
                      <p className="text-sm font-medium text-foreground">
                        Selected guest
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedGuest.firstName} {selectedGuest.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedGuest.groupCue}
                      </p>
                      <Button
                        className="mt-3 w-full"
                        variant="outline"
                        onClick={() =>
                          dispatch({
                            type: "replaceDraftChart",
                            chart: seatLinkedPartyAtTable(
                              state,
                              guests,
                              selectedGuest.id,
                              selectedTable.id,
                            ).draftChart,
                          })
                        }
                        disabled={!canSeatParty || !canMutate}
                      >
                        Seat linked party here
                      </Button>
                      {!canSeatParty ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No contiguous run of seats is available for this
                          party.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete ${selectedTable.name}? Any guests seated here will return to the rail.`,
                          )
                        ) {
                          dispatch({
                            type: "deleteTable",
                            tableId: selectedTable.id,
                          });
                        }
                      }}
                      disabled={!canMutate}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete table
                    </Button>
                  </div>
                  {unseatedGroupCount > 0 &&
                  flatGuests.some((g) => g.groupName === search.trim()) ? (
                    <div className="rounded-lg border border-border bg-secondary/20 p-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleSeatGroup}
                        disabled={!canMutate}
                      >
                        Seat all {unseatedGroupCount} from &quot;
                        {search.trim()}&quot; here
                      </Button>
                      {seatGroupMessage ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {seatGroupMessage}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Select a table to edit its configuration.
                </div>
              )}

              <div className="rounded-lg border border-border bg-secondary/20 p-3 text-sm">
                <p className="font-medium text-foreground">Draft summary</p>
                <dl className="mt-2 space-y-1 text-muted-foreground">
                  <div className="flex justify-between">
                    <dt>Assigned seats</dt>
                    <dd>{stats.assignedSeatCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Empty seats</dt>
                    <dd>{stats.unassignedSeatCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Unseated guests</dt>
                    <dd>{stats.unseatedGuestCount}</dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>
        </div>

        <DragOverlay>
          {activeDragLabel ? (
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium shadow-lg">
              {activeDragLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
