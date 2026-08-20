/**
 * Integration: ReferralShare clipboard copy paths
 *
 * Regression: fallback copy only reports success when execCommand succeeds.
 *
 * File: src/components/referral-share.tsx:24-41
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { ReferralShare } from "../components/referral-share";

const defaultProps = {
  referralUrl: "https://example.com/?ref=abc123",
  position: 5,
  rewards: [{ threshold: 3, description: "Get 7 extra trial days" }],
  productName: "TestApp",
};

beforeEach(() => {
  vi.restoreAllMocks();
  // jsdom does not implement document.execCommand; define a stub so vi.spyOn works.
  if (!("execCommand" in document)) {
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(false),
      writable: true,
      configurable: true,
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
});

// Happy path

describe("ReferralShare clipboard happy path", () => {
  it("shows 'Copied!' when navigator.clipboard.writeText resolves", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    render(<ReferralShare {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeDefined();
    });
  });

  it("reverts back to 'Copy' after 2 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    render(<ReferralShare {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeDefined();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeDefined();
      expect(screen.queryByText("Copied!")).toBeNull();
    });
  });

  it("calls writeText with the referral URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });

    render(<ReferralShare {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://example.com/?ref=abc123");
    });
  });
});

// Fallback path: navigator.clipboard.writeText rejects.

describe("ReferralShare clipboard fallback path (execCommand)", () => {
  it("calls execCommand('copy') when clipboard.writeText rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("not allowed")),
      },
    });
    const execCommandSpy = vi
      .spyOn(document, "execCommand")
      .mockReturnValue(true);

    render(<ReferralShare {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(execCommandSpy).toHaveBeenCalledWith("copy");
    });
  });

  it("shows 'Copied!' when fallback execCommand returns true", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("not allowed")),
      },
    });
    vi.spyOn(document, "execCommand").mockReturnValue(true);

    render(<ReferralShare {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeDefined();
    });
  });

  it("does NOT show 'Copied!' when execCommand returns false", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("not allowed")),
      },
    });
    // execCommand returns false; copy did not actually succeed.
    vi.spyOn(document, "execCommand").mockReturnValue(false);

    render(<ReferralShare {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    // Wait for the async clipboard rejection to settle
    await waitFor(() => {
      expect(screen.queryByRole("button")).toBeDefined();
    });
    // Give a tick for the fallback to run
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByText("Copied!")).toBeNull();
    expect(screen.getByText("Copy")).toBeDefined();
  });

  it("removes the fallback textarea from DOM after copy attempt", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("not allowed")),
      },
    });
    vi.spyOn(document, "execCommand").mockReturnValue(true);

    render(<ReferralShare {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeDefined();
    });

    // The textarea created in the fallback should be removed from the DOM.
    // Any remaining textarea in ReferralShare must be readonly (the URL input).
    const textareas = document.querySelectorAll("textarea");
    textareas.forEach((ta) => {
      expect(ta.hasAttribute("readonly")).toBe(true);
    });
  });
});

// Fallback path: navigator.clipboard entirely absent.

describe("ReferralShare clipboard without clipboard API", () => {
  it("uses execCommand fallback when navigator.clipboard is undefined", async () => {
    // Simulate environments without clipboard API (e.g., insecure context)
    vi.stubGlobal("navigator", {});
    const execCommandSpy = vi
      .spyOn(document, "execCommand")
      .mockReturnValue(true);

    render(<ReferralShare {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(execCommandSpy).toHaveBeenCalledWith("copy");
    });
  });

  it("does not throw when both clipboard API and execCommand are unavailable", async () => {
    vi.stubGlobal("navigator", {});
    vi.spyOn(document, "execCommand").mockImplementation(() => {
      throw new Error("execCommand not supported");
    });

    render(<ReferralShare {...defaultProps} />);

    // Click should not throw because both paths have try/catch.
    await expect(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
      await new Promise((r) => setTimeout(r, 50));
    }).not.toThrow();

    // Button should still be in the DOM (no crash)
    expect(screen.getByRole("button", { name: /copy/i })).toBeDefined();
  });
});
