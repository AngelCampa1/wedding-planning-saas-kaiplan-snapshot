import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { GuestWithPlusOnes, SeatingChart } from "@kaiplan/shared";

let dndContext: {
  onDragStart?: (event: any) => void;
  onDragEnd?: (event: any) => void;
  accessibility?: {
    announcements?: {
      onDragStart?: (event: any) => string | undefined;
      onDragOver?: (event: any) => string | undefined;
      onDragEnd?: (event: any) => string | undefined;
      onDragCancel?: (event: any) => string | undefined;
    };
  };
} = {};
const mockUseDroppable = vi.fn();
const mockUseDraggable = vi.fn();

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, ...props }: any) => {
    dndContext = props;
    return createElement("div", {}, children);
  },
  DragOverlay: ({ children }: any) => createElement("div", {}, children),
  PointerSensor: function PointerSensor() {},
  closestCenter: vi.fn(),
  useDraggable: (...args: unknown[]) => mockUseDraggable(...args),
  useDroppable: (...args: unknown[]) => mockUseDroppable(...args),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Translate: {
      toString: () => "",
    },
  },
}));

import { SeatingEditor } from "../../../src/components/seating/seating-editor";

function makeChart(): SeatingChart {
  return {
    width: 1200,
    height: 800,
    tables: [
      {
        id: "table-1",
        name: "Round Table",
        shape: "round",
        capacity: 2,
        x: 100,
        y: 100,
        seats: [
          { id: "seat-1", positionIndex: 0, guestId: "guest-1" },
          { id: "seat-2", positionIndex: 1 },
        ],
      },
      {
        id: "table-2",
        name: "Second Table",
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

beforeEach(() => {
  dndContext = {};
  mockUseDroppable.mockImplementation(() => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }));
  mockUseDraggable.mockImplementation(() => ({
    setNodeRef: vi.fn(),
    transform: null,
    attributes: {},
    listeners: {},
  }));
  vi.clearAllMocks();
});

describe("SeatingEditor drag handling", () => {
  it("renders an active rail state when the drop zone is hovered", () => {
    mockUseDroppable
      .mockImplementationOnce(() => ({
        setNodeRef: vi.fn(),
        isOver: true,
      }))
      .mockImplementation(() => ({
        setNodeRef: vi.fn(),
        isOver: false,
      }));

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Guest rail")).toBeInTheDocument();
  });

  it("renders an active seat state when a seat drop zone is hovered", () => {
    mockUseDroppable
      .mockImplementationOnce(() => ({
        setNodeRef: vi.fn(),
        isOver: false,
      }))
      .mockImplementation(() => ({
        setNodeRef: vi.fn(),
        isOver: true,
      }));

    const { container } = render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    const activeSeat = container.querySelector('[title="Seat 2"]');
    expect(activeSeat).toHaveClass("border-primary", "bg-primary/15");
  });

  it("handles guest, rail, and table drag end events", async () => {
    const guests = [
      makeGuest(),
      makeGuest({
        id: "guest-2",
        firstName: "Bob",
        lastName: "Jones",
      }),
    ];

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={guests}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    await act(async () => {
      dndContext.onDragStart?.({
        active: { data: { current: { type: "guest", guestId: "guest-1" } } },
      });
    });
    // Alice is seated so there is a chip button AND an unassign button – both
    // match /alice smith/i; assert at least one is present.
    expect(
      screen.getAllByRole("button", { name: /alice smith/i }).length,
    ).toBeGreaterThan(0);

    await act(async () => {
      dndContext.onDragStart?.({
        active: { data: { current: { type: "table", tableId: "table-1" } } },
      });
    });

    await act(async () => {
      dndContext.onDragStart?.({
        active: { data: { current: { type: "guest", guestId: "missing" } } },
      });
    });

    await act(async () => {
      dndContext.onDragStart?.({
        active: { data: { current: { type: "table", tableId: "missing" } } },
      });
    });

    await act(async () => {
      dndContext.onDragEnd?.({
        active: { data: { current: { type: "guest", guestId: "guest-2" } } },
        over: {
          data: { current: { type: "seat", tableId: "table-1", seatIndex: 1 } },
        },
        delta: { x: 0, y: 0 },
      });
    });

    await act(async () => {
      dndContext.onDragEnd?.({
        active: { data: { current: { type: "guest", guestId: "guest-2" } } },
        over: {
          data: { current: { type: "seat", tableId: "table-2", seatIndex: 0 } },
        },
        delta: { x: 0, y: 0 },
      });
    });

    await act(async () => {
      dndContext.onDragEnd?.({
        active: { data: { current: { type: "guest", guestId: "guest-1" } } },
        over: { data: { current: { type: "rail" } } },
        delta: { x: 0, y: 0 },
      });
    });

    await act(async () => {
      dndContext.onDragEnd?.({
        active: { data: { current: { type: "table", tableId: "table-1" } } },
        over: undefined,
        delta: { x: 20, y: 30 },
      });
    });

    await act(async () => {
      dndContext.onDragEnd?.({
        active: { data: { current: null } },
        over: undefined,
        delta: { x: 0, y: 0 },
      });
    });

    expect(screen.getByText("Round Table")).toBeInTheDocument();
    expect(screen.getByText("Second Table")).toBeInTheDocument();
  });

  it("uses human-readable screen reader announcements for drag interactions", () => {
    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[
          makeGuest(),
          makeGuest({
            id: "guest-2",
            firstName: "Bob",
            lastName: "Jones",
          }),
        ]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    expect(
      dndContext.accessibility?.announcements?.onDragStart?.({
        active: { data: { current: { type: "guest", guestId: "guest-2" } } },
      }),
    ).toBe("Picked up Bob Jones.");

    expect(
      dndContext.accessibility?.announcements?.onDragOver?.({
        active: { data: { current: { type: "guest", guestId: "guest-2" } } },
        over: {
          data: { current: { type: "seat", tableId: "table-1", seatIndex: 1 } },
        },
      }),
    ).toBe("Bob Jones is over Seat 2 at Round Table.");

    expect(
      dndContext.accessibility?.announcements?.onDragEnd?.({
        active: { data: { current: { type: "guest", guestId: "guest-2" } } },
        over: {
          data: { current: { type: "seat", tableId: "table-1", seatIndex: 1 } },
        },
      }),
    ).toBe("Placed Bob Jones in Seat 2 at Round Table.");

    expect(
      dndContext.accessibility?.announcements?.onDragEnd?.({
        active: { data: { current: { type: "guest", guestId: "guest-1" } } },
        over: { data: { current: { type: "rail" } } },
      }),
    ).toBe("Moved Alice Smith back to the guest rail.");
  });

  it("covers fallback announcement branches for unsupported or cancelled drags", async () => {
    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    expect(
      dndContext.accessibility?.announcements?.onDragOver?.({
        active: { data: { current: { type: "guest", guestId: "guest-1" } } },
        over: { data: { current: { type: "workspace" } } },
      }),
    ).toBeUndefined();

    expect(
      dndContext.accessibility?.announcements?.onDragStart?.({
        active: { data: { current: { type: "guest" } } },
      }),
    ).toBe("Picked up Guest.");

    expect(
      dndContext.accessibility?.announcements?.onDragStart?.({
        active: { data: { current: { type: "guest", guestId: "missing" } } },
      }),
    ).toBe("Picked up Guest.");

    expect(
      dndContext.accessibility?.announcements?.onDragStart?.({
        active: { data: { current: { type: "table", tableId: "table-1" } } },
      }),
    ).toBe("Picked up Round Table.");

    expect(
      dndContext.accessibility?.announcements?.onDragStart?.({
        active: { data: { current: { type: "table", tableId: "missing" } } },
      }),
    ).toBe("Picked up Table.");

    expect(
      dndContext.accessibility?.announcements?.onDragStart?.({
        active: { data: { current: { type: "mystery" } } },
      }),
    ).toBeUndefined();

    expect(
      dndContext.accessibility?.announcements?.onDragOver?.({
        active: { data: { current: { type: "guest", guestId: "guest-1" } } },
        over: { data: { current: { type: "rail" } } },
      }),
    ).toBe("Alice Smith is over the guest rail.");

    expect(
      dndContext.accessibility?.announcements?.onDragOver?.({
        active: { data: { current: { type: "guest" } } },
        over: { data: { current: { type: "seat" } } },
      }),
    ).toBe("Guest is over Seat 1.");

    expect(
      dndContext.accessibility?.announcements?.onDragOver?.({
        active: { data: { current: { type: "guest", guestId: "missing" } } },
        over: {
          data: { current: { type: "seat", tableId: "table-1", seatIndex: 1 } },
        },
      }),
    ).toBe("Guest is over Seat 2 at Round Table.");

    expect(
      dndContext.accessibility?.announcements?.onDragOver?.({
        active: { data: { current: { type: "table", tableId: "table-1" } } },
        over: undefined,
      }),
    ).toBeUndefined();

    expect(
      dndContext.accessibility?.announcements?.onDragEnd?.({
        active: { data: { current: null } },
        over: undefined,
      }),
    ).toBeUndefined();

    expect(
      dndContext.accessibility?.announcements?.onDragEnd?.({
        active: { data: { current: { type: "guest", guestId: "guest-1" } } },
        over: undefined,
      }),
    ).toBe("Alice Smith was not moved.");

    expect(
      dndContext.accessibility?.announcements?.onDragEnd?.({
        active: { data: { current: { type: "table", tableId: "table-1" } } },
        over: undefined,
      }),
    ).toBe("Moved Round Table.");

    expect(
      dndContext.accessibility?.announcements?.onDragEnd?.({
        active: { data: { current: { type: "mystery" } } },
        over: undefined,
      }),
    ).toBeUndefined();

    expect(
      dndContext.accessibility?.announcements?.onDragCancel?.({
        active: { data: { current: { type: "guest", guestId: "guest-1" } } },
      }),
    ).toBe("Cancelled dragging Alice Smith.");

    expect(
      dndContext.accessibility?.announcements?.onDragCancel?.({
        active: { data: { current: { type: "table", tableId: "table-1" } } },
      }),
    ).toBe("Cancelled dragging Round Table.");

    expect(
      dndContext.accessibility?.announcements?.onDragCancel?.({
        active: { data: { current: { type: "mystery" } } },
      }),
    ).toBeUndefined();

    await act(async () => {
      dndContext.onDragStart?.({
        active: { data: { current: { type: "mystery" } } },
      });
    });

    await act(async () => {
      dndContext.onDragEnd?.({
        active: { data: { current: { type: "mystery" } } },
        over: undefined,
        delta: { x: 0, y: 0 },
      });
    });

    expect(screen.getByText("Round Table")).toBeInTheDocument();
  });

  it("disables drag and drop affordances when mutation is disabled", () => {
    mockUseDroppable
      .mockImplementationOnce(() => ({
        setNodeRef: vi.fn(),
        isOver: true,
      }))
      .mockImplementation(() => ({
        setNodeRef: vi.fn(),
        isOver: true,
      }));

    const { container } = render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
        canMutate={false}
      />,
    );

    expect(dndContext.onDragStart).toBeUndefined();
    expect(dndContext.onDragEnd).toBeUndefined();
    expect(screen.queryByText("Drag to reposition")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /unassign alice smith/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Review the saved seating layout without moving guests or tables.",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector('[title="Seat 2"]')).not.toHaveClass(
      "border-primary",
      "bg-primary/15",
    );
    expect(
      mockUseDraggable.mock.calls.every(([options]) => {
        const typedOptions = options as { disabled?: unknown } | null;
        return Boolean(typedOptions && typedOptions.disabled === true);
      }),
    ).toBe(true);
    expect(
      mockUseDroppable.mock.calls.every(([options]) => {
        const typedOptions = options as { disabled?: unknown } | null;
        return Boolean(typedOptions && typedOptions.disabled === true);
      }),
    ).toBe(true);
  });
});
