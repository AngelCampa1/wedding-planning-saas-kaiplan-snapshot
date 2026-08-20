/**
 * Integration: ExitIntentPopup + real exit-popup-utils + real localStorage
 *
 * Regression: ExitIntentPopup respects real localStorage state.
 *
 * These tests do NOT mock exit-popup-utils; they exercise the full path
 * from localStorage writes to component rendering decisions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { ExitIntentPopup } from "../components/exit-intent-popup";
import {
  SIGNED_UP_KEY,
  SUPPRESS_KEY,
  SUPPRESS_DAYS,
} from "../lib/exit-popup-utils";

const defaultProps = {
  apiUrl: "https://api.test",
  siteName: "TestSite",
  headline: "Before you go - get started",
  description: "Try TestSite free for 30 days.",
  ctaText: "Get Started",
  leftPanelLabel: "FREE GUIDE",
  successSubMessage: "Check your inbox for your login details.",
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

/** Advance 5.1 s then fire mouseleave near the top of the viewport. */
async function triggerPopup() {
  act(() => {
    vi.advanceTimersByTime(5100);
  });
  act(() => {
    fireEvent(
      document,
      new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }),
    );
  });
}

describe("ExitIntentPopup + real localStorage", () => {
  it("baseline: popup shows when localStorage is empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });

  it("popup does NOT show when SIGNED_UP_KEY is already in localStorage", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Pre-seed localStorage as if the user previously signed up
    localStorage.setItem(SIGNED_UP_KEY, "true");

    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();

    // isSignedUp() returns true, so trigger setup is skipped and popup never shows.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("popup does NOT show when SUPPRESS_KEY contains a fresh timestamp", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Pre-seed localStorage as if the user dismissed 1 hour ago
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    localStorage.setItem(SUPPRESS_KEY, String(oneHourAgo));

    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();

    // isWithinSuppressWindow(30) returns true → trigger skipped
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("popup DOES show when SUPPRESS_KEY contains an expired timestamp (>30 days)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Suppress window expired: 31 days ago
    const thirtyOneDaysAgo =
      Date.now() - (SUPPRESS_DAYS + 1) * 24 * 60 * 60 * 1000;
    localStorage.setItem(SUPPRESS_KEY, String(thirtyOneDaysAgo));

    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });

  it("after successful signup, remounting popup never shows it again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { unmount } = render(<ExitIntentPopup {...defaultProps} />);

    // Show the popup
    await triggerPopup();
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    // Submit form — this calls setSignedUp() which writes to localStorage
    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    await waitFor(() => {
      expect(localStorage.getItem(SIGNED_UP_KEY)).toBe("true");
    });

    unmount();
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Mount a fresh instance
    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();

    // isSignedUp() now returns true because of the real localStorage write
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("after dismissal, remounting popup does not show within the suppress window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { unmount } = render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    // Click decline/dismiss — this calls setSuppressed()
    fireEvent.click(
      screen.getByRole("button", { name: /no thanks|not now|dismiss/i }),
    );

    await waitFor(() => {
      expect(localStorage.getItem(SUPPRESS_KEY)).not.toBeNull();
    });

    unmount();
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Mount a fresh instance — suppress window is active
    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();

    // isWithinSuppressWindow(30) returns true — popup must not show
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismiss writes a numeric timestamp to SUPPRESS_KEY", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

    const before = Date.now();
    fireEvent.click(
      screen.getByRole("button", { name: /no thanks|not now|dismiss/i }),
    );
    const after = Date.now();

    const raw = localStorage.getItem(SUPPRESS_KEY);
    expect(raw).not.toBeNull();
    const ts = parseInt(raw!, 10);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("successful signup writes 'true' to SIGNED_UP_KEY", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    await waitFor(() => {
      expect(localStorage.getItem(SIGNED_UP_KEY)).toBe("true");
    });
  });
});
