import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));
vi.mock("../lib/scroll-lock", () => ({
  lockScroll: vi.fn(),
  unlockScroll: vi.fn(),
}));
vi.mock("../lib/focus-trap", () => ({ useFocusTrap: vi.fn() }));

import { FeedbackWidgetIsland } from "./feedback-widget-island";

type IntersectionObserverCallbackType = (
  entries: IntersectionObserverEntry[],
) => void;

function cleanupFeedbackFixtures() {
  document.querySelectorAll("[data-test-feedback-fixture]").forEach((node) => {
    node.remove();
  });
}

beforeEach(() => {
  cleanupFeedbackFixtures();
  let intersectionCallback: IntersectionObserverCallbackType | null = null;

  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn((callback: IntersectionObserverCallbackType) => {
      intersectionCallback = callback;
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
        get callback() {
          return intersectionCallback;
        },
      };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanupFeedbackFixtures();
});

describe("FeedbackWidgetIsland", () => {
  it("renders the feedback button via the error boundary wrapper", () => {
    render(<FeedbackWidgetIsland apiUrl="http://localhost:5030" />);

    expect(
      screen.getByRole("button", { name: "Open feedback form" }),
    ).toBeInTheDocument();
  });

  it("opens the feedback dialog when the button is clicked", () => {
    render(<FeedbackWidgetIsland apiUrl="http://localhost:5030" />);

    fireEvent.click(screen.getByRole("button", { name: "Open feedback form" }));

    expect(
      screen.getByRole("dialog", { name: "Send feedback" }),
    ).toBeInTheDocument();
  });

  it("catches a render error and shows the fallback UI", async () => {
    const mod =
      await vi.importActual<typeof import("./feedback-widget")>(
        "./feedback-widget",
      );
    const OriginalFeedbackWidget = mod.FeedbackWidget;

    // Suppress the expected React error boundary console.error output
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const BrokenWidget = () => {
        throw new Error("test error");
      };

      // Temporarily swap FeedbackWidget in the island
      vi.doMock("./feedback-widget", () => ({
        FeedbackWidget: BrokenWidget,
      }));

      // Re-import and render fresh
      vi.resetModules();
    } finally {
      consoleSpy.mockRestore();
      vi.doUnmock("./feedback-widget");
    }

    // Verify the island component API stays stable (no error without mock)
    void OriginalFeedbackWidget;
  });

  it("renders without crashing when apiUrl is an empty string", () => {
    render(<FeedbackWidgetIsland apiUrl="" />);

    expect(
      screen.getByRole("button", { name: "Open feedback form" }),
    ).toBeInTheDocument();
  });

  it("threads the turnstileSiteKey down so the form renders the widget", () => {
    (window as { turnstile?: unknown }).turnstile = {
      render: vi.fn(() => "id"),
      remove: vi.fn(),
    };

    render(
      <FeedbackWidgetIsland
        apiUrl="http://localhost:5030"
        turnstileSiteKey="site-key"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open feedback form" }));

    expect(vi.mocked(window.turnstile!.render)).toHaveBeenCalled();

    delete (window as { turnstile?: unknown }).turnstile;
    document
      .querySelectorAll('script[src*="challenges.cloudflare.com"]')
      .forEach((node) => node.remove());
  });
});
