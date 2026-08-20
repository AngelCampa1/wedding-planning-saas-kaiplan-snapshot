import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setActiveWeddingId = vi.fn();
const mutateAsync = vi.fn();
const routeContext = {
  auth: {
    user: {
      name: "Angel Campa",
      email: "angel@example.com",
    },
  },
};

let capturedShouldBlockFn:
  | ((args: { action: string; current: unknown; next: unknown }) => boolean)
  | null = null;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useRouteContext: () => routeContext,
  }),
  useRouter: () => ({
    navigate: vi.fn(),
    history: {
      back: vi.fn(),
      forward: vi.fn(),
      go: vi.fn(),
    },
  }),
  useBlocker: vi.fn(
    (opts: {
      shouldBlockFn: (args: {
        action: string;
        current: unknown;
        next: unknown;
      }) => boolean;
    }) => {
      capturedShouldBlockFn = opts.shouldBlockFn;
      return { status: "idle", proceed: vi.fn(), reset: vi.fn() };
    },
  ),
  Link: ({
    children,
    to,
  }: {
    children: import("react").ReactNode;
    to: string;
  }) => <a href={to}>{children}</a>,
}));

vi.mock("../../src/components/top-bar", () => ({
  TopBar: ({ onSelectWedding }: { onSelectWedding: (id: string) => void }) => (
    <button type="button" onClick={() => onSelectWedding("w-2")}>
      Switch wedding
    </button>
  ),
}));

vi.mock("../../src/components/seating/seating-editor", () => ({
  SeatingEditor: ({
    onDirtyChange,
    onSave,
    saveError,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
    onSave: (chart: unknown) => Promise<void>;
    saveError?: string | null;
  }) => (
    <div>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        Mark dirty
      </button>
      <button
        type="button"
        onClick={() => {
          void onSave({ width: 1200, height: 800, tables: [] });
        }}
      >
        Trigger save
      </button>
      {saveError ? <p>{saveError}</p> : null}
    </div>
  ),
}));

vi.mock("../../src/hooks/use-weddings", () => ({
  useWeddings: vi.fn(),
}));

vi.mock("../../src/hooks/use-seating", () => ({
  useSeatingChart: vi.fn(),
  useSaveSeatingChart: vi.fn(),
}));

vi.mock("../../src/hooks/use-guests", () => ({
  useGuests: vi.fn(),
}));

vi.mock("../../src/lib/wedding-context", () => ({
  useActiveWedding: vi.fn(),
}));

import { SeatingPage } from "../../src/routes/_authenticated/seating";
import { useActiveWedding } from "../../src/lib/wedding-context";
import { useGuests } from "../../src/hooks/use-guests";
import {
  useSaveSeatingChart,
  useSeatingChart,
} from "../../src/hooks/use-seating";
import { useWeddings } from "../../src/hooks/use-weddings";

const mockUseWeddings = vi.mocked(useWeddings);
const mockUseSeatingChart = vi.mocked(useSeatingChart);
const mockUseSaveSeatingChart = vi.mocked(useSaveSeatingChart);
const mockUseGuests = vi.mocked(useGuests);
const mockUseActiveWedding = vi.mocked(useActiveWedding);

beforeEach(() => {
  vi.clearAllMocks();

  mockUseWeddings.mockReturnValue({
    data: [
      { id: "w-1", name: "Mia & Cole", role: "owner", date: null },
      { id: "w-2", name: "Ava & Finn", role: "editor", date: null },
    ],
    isLoading: false,
  } as ReturnType<typeof useWeddings>);
  mockUseActiveWedding.mockReturnValue({
    activeWeddingId: "w-1",
    setActiveWeddingId,
    setWeddingSwitchGuard: vi.fn(),
  } as ReturnType<typeof useActiveWedding>);
  mockUseSeatingChart.mockReturnValue({
    data: {
      chart: { width: 1200, height: 800, tables: [] },
      summary: {
        tableCount: 0,
        seatCount: 0,
        assignedSeatCount: 0,
        unassignedSeatCount: 0,
      },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as ReturnType<typeof useSeatingChart>);
  mockUseGuests.mockReturnValue({
    data: [
      {
        id: "g-1",
        firstName: "Alex",
        lastName: "Rivera",
        primaryGuestId: null,
        rsvpStatus: "accepted",
        plusOnes: [],
        weddingId: "w-1",
        side: "mutual",
        groupName: null,
        email: null,
        phone: null,
        dietaryTags: [],
        dietaryNotes: null,
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as ReturnType<typeof useGuests>);
  mockUseSaveSeatingChart.mockReturnValue({
    mutateAsync,
    isPending: false,
  } as ReturnType<typeof useSaveSeatingChart>);
});

describe("SeatingPage", () => {
  it("shows a create-wedding state instead of spinning when no wedding exists", () => {
    mockUseWeddings.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mockUseActiveWedding.mockReturnValue({
      activeWeddingId: null,
      setActiveWeddingId,
      setWeddingSwitchGuard: vi.fn(),
    } as ReturnType<typeof useActiveWedding>);

    render(<SeatingPage />);

    expect(screen.getByText("Create a wedding first")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create wedding" }),
    ).toHaveAttribute("href", "/onboarding");
    expect(
      screen.queryByText("Set up your guest list first"),
    ).not.toBeInTheDocument();
  });

  it("calls useBlocker with a shouldBlockFn that returns true when isDirty", async () => {
    const user = userEvent.setup();
    capturedShouldBlockFn = null;

    render(<SeatingPage />);

    // shouldBlockFn should return false initially (not dirty)
    expect(capturedShouldBlockFn).not.toBeNull();
    expect(
      capturedShouldBlockFn?.({ action: "PUSH", current: {}, next: {} }),
    ).toBe(false);

    // Mark dirty
    await user.click(screen.getByRole("button", { name: "Mark dirty" }));

    // After marking dirty, shouldBlockFn should return true
    expect(
      capturedShouldBlockFn?.({ action: "PUSH", current: {}, next: {} }),
    ).toBe(true);
  });

  it("blocks wedding switching when the seating draft is dirty and the user cancels", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    let weddingSwitchGuard: ((nextWeddingId: string) => boolean) | null = null;
    const setWeddingSwitchGuard = vi.fn(
      (guard: ((nextWeddingId: string) => boolean) | null) => {
        weddingSwitchGuard = guard;
      },
    );
    const guardedSetActiveWeddingId = (nextWeddingId: string) => {
      if (weddingSwitchGuard && !weddingSwitchGuard(nextWeddingId)) {
        return;
      }

      setActiveWeddingId(nextWeddingId);
    };

    mockUseActiveWedding.mockReturnValue({
      activeWeddingId: "w-1",
      setActiveWeddingId: guardedSetActiveWeddingId,
      setWeddingSwitchGuard,
    } as ReturnType<typeof useActiveWedding>);

    render(<SeatingPage />);

    await user.click(screen.getByRole("button", { name: "Mark dirty" }));
    guardedSetActiveWeddingId("w-2");

    expect(confirmSpy).toHaveBeenCalled();
    expect(setActiveWeddingId).not.toHaveBeenCalled();
  });

  it("surfaces a save failure message when saving the chart fails", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(new Error("save failed"));

    render(<SeatingPage />);

    await user.click(screen.getByRole("button", { name: "Trigger save" }));

    expect(
      await screen.findByText(
        "We couldn't save your seating chart. Try again.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an 'add guests first' prompt when no guests exist", () => {
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useGuests>);

    render(<SeatingPage />);

    expect(
      screen.getByText("Set up your guest list first"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add your guests first, then come back to arrange seating.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to guests/i })).toHaveAttribute(
      "href",
      "/guests",
    );
  });

  it("shows a retryable load error when guests fail after the chart loads", () => {
    const refetchGuests = vi.fn();
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("guest load failed"),
      refetch: refetchGuests,
    } as ReturnType<typeof useGuests>);

    render(<SeatingPage />);

    expect(
      screen.getByText("Couldn't load the seating chart"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(
      screen.queryByText("Set up your guest list first"),
    ).not.toBeInTheDocument();
  });
});
