import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const routeContext = {
  auth: {
    user: {
      id: "user-1",
      name: "Angel Campa",
      email: "angel@example.com",
    },
  },
};
const routeSearch: {
  plan?: "starter" | "pro" | "lifetime";
  interval?: "month" | "year";
  checkout?: "success" | "cancel";
} = {};
const navigateFn = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useRouteContext: () => routeContext,
    useSearch: () => routeSearch,
    useNavigate: () => navigateFn,
  }),
}));

vi.mock("../../src/hooks/use-billing", () => ({
  useBillingSummary: vi.fn(),
  useBillingHistory: vi.fn(),
  useBillingCheckout: vi.fn(),
  useBillingPortal: vi.fn(),
}));

vi.mock("../../src/hooks/use-email-preferences", () => ({
  useEmailPreferences: vi.fn(),
  useUpdateEmailPreferences: vi.fn(),
}));

vi.mock("../../src/hooks/use-weddings", () => ({
  useWeddings: vi.fn(),
  useArchiveWedding: vi.fn(),
  useUnarchiveWedding: vi.fn(),
}));

vi.mock("../../src/hooks/use-wedding-members", () => ({
  useWeddingMembers: vi.fn(),
  useInviteMember: vi.fn(),
  useRemoveMember: vi.fn(),
  useUpdateMemberRole: vi.fn(),
}));

vi.mock("../../src/lib/wedding-context", () => ({
  useActiveWedding: vi.fn(),
}));

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../src/components/billing/billing-section", () => ({
  BillingSection: ({
    summary,
    nextPlan,
    onManageBilling,
  }: {
    summary: { plan: string } | undefined;
    nextPlan: string | null;
    onManageBilling: () => void;
  }) => (
    <div>
      <div>{summary ? summary.plan : "no billing"}</div>
      <div>{nextPlan ? `next:${nextPlan}` : "next:none"}</div>
      <button onClick={onManageBilling}>portal</button>
    </div>
  ),
}));

vi.mock("../../src/components/billing/plan-comparison", () => ({
  PlanComparison: ({
    onCheckout,
  }: {
    onCheckout: (plan: "starter", interval: "month") => Promise<void>;
  }) => (
    <div>
      <button onClick={() => void onCheckout("starter", "month")}>
        checkout-starter
      </button>
    </div>
  ),
}));

import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../../src/routes/_authenticated/settings";
import {
  useBillingSummary,
  useBillingHistory,
  useBillingCheckout,
  useBillingPortal,
} from "../../src/hooks/use-billing";
import {
  useEmailPreferences,
  useUpdateEmailPreferences,
} from "../../src/hooks/use-email-preferences";
import {
  useWeddings,
  useArchiveWedding,
  useUnarchiveWedding,
} from "../../src/hooks/use-weddings";
import {
  useWeddingMembers,
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
} from "../../src/hooks/use-wedding-members";
import { useActiveWedding } from "../../src/lib/wedding-context";
import { apiFetch } from "../../src/lib/api";

const mockedUseBillingSummary = vi.mocked(useBillingSummary);
const mockedUseBillingHistory = vi.mocked(useBillingHistory);
const mockedUseBillingCheckout = vi.mocked(useBillingCheckout);
const mockedUseBillingPortal = vi.mocked(useBillingPortal);
const mockedUseEmailPreferences = vi.mocked(useEmailPreferences);
const mockedUseUpdateEmailPreferences = vi.mocked(useUpdateEmailPreferences);
const mockedUseWeddings = vi.mocked(useWeddings);
const mockedUseArchiveWedding = vi.mocked(useArchiveWedding);
const mockedUseUnarchiveWedding = vi.mocked(useUnarchiveWedding);
const mockedUseWeddingMembers = vi.mocked(useWeddingMembers);
const mockedUseInviteMember = vi.mocked(useInviteMember);
const mockedUseRemoveMember = vi.mocked(useRemoveMember);
const mockedUseUpdateMemberRole = vi.mocked(useUpdateMemberRole);
const mockedUseActiveWedding = vi.mocked(useActiveWedding);
const mockedApiFetch = vi.mocked(apiFetch);

const WEDDING_ROW = {
  id: "wedding-1",
  name: "My Wedding",
  date: "2025-06-15",
  budgetCents: 500000,
  currency: "USD",
  timezone: "America/New_York",
  createdBy: "user-1",
  archivedAt: null,
  status: "planning" as const,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  role: "owner" as const,
};

const MEMBER_ROW = {
  id: "member-1",
  weddingId: "wedding-1",
  userId: "user-1",
  role: "owner" as const,
  invitedEmail: null,
  acceptedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
};

const OTHER_MEMBER = {
  id: "member-2",
  weddingId: "wedding-1",
  userId: "user-2",
  role: "editor" as const,
  invitedEmail: "editor@example.com",
  acceptedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateFn.mockReset();
    navigateFn.mockResolvedValue(undefined);
    delete routeSearch.plan;
    delete routeSearch.interval;
    delete routeSearch.checkout;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        assign: vi.fn(),
      },
    });

    mockedUseActiveWedding.mockReturnValue({
      activeWeddingId: "wedding-1",
      setActiveWeddingId: vi.fn(),
      setWeddingSwitchGuard: vi.fn(),
    });
    mockedUseWeddings.mockReturnValue({
      data: [WEDDING_ROW],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mockedUseArchiveWedding.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useArchiveWedding>);
    mockedUseUnarchiveWedding.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useUnarchiveWedding>);
    mockedUseWeddingMembers.mockReturnValue({
      data: [MEMBER_ROW, OTHER_MEMBER],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useWeddingMembers>);
    mockedUseInviteMember.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useInviteMember>);
    mockedUseRemoveMember.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useRemoveMember>);
    mockedUseUpdateMemberRole.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useUpdateMemberRole>);

    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "starter",
        status: "active",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        features: ["vendors", "extraPlanner"],
        canManageBilling: true,
      },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useBillingSummary>);
    mockedUseBillingHistory.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useBillingHistory>);
    mockedUseBillingCheckout.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useBillingCheckout>);
    mockedUseBillingPortal.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useBillingPortal>);
    mockedUseEmailPreferences.mockReturnValue({
      data: {
        email: "angel@example.com",
        preferences: {
          memberInvite: true,
          rsvpConfirmation: true,
          rsvpReminder: false,
        },
      },
      isLoading: false,
    } as ReturnType<typeof useEmailPreferences>);
    mockedUseUpdateEmailPreferences.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useUpdateEmailPreferences>);
  });

  it("shows account and billing information", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Angel Campa")).toBeInTheDocument();
    expect(screen.getByText("angel@example.com")).toBeInTheDocument();
    expect(screen.getByText("starter")).toBeInTheDocument();
    expect(screen.getByText("What lands in inboxes.")).toBeInTheDocument();
    expect(screen.getByText("RSVP reminders")).toBeInTheDocument();
  });

  it("renders clean loading copy for email preferences", () => {
    mockedUseEmailPreferences.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useEmailPreferences>);

    render(<SettingsPage />);

    expect(screen.getByText(/loading preferences/i)).toBeInTheDocument();
    expect(screen.queryByText(/â€¦/)).not.toBeInTheDocument();
  });

  it("does not navigate when billing mutations resolve without a url", async () => {
    const user = userEvent.setup();
    const checkout = vi.fn().mockResolvedValue({ url: null });
    const portal = vi.fn().mockResolvedValue({ url: null });
    mockedUseBillingCheckout.mockReturnValue({
      mutateAsync: checkout,
      isPending: false,
    } as ReturnType<typeof useBillingCheckout>);
    mockedUseBillingPortal.mockReturnValue({
      mutateAsync: portal,
      isPending: false,
    } as ReturnType<typeof useBillingPortal>);

    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "checkout-starter" }));
    await user.click(screen.getByRole("button", { name: "portal" }));

    expect(checkout).toHaveBeenCalledWith({
      plan: "starter",
      interval: "month",
    });
    expect(portal).toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("shows a billing management error when the portal cannot be opened", async () => {
    const user = userEvent.setup();
    const portal = vi
      .fn()
      .mockRejectedValue(new Error("portal is unavailable"));
    mockedUseBillingPortal.mockReturnValue({
      mutateAsync: portal,
      isPending: false,
    } as ReturnType<typeof useBillingPortal>);

    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "portal" }));

    expect(portal).toHaveBeenCalled();
    expect(
      await screen.findByText("We couldn't open billing management."),
    ).toBeInTheDocument();
    expect(screen.getByText("portal is unavailable")).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(
      screen.queryByText("We couldn't open billing management."),
    ).not.toBeInTheDocument();
  });

  it("updates email preferences when a toggle changes", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseUpdateEmailPreferences.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as ReturnType<typeof useUpdateEmailPreferences>);

    render(<SettingsPage />);

    const reminderToggle = screen.getByRole("checkbox", {
      name: "RSVP reminders",
    });
    await user.click(reminderToggle);

    expect(mutateAsync).toHaveBeenCalledWith({
      preferences: {
        memberInvite: true,
        rsvpConfirmation: true,
        rsvpReminder: true,
      },
    });
  });

  it("does not auto-start checkout after a Stripe cancel redirect", async () => {
    const user = userEvent.setup();
    routeSearch.plan = "pro";
    routeSearch.checkout = "cancel";
    const checkout = vi
      .fn()
      .mockResolvedValue({ url: "https://checkout.example.com/retry" });
    mockedUseBillingCheckout.mockReturnValue({
      mutateAsync: checkout,
      isPending: false,
    } as ReturnType<typeof useBillingCheckout>);

    render(<SettingsPage />);

    expect(checkout).not.toHaveBeenCalled();
    expect(
      screen.getByText("Checkout canceled for the pro plan."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Choose a plan below to try again."),
    ).toBeInTheDocument();

    // Trigger checkout via PlanComparison
    await user.click(screen.getByRole("button", { name: "checkout-starter" }));

    expect(checkout).toHaveBeenCalledWith({
      plan: "starter",
      interval: "month",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.assign).toHaveBeenCalledWith(
      "https://checkout.example.com/retry",
    );
  });

  it("does not auto-start checkout when a plan is present in the URL", () => {
    routeSearch.plan = "pro";
    routeSearch.interval = "year";
    const checkout = vi.fn();
    mockedUseBillingCheckout.mockReturnValue({
      mutateAsync: checkout,
      isPending: false,
    } as ReturnType<typeof useBillingCheckout>);

    render(<SettingsPage />);

    expect(checkout).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("shows a confirmed success notice after checkout completes", () => {
    routeSearch.plan = "starter";
    routeSearch.checkout = "success";

    render(<SettingsPage />);

    expect(screen.getByText("Starter plan is active.")).toBeInTheDocument();
    expect(
      screen.getByText("Your billing access is ready to use."),
    ).toBeInTheDocument();
  });

  it("refreshes billing queries after a successful checkout redirect", () => {
    routeSearch.plan = "starter";
    routeSearch.checkout = "success";
    const refetchSummary = vi.fn().mockResolvedValue({
      data: {
        plan: "starter",
        status: "active",
      },
    });
    const refetchHistory = vi.fn().mockResolvedValue(undefined);

    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "free",
        status: "active",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        features: [],
        canManageBilling: true,
      },
      isLoading: false,
      refetch: refetchSummary,
    } as ReturnType<typeof useBillingSummary>);
    mockedUseBillingHistory.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      refetch: refetchHistory,
    } as ReturnType<typeof useBillingHistory>);

    render(<SettingsPage />);

    expect(refetchSummary).toHaveBeenCalledTimes(1);
    expect(refetchHistory).toHaveBeenCalledTimes(1);
  });

  it("caps checkout-success polling at 10 attempts and clears checkout/plan params", async () => {
    vi.useFakeTimers();
    try {
      routeSearch.plan = "starter";
      routeSearch.checkout = "success";
      // Return a still-free summary so polling never settles until the cap.
      const refetchSummary = vi.fn().mockResolvedValue({
        data: { plan: "free", status: "incomplete" },
      });
      const refetchHistory = vi.fn().mockResolvedValue(undefined);

      mockedUseBillingSummary.mockReturnValue({
        data: {
          plan: "free",
          status: "incomplete",
          stripeCustomerId: "cus_123",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          features: [],
          canManageBilling: true,
        },
        isLoading: false,
        refetch: refetchSummary,
      } as ReturnType<typeof useBillingSummary>);
      mockedUseBillingHistory.mockReturnValue({
        data: { items: [] },
        isLoading: false,
        refetch: refetchHistory,
      } as ReturnType<typeof useBillingHistory>);

      render(<SettingsPage />);

      // Flush the first pollOnce microtasks then advance 10 intervals.
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(2000);
      }

      expect(refetchSummary).toHaveBeenCalledTimes(10);

      // After cap: navigate is called with a search transformer that drops checkout and plan.
      const navCall = navigateFn.mock.calls.find((args: unknown[]) => {
        const opts = args[0] as { search?: unknown };
        return typeof opts?.search === "function";
      }) as unknown[] | undefined;
      expect(navCall).toBeDefined();
      const transform = (navCall as unknown[])[0] as {
        search: (prev: Record<string, unknown>) => Record<string, unknown>;
      };
      expect(
        transform.search({ plan: "starter", checkout: "success" }),
      ).toEqual({
        plan: undefined,
        checkout: undefined,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling once the plan settles and clears checkout/plan params", async () => {
    vi.useFakeTimers();
    try {
      routeSearch.plan = "starter";
      routeSearch.checkout = "success";
      // First refetch still free, second call settles to starter.
      const refetchSummary = vi
        .fn()
        .mockResolvedValueOnce({
          data: { plan: "free", status: "incomplete" },
        })
        .mockResolvedValueOnce({
          data: { plan: "starter", status: "active" },
        });
      const refetchHistory = vi.fn().mockResolvedValue(undefined);

      mockedUseBillingSummary.mockReturnValue({
        data: {
          plan: "free",
          status: "incomplete",
          stripeCustomerId: "cus_123",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          features: [],
          canManageBilling: true,
        },
        isLoading: false,
        refetch: refetchSummary,
      } as ReturnType<typeof useBillingSummary>);
      mockedUseBillingHistory.mockReturnValue({
        data: { items: [] },
        isLoading: false,
        refetch: refetchHistory,
      } as ReturnType<typeof useBillingHistory>);

      render(<SettingsPage />);

      // First attempt runs synchronously (still free) → schedule another.
      await vi.advanceTimersByTimeAsync(2000);
      // Second attempt resolves to starter/active → settle and stop polling.
      await vi.advanceTimersByTimeAsync(2000);

      expect(refetchSummary).toHaveBeenCalledTimes(2);

      // Further time advancement must not trigger more refetches.
      await vi.advanceTimersByTimeAsync(10000);
      expect(refetchSummary).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes billing queries when the page is restored from the billing portal", () => {
    const refetchSummary = vi.fn().mockResolvedValue(undefined);
    const refetchHistory = vi.fn().mockResolvedValue(undefined);

    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "starter",
        status: "active",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        features: ["vendors"],
        canManageBilling: true,
      },
      isLoading: false,
      refetch: refetchSummary,
    } as ReturnType<typeof useBillingSummary>);
    mockedUseBillingHistory.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      refetch: refetchHistory,
    } as ReturnType<typeof useBillingHistory>);

    render(<SettingsPage />);

    const pageShowEvent = new Event("pageshow");
    Object.defineProperty(pageShowEvent, "persisted", {
      value: true,
      configurable: true,
    });

    window.dispatchEvent(pageShowEvent);

    expect(refetchSummary).toHaveBeenCalledTimes(1);
    expect(refetchHistory).toHaveBeenCalledTimes(1);
  });

  it("polling effect uses stable primitive deps — does not re-run polling when query object identity changes with same dataUpdatedAt", async () => {
    vi.useFakeTimers();
    try {
      routeSearch.plan = "starter";
      routeSearch.checkout = "success";

      const refetchSummary = vi.fn().mockResolvedValue({
        data: { plan: "starter", status: "active" },
      });
      const refetchHistory = vi.fn().mockResolvedValue(undefined);

      const baseSummaryReturn = {
        data: {
          plan: "free" as const,
          status: "incomplete" as const,
          stripeCustomerId: "cus_123",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          features: [] as string[],
          canManageBilling: true,
        },
        isLoading: false,
        refetch: refetchSummary,
        // A stable dataUpdatedAt — same value means no re-run
        dataUpdatedAt: 1000,
      };

      mockedUseBillingSummary.mockReturnValue(
        baseSummaryReturn as ReturnType<typeof useBillingSummary>,
      );
      mockedUseBillingHistory.mockReturnValue({
        data: { items: [] },
        isLoading: false,
        refetch: refetchHistory,
        dataUpdatedAt: 1000,
      } as ReturnType<typeof useBillingHistory>);

      const { rerender } = render(<SettingsPage />);

      // First pollOnce fires on mount; settles immediately (starter/active)
      await vi.advanceTimersByTimeAsync(0);

      const callsAfterMount = refetchSummary.mock.calls.length;

      // Simulate a re-render with a NEW object reference but SAME dataUpdatedAt.
      // If deps are stable primitives, the effect will NOT re-run.
      mockedUseBillingSummary.mockReturnValue({
        ...baseSummaryReturn,
      } as ReturnType<typeof useBillingSummary>);
      rerender(<SettingsPage />);
      await vi.advanceTimersByTimeAsync(0);

      // Should NOT have added more calls due to re-render
      expect(refetchSummary.mock.calls.length).toBe(callsAfterMount);
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // Export section
  // -------------------------------------------------------------------------
  describe("Export section", () => {
    it("renders all three export buttons when a wedding is active", () => {
      render(<SettingsPage />);
      expect(
        screen.getByRole("button", { name: "Download guest list" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Download budget" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Download vendors" }),
      ).toBeInTheDocument();
    });

    it("calls apiFetch with guests CSV URL when download guest list is clicked", async () => {
      const user = userEvent.setup();
      mockedApiFetch.mockResolvedValue("firstName,lastName\r\nJane,Doe");

      // Mock URL.createObjectURL and URL.revokeObjectURL
      const createObjectURL = vi.fn().mockReturnValue("blob:mock");
      const revokeObjectURL = vi.fn();
      Object.defineProperty(window.URL, "createObjectURL", {
        value: createObjectURL,
        configurable: true,
      });
      Object.defineProperty(window.URL, "revokeObjectURL", {
        value: revokeObjectURL,
        configurable: true,
      });
      const appendChildSpy = vi.spyOn(document.body, "appendChild");

      render(<SettingsPage />);

      await user.click(
        screen.getByRole("button", { name: "Download guest list" }),
      );

      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledWith(
          "/api/weddings/wedding-1/export/guests.csv",
        );
      });

      expect(appendChildSpy).toHaveBeenCalled();
      // Allow the deferred setTimeout(() => revokeObjectURL, 0) to fire
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");

      appendChildSpy.mockRestore();
    });

    it("calls apiFetch with budget CSV URL when download budget is clicked", async () => {
      const user = userEvent.setup();
      mockedApiFetch.mockResolvedValue("type,name\r\ncategory,Venue");
      const createObjectURL = vi.fn().mockReturnValue("blob:mock");
      const revokeObjectURL = vi.fn();
      Object.defineProperty(window.URL, "createObjectURL", {
        value: createObjectURL,
        configurable: true,
      });
      Object.defineProperty(window.URL, "revokeObjectURL", {
        value: revokeObjectURL,
        configurable: true,
      });
      const appendChildSpy = vi.spyOn(document.body, "appendChild");

      render(<SettingsPage />);

      await user.click(screen.getByRole("button", { name: "Download budget" }));

      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledWith(
          "/api/weddings/wedding-1/export/budget.csv",
        );
      });

      expect(appendChildSpy).toHaveBeenCalled();
      // Allow the deferred setTimeout(() => revokeObjectURL, 0) to fire
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");

      appendChildSpy.mockRestore();
    });

    it("calls apiFetch with vendors CSV URL when download vendors is clicked", async () => {
      const user = userEvent.setup();
      mockedApiFetch.mockResolvedValue(
        "companyName,primaryContactName\r\nFlowers,Alice",
      );
      const createObjectURL = vi.fn().mockReturnValue("blob:mock");
      const revokeObjectURL = vi.fn();
      Object.defineProperty(window.URL, "createObjectURL", {
        value: createObjectURL,
        configurable: true,
      });
      Object.defineProperty(window.URL, "revokeObjectURL", {
        value: revokeObjectURL,
        configurable: true,
      });
      const appendChildSpy = vi.spyOn(document.body, "appendChild");

      render(<SettingsPage />);

      await user.click(
        screen.getByRole("button", { name: "Download vendors" }),
      );

      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledWith(
          "/api/weddings/wedding-1/export/vendors.csv",
        );
      });

      expect(appendChildSpy).toHaveBeenCalled();
      // Allow the deferred setTimeout(() => revokeObjectURL, 0) to fire
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");

      appendChildSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Members section
  // -------------------------------------------------------------------------
  describe("Members section", () => {
    it("renders the wedding team section heading", () => {
      render(<SettingsPage />);
      expect(screen.getByText("Wedding team")).toBeInTheDocument();
    });

    it("renders member list with roles", () => {
      render(<SettingsPage />);
      expect(screen.getAllByText("owner").length).toBeGreaterThan(0);
      expect(screen.getByRole("combobox", { name: /Role for/i })).toHaveValue(
        "editor",
      );
    });

    it("renders remove button for non-self members when user is owner", () => {
      render(<SettingsPage />);
      expect(
        screen.getByRole("button", { name: /Remove member/ }),
      ).toBeInTheDocument();
    });

    it("renders invite form for owner", () => {
      render(<SettingsPage />);
      expect(
        screen.getByRole("button", { name: "Send invite" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Invite email address")).toBeInTheDocument();
      expect(screen.getByLabelText("Invite role")).toBeInTheDocument();
    });

    it("shows a paid-feature notice instead of the invite form without team access", () => {
      mockedUseBillingSummary.mockReturnValue({
        data: {
          plan: "starter",
          status: "active",
          stripeCustomerId: "cus_123",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          features: ["vendors"],
          canManageBilling: true,
        },
        isLoading: false,
        refetch: vi.fn().mockResolvedValue(undefined),
      } as ReturnType<typeof useBillingSummary>);

      render(<SettingsPage />);

      expect(
        screen.getByText("Team invitations are a paid feature"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Send invite" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Invite email address"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /Role for/i })).toHaveValue(
        "editor",
      );
      expect(
        screen.getByRole("button", { name: /Remove member/ }),
      ).toBeInTheDocument();
    });

    it("waits for billing summary before deciding invite access", () => {
      mockedUseBillingSummary.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn().mockResolvedValue(undefined),
      } as ReturnType<typeof useBillingSummary>);

      render(<SettingsPage />);

      expect(
        screen.getByText("Checking team invitation access..."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Team invitations are a paid feature"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Send invite" }),
      ).not.toBeInTheDocument();
    });

    it("shows a retry state when billing summary cannot confirm invite access", async () => {
      const refetch = vi.fn().mockResolvedValue(undefined);
      mockedUseBillingSummary.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("Billing failed"),
        refetch,
      } as unknown as ReturnType<typeof useBillingSummary>);

      render(<SettingsPage />);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Team invitation access did not load",
      );
      expect(
        screen.queryByText("Team invitations are a paid feature"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Send invite" }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Retry billing" }),
      );
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("does not render invite form for non-owner", () => {
      const editorWedding = { ...WEDDING_ROW, role: "editor" as const };
      mockedUseWeddings.mockReturnValue({
        data: [editorWedding],
        isLoading: false,
      } as ReturnType<typeof useWeddings>);

      render(<SettingsPage />);
      expect(
        screen.queryByRole("button", { name: "Send invite" }),
      ).not.toBeInTheDocument();
    });

    it("shows loading state while members are loading", () => {
      mockedUseWeddingMembers.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as ReturnType<typeof useWeddingMembers>);

      render(<SettingsPage />);
      expect(screen.getByText(/Loading members/i)).toBeInTheDocument();
    });

    it("shows error state when members fail to load", () => {
      mockedUseWeddingMembers.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as ReturnType<typeof useWeddingMembers>);

      render(<SettingsPage />);
      expect(screen.getByText(/Failed to load members/i)).toBeInTheDocument();
    });

    it("calls removeMember when remove button is clicked", async () => {
      const user = userEvent.setup();
      const removeMutateFn = vi.fn();
      mockedUseRemoveMember.mockReturnValue({
        mutate: removeMutateFn,
        mutateAsync: vi.fn(),
        isPending: false,
      } as ReturnType<typeof useRemoveMember>);

      render(<SettingsPage />);

      await user.click(screen.getByRole("button", { name: /Remove member/ }));
      expect(removeMutateFn).toHaveBeenCalledWith(OTHER_MEMBER.id);
    });

    it("calls inviteMember when invite form is submitted", async () => {
      const user = userEvent.setup();
      const inviteMutateFn = vi.fn().mockResolvedValue({});
      mockedUseInviteMember.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: inviteMutateFn,
        isPending: false,
      } as ReturnType<typeof useInviteMember>);

      render(<SettingsPage />);

      await user.type(
        screen.getByLabelText("Invite email address"),
        "new@example.com",
      );
      await user.click(screen.getByRole("button", { name: "Send invite" }));

      await waitFor(() => {
        expect(inviteMutateFn).toHaveBeenCalledWith({
          email: "new@example.com",
          role: "editor",
        });
      });
    });

    it("lets owners update another member role", async () => {
      const user = userEvent.setup();
      const updateRole = vi.fn().mockResolvedValue({});
      mockedUseUpdateMemberRole.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: updateRole,
        isPending: false,
      } as ReturnType<typeof useUpdateMemberRole>);

      render(<SettingsPage />);

      await user.selectOptions(
        screen.getByRole("combobox", { name: /Role for/i }),
        "viewer",
      );

      expect(updateRole).toHaveBeenCalledWith({
        memberId: OTHER_MEMBER.id,
        role: "viewer",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Archive section
  // -------------------------------------------------------------------------
  describe("Archive section", () => {
    it("renders the archive section with heading", () => {
      render(<SettingsPage />);
      expect(screen.getByText("Danger zone")).toBeInTheDocument();
      expect(screen.getByText("Archive wedding")).toBeInTheDocument();
    });

    it("renders Archive this wedding button when status is planning", () => {
      render(<SettingsPage />);
      expect(
        screen.getByRole("button", { name: "Archive this wedding" }),
      ).toBeInTheDocument();
    });

    it("renders Unarchive button when wedding is archived", () => {
      const archivedWedding = {
        ...WEDDING_ROW,
        status: "archived" as const,
        archivedAt: "2026-04-14T00:00:00Z",
      };
      mockedUseWeddings.mockReturnValue({
        data: [archivedWedding],
        isLoading: false,
      } as ReturnType<typeof useWeddings>);

      render(<SettingsPage />);
      expect(
        screen.getByRole("button", { name: "Unarchive" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Archive this wedding" }),
      ).not.toBeInTheDocument();
    });

    it("calls archiveWedding when archive button is clicked", async () => {
      const user = userEvent.setup();
      const archiveMutateFn = vi.fn();
      mockedUseArchiveWedding.mockReturnValue({
        mutate: archiveMutateFn,
        mutateAsync: vi.fn(),
        isPending: false,
      } as ReturnType<typeof useArchiveWedding>);

      render(<SettingsPage />);

      await user.click(
        screen.getByRole("button", { name: "Archive this wedding" }),
      );
      expect(archiveMutateFn).toHaveBeenCalled();
    });

    it("calls unarchiveWedding when unarchive button is clicked", async () => {
      const user = userEvent.setup();
      const unarchiveMutateFn = vi.fn();
      mockedUseUnarchiveWedding.mockReturnValue({
        mutate: unarchiveMutateFn,
        mutateAsync: vi.fn(),
        isPending: false,
      } as ReturnType<typeof useUnarchiveWedding>);

      const archivedWedding = {
        ...WEDDING_ROW,
        status: "archived" as const,
        archivedAt: "2026-04-14T00:00:00Z",
      };
      mockedUseWeddings.mockReturnValue({
        data: [archivedWedding],
        isLoading: false,
      } as ReturnType<typeof useWeddings>);

      render(<SettingsPage />);

      await user.click(screen.getByRole("button", { name: "Unarchive" }));
      expect(unarchiveMutateFn).toHaveBeenCalled();
    });
  });
});
