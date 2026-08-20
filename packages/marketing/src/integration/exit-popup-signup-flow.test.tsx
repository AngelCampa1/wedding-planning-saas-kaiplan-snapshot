/**
 * Integration: ExitIntentPopup full signup -> auto-close -> never-re-opens flow.
 *
 * Does NOT mock exit-popup-utils — uses real localStorage so the full chain
 * (component -> setSignedUp() -> localStorage -> isSignedUp() on remount)
 * is exercised end-to-end.
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
import { SIGNED_UP_KEY } from "../lib/exit-popup-utils";

const defaultProps = {
  apiUrl: "https://api.test",
  siteName: "TestSite",
  headline: "Before you go — get started",
  description: "Try TestSite free for 30 days.",
  ctaText: "Get Started",
  leftPanelLabel: "FREE GUIDE",
  successSubMessage: "Check your inbox for your login details.",
};

/** Advance past the 5s arming delay then fire a mouseleave near the top. */
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

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("ExitIntentPopup full signup flow", () => {
  it("full flow: popup -> signup -> success message -> auto-close after 2s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();

    // Dialog appears
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    // Type email and submit
    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    // Success message appears
    await waitFor(() => {
      expect(screen.getByText("Check your inbox!")).toBeDefined();
    });

    // Dialog still visible before auto-close timer
    expect(screen.getByRole("dialog")).toBeDefined();

    // Advance 2000ms for auto-close
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Dialog disappears
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("setSignedUp persists to localStorage after successful signup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

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

  it("popup never re-opens after successful signup (remount)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    const { unmount } = render(<ExitIntentPopup {...defaultProps} />);

    // Trigger and complete signup
    await triggerPopup();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    await waitFor(() => {
      expect(localStorage.getItem(SIGNED_UP_KEY)).toBe("true");
    });

    // Unmount and remount
    unmount();
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<ExitIntentPopup {...defaultProps} />);

    // Try to trigger popup again
    await triggerPopup();

    // Should never appear — isSignedUp() returns true from real localStorage
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("popup shows duplicate error on 409 response (no auto-close)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409 }),
    );

    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    // Duplicate error message appears
    await waitFor(() => {
      expect(screen.getByText(/already signed up/i)).toBeDefined();
    });

    // Dialog is still visible (no auto-close)
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("popup shows generic error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    // Generic error message appears
    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Try again."),
      ).toBeDefined();
    });
  });

  it("auto-close does not fire on error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(<ExitIntentPopup {...defaultProps} />);

    await triggerPopup();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    // Wait for error to appear
    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Try again."),
      ).toBeDefined();
    });

    // Advance 2000ms — the auto-close timer should NOT have been set
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Dialog is still visible
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});
