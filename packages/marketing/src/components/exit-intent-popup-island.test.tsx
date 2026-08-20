import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import type { ComponentProps } from "react";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));
vi.mock("../lib/scroll-lock", () => ({
  lockScroll: vi.fn(),
  unlockScroll: vi.fn(),
}));
vi.mock("../lib/focus-trap", () => ({ useFocusTrap: vi.fn() }));
vi.mock("../lib/exit-popup-utils", () => ({
  SUPPRESS_DAYS: 30,
  SUPPRESS_KEY: "exit-popup-suppressed",
  SIGNED_UP_KEY: "exit-popup-signed-up",
  isSignedUp: vi.fn(() => false),
  isWithinSuppressWindow: vi.fn(() => false),
  setSuppressed: vi.fn(),
  setSignedUp: vi.fn(),
  detectScrollBack: vi.fn(() => false),
}));

import { ExitIntentPopupIsland } from "./exit-intent-popup-island";

const defaultProps = {
  apiUrl: "https://api.test",
  siteName: "TestSite",
  headline: "Before you go — get started",
  description: "Try TestSite free for 30 days.",
  ctaText: "Get Started",
  leftPanelLabel: "FREE GUIDE",
  successSubMessage: "Check your inbox.",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("ExitIntentPopupIsland", () => {
  it("does not render the dialog before the exit-intent trigger fires", () => {
    render(<ExitIntentPopupIsland {...defaultProps} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hydrates the popup so the dialog opens on exit intent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopupIsland {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(5100);
    });
    fireEvent.mouseLeave(document, { clientY: 0 });

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByText(defaultProps.headline)).toBeInTheDocument();
  });

  it("renders the error-boundary fallback when the popup throws", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    // A leadMagnetOptions entry of the wrong shape (null) forces a render throw
    // inside the popup, exercising the boundary that wraps it in the same tree.
    const broken = {
      ...defaultProps,
      showLeadMagnetContent: true,
      leadMagnetOptions: [null],
    } as unknown as ComponentProps<typeof ExitIntentPopupIsland>;

    try {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      render(<ExitIntentPopupIsland {...broken} />);
      act(() => {
        vi.advanceTimersByTime(5100);
      });
      fireEvent.mouseLeave(document, { clientY: 0 });

      expect(screen.getByRole("alert")).toBeInTheDocument();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
