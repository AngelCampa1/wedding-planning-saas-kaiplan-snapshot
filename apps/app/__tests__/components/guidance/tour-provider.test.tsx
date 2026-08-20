import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TourProvider,
  useOptionalTour,
  useTour,
} from "../../../src/components/guidance/tour-provider";

const navigateMock = vi.fn();
const locationState = { pathname: "/dashboard" };

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<object>("@tanstack/react-router");
  return {
    ...actual,
    useLocation: () => locationState,
    useNavigate: () => navigateMock,
  };
});

function TourHarness() {
  const tour = useTour();
  return (
    <div>
      <button type="button" onClick={() => tour.startTour("dashboard")}>
        Start tour
      </button>
      <button type="button" onClick={() => tour.startTour("missing")}>
        Start missing tour
      </button>
      <button type="button" onClick={() => tour.restartTour("dashboard")}>
        Restart tour
      </button>
      <button type="button" onClick={() => tour.startTour("help-center")}>
        Start help tour
      </button>
      <button type="button" onClick={tour.toggleHelpMode}>
        Toggle help
      </button>
      <div data-tour="dashboard-quick-actions">Quick actions target</div>
    </div>
  );
}

function TourHarnessWithoutTarget() {
  const tour = useTour();
  return (
    <button type="button" onClick={() => tour.startTour("dashboard")}>
      Start tour
    </button>
  );
}

function OptionalTourHarness() {
  const tour = useOptionalTour();
  return <div>optional:{tour ? "present" : "missing"}</div>;
}

function RequiredTourHarness() {
  useTour();
  return null;
}

describe("TourProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    navigateMock.mockClear();
    locationState.pathname = "/dashboard";
  });

  it("starts, advances, and skips a tour", async () => {
    const user = userEvent.setup();
    render(
      <TourProvider>
        <TourHarness />
      </TourProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Start tour" }));

    expect(
      screen.getByRole("dialog", { name: "Start with the fast actions" }),
    ).toBeVisible();
    fireEvent(window, new Event("resize"));
    await waitFor(() =>
      expect(document.querySelector("[class*='ring-primary']")).toBeTruthy(),
    );
    expect(localStorage.getItem("kaiplan:tour:dashboard:status")).toBe(
      "started",
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("dialog", { name: "Read the planning cards" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(
      screen.getByRole("dialog", { name: "Start with the fast actions" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("kaiplan:tour:dashboard:status")).toBe(
      "skipped",
    );
  });

  it("ignores unknown tours and completes known tours", async () => {
    const user = userEvent.setup();
    render(
      <TourProvider>
        <TourHarness />
      </TourProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Start missing tour" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restart tour" }));
    for (let index = 0; index < 8; index += 1) {
      await user.click(screen.getByRole("button", { name: "Next" }));
    }
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("kaiplan:tour:dashboard:status")).toBe(
      "completed",
    );
  });

  it("auto-starts a queued dashboard tour and can navigate to another route", async () => {
    const user = userEvent.setup();
    localStorage.setItem("kaiplan:tour:dashboard:status", "queued");

    render(
      <TourProvider>
        <TourHarness />
      </TourProvider>,
    );

    expect(
      screen.getByRole("dialog", { name: "Start with the fast actions" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/checklist" });
  });

  it("toggles help mode around children", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TourProvider>
        <TourHarness />
      </TourProvider>,
    );

    expect(container.querySelector("[data-help-mode='false']")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Toggle help" }));
    expect(container.querySelector("[data-help-mode='true']")).toBeTruthy();
    expect(
      screen.getByRole("complementary", { name: "Contextual help" }),
    ).toHaveTextContent("Quick actions");
    expect(
      screen.getByRole("complementary", { name: "Contextual help" }),
    ).toHaveClass("overflow-y-auto");
    expect(
      screen.getByRole("complementary", { name: "Contextual help" }),
    ).toHaveClass("max-md:relative");
    expect(
      screen.getByRole("complementary", { name: "Contextual help" }),
    ).not.toHaveClass("pointer-events-none");
    expect(localStorage.getItem("kaiplan:help-mode")).toBe("true");
  });

  it("does not show the help panel when no controls match the route", async () => {
    const user = userEvent.setup();
    locationState.pathname = "/unknown";

    render(
      <TourProvider>
        <TourHarness />
      </TourProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Toggle help" }));
    expect(
      screen.queryByRole("complementary", { name: "Contextual help" }),
    ).not.toBeInTheDocument();
  });

  it("closes the tour with Escape and keeps focus inside with Tab", async () => {
    const user = userEvent.setup();
    render(
      <TourProvider>
        <TourHarness />
      </TourProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Start tour" }));
    screen.getByRole("button", { name: "Skip tour" }).focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toHaveTextContent("Next");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("kaiplan:tour:dashboard:status")).toBe(
      "skipped",
    );
  });

  it("wraps keyboard focus and ignores unrelated keys inside the tour dialog", async () => {
    const user = userEvent.setup();
    render(
      <TourProvider>
        <TourHarness />
      </TourProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Start tour" }));

    const skip = screen.getByRole("button", { name: "Skip tour" });
    const next = screen.getByRole("button", { name: "Next" });

    fireEvent.keyDown(document, { key: "ArrowDown" });
    skip.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);

    next.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(skip);
  });

  it("centers a tour step when its target is not mounted", async () => {
    const user = userEvent.setup();
    render(
      <TourProvider>
        <TourHarnessWithoutTarget />
      </TourProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Start tour" }));

    expect(screen.getByRole("dialog")).toHaveStyle({
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    });
    expect(document.querySelector("[class*='ring-primary']")).toBeNull();
  });

  it("centers tour steps that intentionally do not target a control", async () => {
    const user = userEvent.setup();
    locationState.pathname = "/help";

    render(
      <TourProvider>
        <TourHarness />
      </TourProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Start help tour" }));

    expect(
      screen.getByRole("dialog", { name: "Use Help when you feel stuck" }),
    ).toHaveStyle({
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    });
  });

  it("returns null from optional hook and throws from required hook outside provider", () => {
    render(<OptionalTourHarness />);
    expect(screen.getByText("optional:missing")).toBeInTheDocument();

    expect(() => render(<RequiredTourHarness />)).toThrow(
      "useTour must be used inside TourProvider.",
    );
  });
});
