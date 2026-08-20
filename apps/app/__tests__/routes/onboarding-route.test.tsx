import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createWedding: vi.fn(),
  routeSearch: {} as { plan?: "starter" | "pro"; interval?: "month" | "year" },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  createFileRoute: () => () => ({
    useNavigate: () => mocks.navigate,
    useSearch: () => mocks.routeSearch,
  }),
}));

vi.mock("../../src/hooks/use-weddings", () => ({
  useCreateWedding: vi.fn(),
  useWeddings: vi.fn(),
}));

import { OnboardingPage } from "../../src/routes/_authenticated/onboarding";
import { useCreateWedding, useWeddings } from "../../src/hooks/use-weddings";

const mockedUseCreateWedding = vi.mocked(useCreateWedding);
const mockedUseWeddings = vi.mocked(useWeddings);

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedUseCreateWedding.mockReturnValue({
      mutateAsync: mocks.createWedding,
      isPending: false,
    } as ReturnType<typeof useCreateWedding>);
    mockedUseWeddings.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mocks.createWedding.mockResolvedValue({});
    mocks.routeSearch = {};
  });

  it("navigates to dashboard after creating the wedding", async () => {
    const user = userEvent.setup();

    render(<OnboardingPage />);

    await user.type(
      screen.getByLabelText("What do you want to call this workspace? *"),
      "Alex & Jordan's Wedding",
    );
    await user.click(screen.getByRole("button", { name: "Start planning" }));

    expect(mocks.createWedding).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Alex & Jordan's Wedding",
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard",
      search: undefined,
    });
    expect(localStorage.getItem("kaiplan:help-mode")).toBe("true");
    expect(localStorage.getItem("kaiplan:tour:dashboard:status")).toBeNull();
  });

  it("navigates to dashboard even when no plan is present", async () => {
    const user = userEvent.setup();

    render(<OnboardingPage />);

    await user.type(
      screen.getByLabelText("What do you want to call this workspace? *"),
      "Alex & Jordan's Wedding",
    );
    await user.click(screen.getByRole("button", { name: "Start planning" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard",
      search: undefined,
    });
  });

  it("forwards selected plan and interval to settings after creating the wedding", async () => {
    const user = userEvent.setup();
    mocks.routeSearch = { plan: "pro", interval: "year" };

    render(<OnboardingPage />);

    await user.type(
      screen.getByLabelText("What do you want to call this workspace? *"),
      "Alex & Jordan's Wedding",
    );
    await user.click(screen.getByRole("button", { name: "Start planning" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/settings",
      search: { plan: "pro", interval: "year" },
    });
  });

  it("redirects to dashboard when a wedding already exists", () => {
    mockedUseWeddings.mockReturnValue({
      data: [
        {
          id: "wedding-1",
          name: "Alex & Jordan",
          role: "owner",
          createdBy: "user-1",
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);

    render(<OnboardingPage />);

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard",
      search: undefined,
    });
    expect(
      screen.queryByRole("button", { name: "Start planning" }),
    ).not.toBeInTheDocument();
  });

  it("renders clean loading copy while the wedding is being created", () => {
    mockedUseCreateWedding.mockReturnValue({
      mutateAsync: mocks.createWedding,
      isPending: true,
    } as ReturnType<typeof useCreateWedding>);

    render(<OnboardingPage />);

    expect(
      screen.getByRole("button", { name: "Setting up..." }),
    ).toBeDisabled();
    expect(screen.queryByText(/â€¦/)).not.toBeInTheDocument();
  });

  it("calls navigate exactly once even when wedding data is present at render (no double-navigate)", () => {
    mockedUseWeddings.mockReturnValue({
      data: [
        {
          id: "wedding-1",
          name: "Existing Wedding",
          role: "owner",
          createdBy: "user-1",
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);

    render(<OnboardingPage />);

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard",
      search: undefined,
    });
  });

  it("forwards selected plan and interval to settings when a wedding already exists", () => {
    mocks.routeSearch = { plan: "starter", interval: "year" };
    mockedUseWeddings.mockReturnValue({
      data: [
        {
          id: "wedding-1",
          name: "Existing Wedding",
          role: "owner",
          createdBy: "user-1",
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);

    render(<OnboardingPage />);

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/settings",
      search: { plan: "starter", interval: "year" },
    });
  });

  it("redirects collaborators to dashboard when they already belong to a shared wedding", () => {
    mockedUseWeddings.mockReturnValue({
      data: [
        {
          id: "wedding-1",
          name: "Existing Wedding",
          role: "editor",
          createdBy: "owner-1",
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);

    render(<OnboardingPage />);

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard",
      search: undefined,
    });
  });

  it("shows a spinner while weddings are loading", () => {
    mockedUseWeddings.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useWeddings>);

    render(<OnboardingPage />);

    expect(
      screen.queryByRole("button", { name: "Start planning" }),
    ).not.toBeInTheDocument();
  });
});
