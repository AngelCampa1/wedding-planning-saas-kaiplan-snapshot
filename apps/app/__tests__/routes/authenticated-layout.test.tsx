import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";

const routeContext = {
  auth: {
    isAuthenticated: true,
    user: {
      id: "user-1",
      name: "Manual QA",
      email: "qa@example.com",
    },
  },
};

let OutletComponent = () => <div>Outlet content</div>;
const billingSummaryState = {
  data: { billingGateRequired: false },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
const weddingsState = {
  data: [] as Array<{
    id: string;
    name: string;
    createdBy?: string;
    role?: "owner" | "editor" | "viewer";
  }>,
  isLoading: false,
};

// Stable invalidate mock shared across all renders in a test
const {
  mockInvalidate,
  mockNavigate,
  acceptPendingInviteMock,
  consumeStoredInviteTokenMock,
  storeInviteTokenMock,
} = vi.hoisted(() => ({
  mockInvalidate: vi.fn().mockResolvedValue(undefined),
  mockNavigate: vi.fn().mockResolvedValue(undefined),
  acceptPendingInviteMock: vi.fn().mockResolvedValue(undefined),
  consumeStoredInviteTokenMock: vi.fn(),
  storeInviteTokenMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => <OutletComponent />,
  redirect: vi.fn(),
  useMatchRoute: () => () => false,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: mockInvalidate, navigate: mockNavigate }),
  useLocation: () => ({
    pathname: window.location.pathname,
    search: Object.fromEntries(new URLSearchParams(window.location.search)),
  }),
  createFileRoute: () => () => ({
    useRouteContext: () => routeContext,
  }),
}));

vi.mock("../../src/hooks/use-weddings", () => ({
  useWeddings: () => weddingsState,
}));

vi.mock("../../src/hooks/use-billing", () => ({
  useBillingSummary: () => billingSummaryState,
}));

vi.mock("../../src/lib/auth-client", () => ({
  acceptPendingInvite: acceptPendingInviteMock,
  consumeStoredInviteToken: consumeStoredInviteTokenMock,
  storeInviteToken: storeInviteTokenMock,
  authClient: {
    useSession: () => ({
      data: { user: routeContext.auth.user },
      isPending: false,
      error: null,
    }),
  },
}));

vi.mock("../../src/components/user-menu", () => ({
  UserMenu: () => <div>User menu</div>,
}));

vi.mock("../../src/components/wedding-picker", () => ({
  WeddingPicker: ({
    activeWeddingId,
    onSelect,
  }: {
    activeWeddingId: string;
    onSelect: (id: string) => void;
  }) => (
    <div>
      <span>Wedding picker {activeWeddingId}</span>
      <button type="button" onClick={() => onSelect("wedding-2")}>
        Switch wedding
      </button>
    </div>
  ),
}));

import { useActiveWedding } from "../../src/lib/wedding-context";
import { AuthenticatedLayout } from "../../src/routes/_authenticated";

describe("AuthenticatedLayout", () => {
  beforeEach(() => {
    billingSummaryState.data = { billingGateRequired: false };
    billingSummaryState.isLoading = false;
    billingSummaryState.isError = false;
    billingSummaryState.refetch.mockReset();
    mockNavigate.mockClear();
    mockInvalidate.mockClear();
    weddingsState.data = [];
    weddingsState.isLoading = false;
    window.sessionStorage.clear();
    acceptPendingInviteMock.mockReset();
    acceptPendingInviteMock.mockResolvedValue(undefined);
    consumeStoredInviteTokenMock.mockReset();
    consumeStoredInviteTokenMock.mockReturnValue(undefined);
    storeInviteTokenMock.mockReset();
    routeContext.auth.user.id = "user-1";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("respects a registered wedding-switch guard in the mobile shell picker", async () => {
    OutletComponent = function GuardedOutlet() {
      const { activeWeddingId, setWeddingSwitchGuard } = useActiveWedding();

      useEffect(() => {
        setWeddingSwitchGuard(() => false);
        return () => setWeddingSwitchGuard(null);
      }, [setWeddingSwitchGuard]);

      return <div>Active wedding {activeWeddingId ?? "none"}</div>;
    };

    window.history.replaceState({}, "", "/dashboard");

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Active wedding none")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch wedding" }),
    ).toBeInTheDocument();
    screen.getByRole("button", { name: "Switch wedding" }).click();

    expect(screen.getByText("Active wedding none")).toBeInTheDocument();

    OutletComponent = () => <div>Outlet content</div>;
  });

  it("keeps a mobile navigation entry point available across authenticated routes", () => {
    OutletComponent = () => <div>Outlet content</div>;
    window.history.replaceState({}, "", "/dashboard");

    render(<AuthenticatedLayout />);

    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn on Help mode" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open help" })).toHaveAttribute(
      "href",
      "/help",
    );
    expect(screen.getByText("Outlet content")).toBeInTheDocument();
  });

  it("hides mobile navigation while onboarding is still in progress", () => {
    OutletComponent = () => <div>Outlet content</div>;
    window.history.replaceState({}, "", "/onboarding");

    render(<AuthenticatedLayout />);

    expect(
      screen.queryByRole("button", { name: "Open navigation" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Outlet content")).toBeInTheDocument();
  });

  it("calls router.invalidate when auth.user.id changes but NOT on initial mount", async () => {
    OutletComponent = () => <div>Outlet content</div>;
    window.history.replaceState({}, "", "/dashboard");

    mockInvalidate.mockClear();

    const { rerender } = render(<AuthenticatedLayout />);

    // M18 fix: invalidate is skipped on initial mount to avoid redundant re-fetch
    const callCountAfterMount = mockInvalidate.mock.calls.length;
    expect(callCountAfterMount).toBe(0);

    // Simulate a user id change
    routeContext.auth.user.id = "user-2";

    rerender(<AuthenticatedLayout />);

    // Should have been called after the user id changed
    expect(mockInvalidate.mock.calls.length).toBeGreaterThan(
      callCountAfterMount,
    );

    // Restore
    routeContext.auth.user.id = "user-1";
  });

  it("accepts pending invites after an authenticated session is available", async () => {
    OutletComponent = () => <div>Outlet content</div>;
    window.history.replaceState({}, "", "/dashboard?inviteToken=invite-1");

    render(<AuthenticatedLayout />);

    expect(acceptPendingInviteMock).toHaveBeenCalledWith("invite-1");
    await waitFor(() =>
      expect(window.location.search).not.toContain("inviteToken"),
    );
  });

  it("accepts stored invite tokens after an OAuth callback", () => {
    consumeStoredInviteTokenMock.mockReturnValue("stored-invite-1");
    OutletComponent = () => <div>Outlet content</div>;
    window.history.replaceState({}, "", "/dashboard");

    render(<AuthenticatedLayout />);

    expect(acceptPendingInviteMock).toHaveBeenCalledWith("stored-invite-1");
  });

  it("does not call invite acceptance without a token", () => {
    OutletComponent = () => <div>Outlet content</div>;
    window.history.replaceState({}, "", "/dashboard");

    render(<AuthenticatedLayout />);

    expect(acceptPendingInviteMock).not.toHaveBeenCalled();
  });

  it("retries pending invite acceptance after a transient failure", async () => {
    vi.useFakeTimers();
    acceptPendingInviteMock
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue(undefined);
    OutletComponent = () => <div>Outlet content</div>;
    window.history.replaceState({}, "", "/dashboard?inviteToken=retry-token");

    render(<AuthenticatedLayout />);

    expect(acceptPendingInviteMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(acceptPendingInviteMock).toHaveBeenCalledTimes(2);
    expect(acceptPendingInviteMock).toHaveBeenLastCalledWith("retry-token");
    vi.useRealTimers();
  });

  it("does not schedule an invite retry after unmount", async () => {
    vi.useFakeTimers();
    let rejectInvite: (error: Error) => void = () => undefined;
    acceptPendingInviteMock.mockReturnValue(
      new Promise((_, reject) => {
        rejectInvite = reject;
      }),
    );
    OutletComponent = () => <div>Outlet content</div>;
    window.history.replaceState({}, "", "/dashboard?inviteToken=invite-1");

    const { unmount } = render(<AuthenticatedLayout />);
    expect(acceptPendingInviteMock).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      rejectInvite(new Error("late failure"));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(acceptPendingInviteMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("fails closed when billing verification errors", async () => {
    const user = userEvent.setup();
    billingSummaryState.isError = true;
    window.history.replaceState({}, "", "/dashboard");

    render(<AuthenticatedLayout />);

    expect(
      screen.getByText("We couldn't verify your billing status."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Retry billing check" }),
    );
    expect(billingSummaryState.refetch).toHaveBeenCalledTimes(1);
  });

  it("does not redirect collaborators with shared wedding access into subscribe", () => {
    billingSummaryState.data = { billingGateRequired: true };
    weddingsState.data = [
      {
        id: "wedding-1",
        name: "Shared Wedding",
        createdBy: "owner-1",
        role: "editor",
      },
    ];
    window.history.replaceState({}, "", "/dashboard");

    render(<AuthenticatedLayout />);

    expect(screen.getByText("Outlet content")).toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't verify your billing status."),
    ).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("redirects an owned resolved wedding to subscribe even when another wedding is shared", async () => {
    billingSummaryState.data = { billingGateRequired: true };
    weddingsState.data = [
      {
        id: "owned-wedding",
        name: "Owned Wedding",
        createdBy: "user-1",
        role: "owner",
      },
      {
        id: "shared-wedding",
        name: "Shared Wedding",
        createdBy: "owner-1",
        role: "editor",
      },
    ];
    window.sessionStorage.setItem("kaiplan:activeWeddingId", "owned-wedding");
    window.history.replaceState({}, "", "/dashboard");

    render(<AuthenticatedLayout />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/subscribe",
        replace: true,
        search: { checkout: undefined },
      }),
    );
  });

  it("preserves collaborator access when the resolved wedding is shared", () => {
    billingSummaryState.data = { billingGateRequired: true };
    weddingsState.data = [
      {
        id: "owned-wedding",
        name: "Owned Wedding",
        createdBy: "user-1",
        role: "owner",
      },
      {
        id: "shared-wedding",
        name: "Shared Wedding",
        createdBy: "owner-1",
        role: "editor",
      },
    ];
    window.sessionStorage.setItem("kaiplan:activeWeddingId", "shared-wedding");
    window.history.replaceState({}, "", "/dashboard");

    render(<AuthenticatedLayout />);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText("Outlet content")).toBeInTheDocument();
  });

  it("blocks route content while validating a stored active wedding", async () => {
    OutletComponent = function ActiveWeddingOutlet() {
      const { activeWeddingId } = useActiveWedding();
      return <div>Active wedding {activeWeddingId ?? "none"}</div>;
    };
    weddingsState.isLoading = true;
    window.sessionStorage.setItem("kaiplan:activeWeddingId", "stale-wedding");
    window.history.replaceState({}, "", "/dashboard");

    const { rerender } = render(<AuthenticatedLayout />);

    expect(screen.queryByText(/Active wedding/)).not.toBeInTheDocument();
    expect(screen.queryByText("Outlet content")).not.toBeInTheDocument();

    weddingsState.isLoading = false;
    weddingsState.data = [
      {
        id: "current-wedding",
        name: "Current Wedding",
        createdBy: "user-1",
        role: "owner",
      },
    ];
    rerender(<AuthenticatedLayout />);

    await waitFor(() =>
      expect(
        screen.getByText("Active wedding current-wedding"),
      ).toBeInTheDocument(),
    );
    expect(window.sessionStorage.getItem("kaiplan:activeWeddingId")).toBe(
      "current-wedding",
    );

    OutletComponent = () => <div>Outlet content</div>;
  });

  it("replaces a stale stored active wedding before route content loads", async () => {
    OutletComponent = function ActiveWeddingOutlet() {
      const { activeWeddingId } = useActiveWedding();
      return <div>Active wedding {activeWeddingId ?? "none"}</div>;
    };
    weddingsState.data = [
      {
        id: "current-wedding",
        name: "Current Wedding",
        createdBy: "user-1",
        role: "owner",
      },
    ];
    window.sessionStorage.setItem("kaiplan:activeWeddingId", "stale-wedding");
    window.history.replaceState({}, "", "/dashboard");

    render(<AuthenticatedLayout />);

    await waitFor(() =>
      expect(
        screen.getByText("Active wedding current-wedding"),
      ).toBeInTheDocument(),
    );
    expect(window.sessionStorage.getItem("kaiplan:activeWeddingId")).toBe(
      "current-wedding",
    );

    OutletComponent = () => <div>Outlet content</div>;
  });
});
