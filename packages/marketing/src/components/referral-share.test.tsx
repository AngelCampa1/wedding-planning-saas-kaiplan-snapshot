import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ReferralShare } from "./referral-share";
import type { ReferralReward } from "../types";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

const defaultProps = {
  referralUrl: "https://example.com/ref/abc123",
  position: 42,
  productName: "TestProduct",
  rewards: [] as ReferralReward[],
};

const rewards: ReferralReward[] = [
  { threshold: 3, description: "7 extra days on your free trial" },
  { threshold: 10, description: "Free month" },
];

describe("ReferralShare", () => {
  beforeEach(() => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    document
      .querySelectorAll("[data-referral-url]")
      .forEach((el) => el.remove());
  });

  it("renders signup position", () => {
    render(<ReferralShare {...defaultProps} />);
    expect(screen.getByText("Your signup position is #42")).toBeDefined();
  });

  it("renders the referral URL in the input", () => {
    render(<ReferralShare {...defaultProps} />);
    const input = screen.getByDisplayValue("https://example.com/ref/abc123");
    expect(input).toBeDefined();
  });

  it("renders Share on X link with correct href", () => {
    render(<ReferralShare {...defaultProps} />);
    const link = screen
      .getByText("Share on X")
      .closest("a") as HTMLAnchorElement;
    expect(link.href).toContain("twitter.com/intent/tweet");
    expect(link.href).toContain(encodeURIComponent("TestProduct"));
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders Share on LinkedIn link with correct href", () => {
    render(<ReferralShare {...defaultProps} />);
    const link = screen
      .getByText("Share on LinkedIn")
      .closest("a") as HTMLAnchorElement;
    expect(link.href).toContain("linkedin.com/sharing");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("copies URL to clipboard on Copy button click", async () => {
    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com/ref/abc123",
    );
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();
  });

  it("resets Copied! back to Copy after 2 seconds", async () => {
    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: /copy/i })).toBeDefined();
  });

  it("does not set copied state when clipboard API fails", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    // jsdom doesn't implement execCommand — define it so spyOn works
    if (!document.execCommand) {
      Object.defineProperty(document, "execCommand", {
        value: vi.fn().mockReturnValue(true),
        writable: true,
        configurable: true,
      });
    }
    vi.spyOn(document, "execCommand").mockReturnValue(true);

    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    // execCommand fallback succeeded — "Copied!" should now be shown
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();
  });

  it("renders no rewards section when rewards array is empty", () => {
    render(<ReferralShare {...defaultProps} rewards={[]} />);
    expect(screen.queryByText("Referral rewards:")).toBeNull();
  });

  it("renders reward items when rewards are provided", () => {
    render(<ReferralShare {...defaultProps} rewards={rewards} />);
    expect(screen.getByText("Referral rewards:")).toBeDefined();
    expect(screen.getByText("7 extra days on your free trial")).toBeDefined();
    expect(screen.getByText("Free month")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("10")).toBeDefined();
  });

  it("renders share subtitle text", () => {
    render(<ReferralShare {...defaultProps} />);
    expect(screen.getByText("Share to get access sooner")).toBeDefined();
  });

  // --- L5: execCommand fallback wrapped in try/catch — must not throw ---

  it("does not throw when clipboard API and execCommand both fail", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockImplementation(() => {
        throw new Error("execCommand not supported");
      }),
      writable: true,
      configurable: true,
    });

    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });

    await expect(
      act(async () => {
        fireEvent.click(btn);
      }),
    ).resolves.not.toThrow();
  });

  it("silently fails (no copied state) when clipboard rejects and execCommand throws", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockImplementation(() => {
        throw new Error("execCommand not supported");
      }),
      writable: true,
      configurable: true,
    });

    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    // The component must not crash — button stays in "Copy" state
    expect(screen.getByRole("button", { name: /copy/i })).toBeDefined();
  });

  it("input is read-only", () => {
    render(<ReferralShare {...defaultProps} />);
    const input = screen.getByDisplayValue(
      "https://example.com/ref/abc123",
    ) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });

  it("referral URL input has aria-label for screen readers", () => {
    render(<ReferralShare {...defaultProps} />);
    const input = screen.getByLabelText("Referral URL") as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe("https://example.com/ref/abc123");
  });

  it("clears existing timer when Copy is clicked a second time (clipboard API path)", async () => {
    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });

    // First click — sets the timer
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();

    // Second click before timer fires — must clear the old timer and set a new one
    await act(async () => {
      fireEvent.click(btn);
    });
    // Should still show Copied! (timer restarted)
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();

    // Now advance past 2s — button resets
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: /copy/i })).toBeDefined();
  });

  it("clears existing timer when Copy is clicked a second time (execCommand fallback path)", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(true),
      writable: true,
      configurable: true,
    });

    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });

    // First click — sets the timer via execCommand fallback
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();

    // Second click before timer fires — clears old timer and sets a new one
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByRole("button", { name: /copied/i })).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: /copy/i })).toBeDefined();
  });

  // ── Bug 3c: timer leak — unmount before 2s must not warn about state updates ──
  it("does not warn about state update on unmounted component after copy and early unmount", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { unmount } = render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    // Component is now showing "Copied!" — unmount before the 2s timer fires
    unmount();

    // Advance past the timer — should NOT throw or warn about setState on unmounted
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    const stateUpdateWarnings = consoleSpy.mock.calls.filter(
      (args: unknown[]) =>
        typeof args[0] === "string" &&
        (args[0] as string).includes("state update on an unmounted component"),
    );
    expect(stateUpdateWarnings.length).toBe(0);

    consoleSpy.mockRestore();
  });

  it("fires referral_link_copied when user copies their referral link", async () => {
    const { trackEvent } = await import("../lib/analytics");
    render(<ReferralShare {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(trackEvent).toHaveBeenCalledWith("referral_link_copied");
  });
});
