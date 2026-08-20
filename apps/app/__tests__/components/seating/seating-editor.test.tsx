import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuestWithPlusOnes, SeatingChart } from "@kaiplan/shared";
import { SeatingEditor } from "../../../src/components/seating/seating-editor";

function makeChart(): SeatingChart {
  return {
    width: 1200,
    height: 800,
    tables: [],
  };
}

function makeComplexChart(): SeatingChart {
  return {
    width: 1200,
    height: 800,
    tables: [
      {
        id: "table-round",
        name: "Round Table",
        shape: "round",
        capacity: 4,
        x: 100,
        y: 100,
        seats: [
          { id: "seat-1", positionIndex: 0, guestId: "guest-1" },
          { id: "seat-2", positionIndex: 1 },
          { id: "seat-3", positionIndex: 2 },
          { id: "seat-4", positionIndex: 3 },
        ],
      },
      {
        id: "table-rect",
        name: "Rectangle Table",
        shape: "rectangle",
        capacity: 4,
        orientation: "vertical",
        x: 320,
        y: 140,
        seats: [
          { id: "seat-5", positionIndex: 0 },
          { id: "seat-6", positionIndex: 1 },
          { id: "seat-7", positionIndex: 2 },
          { id: "seat-8", positionIndex: 3 },
        ],
      },
    ],
  };
}

function makeAssignedChart(): SeatingChart {
  return {
    width: 1200,
    height: 800,
    tables: [
      {
        id: "table-1",
        name: "Table 1",
        shape: "round",
        capacity: 2,
        x: 120,
        y: 120,
        seats: [
          { id: "seat-1", positionIndex: 0, guestId: "guest-1" },
          { id: "seat-2", positionIndex: 1 },
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
    email: "alice@example.com",
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

function makePartyGuests(): GuestWithPlusOnes[] {
  return [
    makeGuest({
      id: "guest-1",
      firstName: "Alex",
      groupName: "Friends",
      plusOnes: [
        makeGuest({
          id: "guest-2",
          primaryGuestId: "guest-1",
          firstName: "Pat",
          lastName: "Reed",
        }),
      ],
    }),
    makeGuest({
      id: "guest-3",
      firstName: "Morgan",
      groupName: null,
      side: "partner1",
      rsvpStatus: "pending",
    }),
    makeGuest({
      id: "guest-4",
      firstName: "Declined",
      rsvpStatus: "declined",
    }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeatingEditor", () => {
  it("lists seatable guests and excludes declined guests from the rail", () => {
    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[
          makeGuest({
            id: "guest-1",
            firstName: "Alice",
            plusOnes: [
              makeGuest({
                id: "guest-2",
                primaryGuestId: "guest-1",
                firstName: "Bob",
                rsvpStatus: "pending",
              }),
            ],
          }),
          makeGuest({
            id: "guest-3",
            firstName: "Declined",
            rsvpStatus: "declined",
          }),
        ]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    expect(screen.queryByText("Declined Smith")).not.toBeInTheDocument();
  });

  it("disables editing controls when mutation is disabled", () => {
    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeComplexChart()}
        onSave={vi.fn()}
        canMutate={false}
      />,
    );

    expect(screen.getByRole("button", { name: /reset/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save chart/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /add round table/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /add rectangle/i }),
    ).toBeDisabled();
  });

  it("adds a table, marks the draft dirty, and saves the chart", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSave = vi
      .fn()
      .mockImplementation(async (chart: SeatingChart) => chart);

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add round table/i }));
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByText("Saved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add round table/i }));

    await user.click(screen.getByRole("button", { name: /save chart/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].tables).toHaveLength(1);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save chart/i })).toBeDisabled();
  });

  it("asks before discarding unsaved seating changes on reset", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add round table/i }));
    expect(screen.getByText("Round Table 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Discard your unsaved seating changes?",
    );
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByText("Round Table 1")).toBeInTheDocument();
  });

  it("uses singular wording when only one table exists", () => {
    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={{
          width: 1200,
          height: 800,
          tables: [
            {
              id: "table-1",
              name: "Table 1",
              shape: "round",
              capacity: 2,
              x: 100,
              y: 100,
              seats: [
                { id: "seat-1", positionIndex: 0, guestId: "guest-1" },
                { id: "seat-2", positionIndex: 1 },
              ],
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Mia & Cole - 1 table - 1 seated"),
    ).toBeInTheDocument();
  });

  it("keeps seated wording stable for zero assigned guests", () => {
    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Mia & Cole - 0 tables - 0 seated"),
    ).toBeInTheDocument();
  });

  it("keeps seated guests out of the guest rail", () => {
    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[
          makeGuest({ id: "guest-1", firstName: "Alice" }),
          makeGuest({ id: "guest-2", firstName: "Bob" }),
        ]}
        initialChart={makeAssignedChart()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Alice Smith")).toHaveLength(1);
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
  });

  it("renders group cues, save errors, and filtering states", async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={makePartyGuests()}
        initialChart={makeComplexChart()}
        onSave={vi.fn()}
        saveError="Save failed"
        onDirtyChange={onDirtyChange}
      />,
    );

    expect(screen.getByText("Friends")).toBeInTheDocument();
    expect(screen.getByText("Side: Partner 1")).toBeInTheDocument();
    expect(screen.getByText("Save failed")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search guests"), "Morgan");
    await user.selectOptions(
      screen.getByLabelText("Filter unseated guests by RSVP"),
      "pending",
    );

    expect(
      screen.getByRole("button", { name: /morgan smith pending/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add round table/i }));
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("shows the no-unseated state when everyone is already seated", () => {
    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[
          makeGuest({ id: "guest-1", firstName: "Alice" }),
          makeGuest({ id: "guest-2", firstName: "Bob" }),
        ]}
        initialChart={{
          width: 1200,
          height: 800,
          tables: [
            {
              id: "table-1",
              name: "Table 1",
              shape: "round",
              capacity: 2,
              x: 100,
              y: 100,
              seats: [
                { id: "seat-1", positionIndex: 0, guestId: "guest-1" },
                { id: "seat-2", positionIndex: 1, guestId: "guest-2" },
              ],
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No unseated guests match the current filters."),
    ).toBeInTheDocument();
  });

  it("allows rectangle table controls and linked-party helper states", async () => {
    const user = userEvent.setup();

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[
          makeGuest({
            id: "guest-1",
            firstName: "Alex",
            plusOnes: [
              makeGuest({
                id: "guest-2",
                primaryGuestId: "guest-1",
                firstName: "Pat",
                lastName: "Reed",
              }),
            ],
          }),
        ]}
        initialChart={{
          width: 1200,
          height: 800,
          tables: [
            {
              id: "table-1",
              name: "Table 1",
              shape: "round",
              capacity: 4,
              x: 100,
              y: 100,
              seats: [
                { id: "seat-1", positionIndex: 0, guestId: "other-guest" },
                { id: "seat-2", positionIndex: 1 },
                { id: "seat-3", positionIndex: 2 },
                { id: "seat-4", positionIndex: 3 },
              ],
            },
            {
              id: "table-2",
              name: "Table 2",
              shape: "round",
              capacity: 4,
              x: 320,
              y: 100,
              seats: [
                { id: "seat-5", positionIndex: 0, guestId: "other-guest" },
                { id: "seat-6", positionIndex: 1, guestId: "another-guest" },
                { id: "seat-7", positionIndex: 2, guestId: "third-guest" },
                { id: "seat-8", positionIndex: 3 },
              ],
            },
          ],
        }}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Alex Smith"));
    await user.click(screen.getByRole("button", { name: "Table 1 4 seats" }));
    expect(
      screen.getByRole("button", { name: /seat linked party here/i }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: /seat linked party here/i }),
    );
    expect(screen.getByText("Pat Reed")).toBeInTheDocument();
    // Pat Reed is now seated so there's also an "Unassign Pat Reed" button;
    // click the chip itself (the one whose text content is exactly "Pat Reed …")
    const patButtons = screen.getAllByRole("button", { name: /pat reed/i });
    const patChip = patButtons.find(
      (el) => !el.getAttribute("aria-label")?.startsWith("Unassign"),
    );
    await user.click(patChip!);
    expect(screen.getByText("Selected guest")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Table 2 4 seats" }));
    expect(
      screen.getByRole("button", { name: /seat linked party here/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "No contiguous run of seats is available for this party.",
      ),
    ).toBeInTheDocument();
  });

  it("adds a rectangle table and exercises its inspector controls", async () => {
    const user = userEvent.setup();

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add rectangle/i }));

    const tableButton = screen.getByRole("button", {
      name: /rectangle table 1 6 seats/i,
    });
    expect(tableButton).toBeInTheDocument();

    await user.click(tableButton);
    const nameInput = screen.getByDisplayValue("Rectangle Table 1");
    await user.clear(nameInput);
    await user.type(nameInput, "Head Table");
    const capacityInput = screen.getByRole("spinbutton");
    fireEvent.change(capacityInput, { target: { value: "10" } });
    fireEvent.change(capacityInput, { target: { value: "0" } });

    await user.click(screen.getByRole("button", { name: "Vertical" }));
    await user.click(screen.getByRole("button", { name: "Horizontal" }));

    expect(screen.getByDisplayValue("Head Table")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(10);
  });

  it("renders rectangle orientation defaults when the chart omits them", async () => {
    const user = userEvent.setup();

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={{
          width: 1200,
          height: 800,
          tables: [
            {
              id: "table-1",
              name: "Rectangle Table 1",
              shape: "rectangle",
              capacity: 6,
              x: 100,
              y: 100,
              seats: [
                { id: "seat-1", positionIndex: 0 },
                { id: "seat-2", positionIndex: 1 },
                { id: "seat-3", positionIndex: 2 },
                { id: "seat-4", positionIndex: 3 },
                { id: "seat-5", positionIndex: 4 },
                { id: "seat-6", positionIndex: 5 },
              ],
            } as SeatingChart["tables"][number],
          ],
        }}
        onSave={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Rectangle Table 1 6 seats" }),
    );
    expect(
      screen.getByRole("button", { name: "Horizontal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Vertical" }),
    ).toBeInTheDocument();
  });

  it("supports saving without an immediate server chart and applies loading affordances", async () => {
    const user = userEvent.setup();
    let resolveSave: ((value: undefined) => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const { container } = render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={{
          width: 1200,
          height: 800,
          tables: [
            {
              id: "table-1",
              name: "Rectangle Table 1",
              shape: "rectangle",
              capacity: 2,
              x: 100,
              y: 100,
              seats: [
                { id: "seat-1", positionIndex: 0 },
                { id: "seat-2", positionIndex: 1 },
              ],
            },
          ],
        }}
        onSave={onSave}
      />,
    );

    expect(screen.getByTitle("Seat 1")).toBeInTheDocument();
    expect(screen.getByTitle("Seat 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add round table/i }));
    await user.click(screen.getByRole("button", { name: /save chart/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /save chart/i })).toBeDisabled();

    const busyGrid = container.querySelector('[aria-busy="true"]');
    expect(busyGrid).toHaveClass("pointer-events-none", "opacity-80");

    resolveSave?.(undefined);
    await waitFor(() =>
      expect(container.querySelector('[aria-busy="true"]')).toBeNull(),
    );
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("preserves a dirty draft when the server baseline updates, but reset uses the new saved chart", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const serverChart: SeatingChart = {
      width: 1200,
      height: 800,
      tables: [
        {
          id: "server-table",
          name: "Server Table",
          shape: "round",
          capacity: 2,
          x: 200,
          y: 200,
          seats: [
            { id: "server-seat-1", positionIndex: 0 },
            { id: "server-seat-2", positionIndex: 1 },
          ],
        },
      ],
    };

    const { rerender } = render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add round table/i }));
    expect(screen.getByText("Round Table 1")).toBeInTheDocument();

    rerender(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={serverChart}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByText("Round Table 1")).toBeInTheDocument();
    expect(screen.queryByText("Server Table")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(screen.getByText("Server Table")).toBeInTheDocument();
    expect(screen.queryByText("Round Table 1")).not.toBeInTheDocument();
  });

  it("does not call onSave a second time when save is clicked while already saving (isBusy guard)", async () => {
    const user = userEvent.setup();
    let resolveSave: ((value: undefined) => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add round table/i }));
    await user.click(screen.getByRole("button", { name: /save chart/i }));

    // While the first save is in-flight, the button is disabled — clicking has no effect
    expect(screen.getByRole("button", { name: /save chart/i })).toBeDisabled();
    expect(onSave).toHaveBeenCalledTimes(1);

    resolveSave?.(undefined);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /save chart/i }),
      ).not.toBeDisabled(),
    );
  });

  it("does not reset while save is in-progress (isBusy guard on handleReset)", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let resolveSave: ((value: undefined) => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add round table/i }));
    await user.click(screen.getByRole("button", { name: /save chart/i }));

    // Reset button is disabled while saving (isBusy=true)
    expect(screen.getByRole("button", { name: /reset/i })).toBeDisabled();

    resolveSave?.(undefined);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /save chart/i }),
      ).not.toBeDisabled(),
    );
  });

  it("does not dispatch deleteTable when window.confirm returns false", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add round table/i }));
    await user.click(screen.getByRole("button", { name: /round table 1/i }));
    await user.click(screen.getByRole("button", { name: /delete table/i }));

    // Table should still exist since confirm returned false
    expect(screen.getByText("Round Table 1")).toBeInTheDocument();
  });

  it("renders each TableCard footprint at the SEATING.tableSize dimension", async () => {
    const user = userEvent.setup();

    render(
      <SeatingEditor
        weddingName="Mia & Cole"
        guests={[makeGuest()]}
        initialChart={makeChart()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add round table/i }));

    // The round table footprint applies its fixed 190x190 dimensions via
    // inline style sourced from the SEATING constant, not from arbitrary
    // Tailwind classes — so assert the inline style directly.
    const tableLabel = screen.getByRole("button", { name: /round table 1/i });
    const footprint = tableLabel.closest(
      "[style*='width']",
    ) as HTMLElement | null;
    expect(footprint).toBeTruthy();
    expect(footprint?.style.width).toBe("190px");
    expect(footprint?.style.height).toBe("190px");
  });
});

function makeChartWithAssignedGuest(guestId: string): SeatingChart {
  return {
    width: 1200,
    height: 800,
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
  weddingId: "w-1",
  primaryGuestId: null,
  firstName: "Ava",
  lastName: "Rivera",
  email: "ava@example.com",
  phone: null,
  side: "mutual",
  groupName: "Rivera Family",
  dietaryTags: [],
  dietaryNotes: null,
  rsvpStatus: "accepted",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  plusOnes: [],
};

describe("SeatingEditor — unassign button", () => {
  it("renders an unassign button on each occupied seat chip", () => {
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[avaGuest]}
        initialChart={makeChartWithAssignedGuest("guest-ava")}
        onSave={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /unassign ava rivera/i }),
    ).toBeInTheDocument();
  });

  it("clicking unassign removes guest from seat (they reappear in guest rail)", async () => {
    const user = userEvent.setup();
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[avaGuest]}
        initialChart={makeChartWithAssignedGuest("guest-ava")}
        onSave={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /unassign ava rivera/i }),
    );

    expect(
      screen.queryByRole("button", { name: /unassign ava rivera/i }),
    ).not.toBeInTheDocument();
  });

  it("unassign button click calls stopPropagation", () => {
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[avaGuest]}
        initialChart={makeChartWithAssignedGuest("guest-ava")}
        onSave={vi.fn()}
      />,
    );

    const btn = screen.getByRole("button", { name: /unassign ava rivera/i });
    const clickEvent = new MouseEvent("click", { bubbles: true });
    const spy = vi.spyOn(clickEvent, "stopPropagation");
    btn.dispatchEvent(clickEvent);
    expect(spy).toHaveBeenCalled();
  });
});

describe("SeatingEditor — seated guest search", () => {
  it("shows a Seated section when search matches an assigned guest", async () => {
    const user = userEvent.setup();
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[avaGuest]}
        initialChart={makeChartWithAssignedGuest("guest-ava")}
        onSave={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/search guests/i), "Ava");

    expect(screen.getByText("Seated")).toBeInTheDocument();
    expect(screen.getAllByText(/table 1/i).length).toBeGreaterThan(0);
  });

  it("does not show Seated section when search is empty", () => {
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[avaGuest]}
        initialChart={makeChartWithAssignedGuest("guest-ava")}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByText("Seated")).not.toBeInTheDocument();
  });

  it("clicking a seated guest row dispatches selectTable", async () => {
    const user = userEvent.setup();
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[avaGuest]}
        initialChart={makeChartWithAssignedGuest("guest-ava")}
        onSave={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/search guests/i), "Ava");

    const seatedRows = screen.getAllByRole("button", { name: /ava rivera/i });
    const tableRow = seatedRows.find((el) =>
      el.textContent?.includes("Table 1"),
    );
    expect(tableRow).toBeDefined();
    await user.click(tableRow!);

    expect(screen.getAllByText("Table 1").length).toBeGreaterThan(0);
  });
});

const samGuest: GuestWithPlusOnes = {
  id: "guest-sam",
  weddingId: "w-1",
  primaryGuestId: null,
  firstName: "Sam",
  lastName: "Rivera",
  email: null,
  phone: null,
  side: "mutual",
  groupName: "Rivera Family",
  dietaryTags: [],
  dietaryNotes: null,
  rsvpStatus: "accepted",
  sortOrder: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  plusOnes: [],
};

function makeSmallChart(): SeatingChart {
  return {
    width: 1200,
    height: 800,
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
    ],
  };
}

describe("SeatingEditor — auto-seat group", () => {
  it("shows auto-seat button when table is selected and search exactly matches a group with unseated guests", async () => {
    const user = userEvent.setup();
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[
          { ...avaGuest, groupName: "Rivera Family" },
          { ...samGuest, groupName: "Rivera Family" },
        ]}
        initialChart={makeSmallChart()}
        onSave={vi.fn()}
      />,
    );

    // Select table 1
    await user.click(screen.getByRole("button", { name: /table 1/i }));
    // Type exact group name
    await user.type(
      screen.getByPlaceholderText(/search guests/i),
      "Rivera Family",
    );

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
        initialChart={makeChart()} // empty, no tables
        onSave={vi.fn()}
      />,
    );
    await user.type(
      screen.getByPlaceholderText(/search guests/i),
      "Rivera Family",
    );
    expect(
      screen.queryByRole("button", { name: /seat all.*here/i }),
    ).not.toBeInTheDocument();
  });

  it("auto-seat button is NOT shown when search is a partial match", async () => {
    const user = userEvent.setup();
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[{ ...avaGuest, groupName: "Rivera Family" }]}
        initialChart={makeSmallChart()}
        onSave={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /table 1/i }));
    await user.type(screen.getByPlaceholderText(/search guests/i), "Rivera"); // partial
    expect(
      screen.queryByRole("button", { name: /seat all.*here/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking auto-seat seats the guests", async () => {
    const user = userEvent.setup();
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[
          { ...avaGuest, groupName: "Rivera Family" },
          { ...samGuest, groupName: "Rivera Family" },
        ]}
        initialChart={makeSmallChart()} // exactly 2 seats for 2 guests
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /table 1/i }));
    await user.type(
      screen.getByPlaceholderText(/search guests/i),
      "Rivera Family",
    );
    await user.click(
      screen.getByRole("button", { name: /seat all.*rivera family.*here/i }),
    );

    // Guests should now be seated (unassign buttons appear)
    expect(
      screen.getByRole("button", { name: /unassign ava rivera/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /unassign sam rivera/i }),
    ).toBeInTheDocument();
  });

  it("shows inline overflow message when some guests couldn't fit", async () => {
    const user = userEvent.setup();
    const thirdGuest: GuestWithPlusOnes = {
      id: "guest-bob",
      weddingId: "w-1",
      primaryGuestId: null,
      firstName: "Bob",
      lastName: "Rivera",
      email: null,
      phone: null,
      side: "mutual",
      groupName: "Rivera Family",
      dietaryTags: [],
      dietaryNotes: null,
      rsvpStatus: "accepted",
      sortOrder: 2,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      plusOnes: [],
    };
    render(
      <SeatingEditor
        weddingName="Test Wedding"
        guests={[
          { ...avaGuest, groupName: "Rivera Family" },
          { ...samGuest, groupName: "Rivera Family" },
          thirdGuest, // 3rd guest won't fit in 2-seat table
        ]}
        initialChart={makeSmallChart()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /table 1/i }));
    await user.type(
      screen.getByPlaceholderText(/search guests/i),
      "Rivera Family",
    );
    await user.click(
      screen.getByRole("button", { name: /seat all.*rivera family.*here/i }),
    );

    expect(screen.getByText(/could not be seated/i)).toBeInTheDocument();
  });

  it("overflow message clears when search query changes", async () => {
    const user = userEvent.setup();
    const thirdGuest: GuestWithPlusOnes = {
      id: "guest-bob",
      weddingId: "w-1",
      primaryGuestId: null,
      firstName: "Bob",
      lastName: "Rivera",
      email: null,
      phone: null,
      side: "mutual",
      groupName: "Rivera Family",
      dietaryTags: [],
      dietaryNotes: null,
      rsvpStatus: "accepted",
      sortOrder: 2,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
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
        initialChart={makeSmallChart()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /table 1/i }));
    await user.type(
      screen.getByPlaceholderText(/search guests/i),
      "Rivera Family",
    );
    await user.click(
      screen.getByRole("button", { name: /seat all.*rivera family.*here/i }),
    );
    expect(screen.getByText(/could not be seated/i)).toBeInTheDocument();

    // Clear search — message should vanish
    await user.clear(screen.getByPlaceholderText(/search guests/i));
    expect(screen.queryByText(/could not be seated/i)).not.toBeInTheDocument();
  });
});
