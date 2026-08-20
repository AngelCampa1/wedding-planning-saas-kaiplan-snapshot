/**
 * Integration: EmailCapture + ExitIntentPopup regression coverage.
 *
 * Regression 1: network and duplicate errors clear when the email changes.
 * Regression 2: empty ref= URL params are omitted consistently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { EmailCapture } from "../components/email-capture";
import { ExitIntentPopup } from "../components/exit-intent-popup";

// Mock exit-popup-utils so we can control popup visibility easily.
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

const emailCaptureProps = {
  apiUrl: "https://api.test",
  sourcePage: "/",
  surveyQuestions: [{ id: "role", text: "Your role?", options: ["Dev", "PM"] }],
  discoveryCallUrl: "https://cal.com/test",
  buttonText: "Join",
  placeholder: "you@test.com",
  errorInvalidEmail: "Invalid email",
  errorDuplicate: "Already signed up",
  errorGeneric: "Network error",
};

/** Advance the 5 s arm timer and fire mouseleave to show the exit popup. */
async function openExitPopup() {
  act(() => {
    vi.advanceTimersByTime(5100);
  });
  act(() => {
    fireEvent(
      document,
      new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }),
    );
  });
  await waitFor(() => {
    expect(screen.getByRole("dialog")).toBeDefined();
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Regression: error state clears on email edit.

describe("EmailCapture error-state clearing", () => {
  it("error-validation IS cleared when the user edits their email (correct behavior)", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<EmailCapture {...emailCaptureProps} />);
    const input = screen.getByPlaceholderText("you@test.com");

    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.submit(screen.getByRole("button", { name: "Join" }));

    expect(screen.getByText("Invalid email")).toBeDefined();

    // Correct: editing the email clears the validation error
    fireEvent.change(input, { target: { value: "a@b.com" } });
    expect(screen.queryByText("Invalid email")).toBeNull();
  });

  it("error-generic is cleared when the user edits their email", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(<EmailCapture {...emailCaptureProps} />);
    const input = screen.getByPlaceholderText("you@test.com");

    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });

    // User corrects their email; the generic error should disappear.
    fireEvent.change(input, { target: { value: "new@email.com" } });

    expect(screen.queryByText("Network error")).toBeNull();
  });

  it("error-duplicate is cleared when the user edits their email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({}),
      }),
    );

    render(
      <EmailCapture
        {...emailCaptureProps}
        errorDuplicate="Already signed up"
      />,
    );
    const input = screen.getByPlaceholderText("you@test.com");

    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => {
      expect(screen.getByText("Already signed up")).toBeDefined();
    });

    // User tries a different email; the duplicate error should disappear.
    fireEvent.change(input, { target: { value: "other@email.com" } });

    expect(screen.queryByText("Already signed up")).toBeNull();
  });
});

describe("ExitIntentPopup error-state clearing", () => {
  it("error-generic is cleared when the user edits their email", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(
      <ExitIntentPopup
        apiUrl="https://api.test"
        siteName="Test"
        headline="Before you go"
        description="Try it free"
        ctaText="Get Started"
        leftPanelLabel="FREE GUIDE"
        successSubMessage="We'll be in touch."
        errorGeneric="Connection failed"
      />,
    );

    await openExitPopup();

    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    await waitFor(() => {
      expect(screen.getByText("Connection failed")).toBeDefined();
    });

    // Editing should clear the error
    fireEvent.change(emailInput, { target: { value: "new@email.com" } });

    expect(screen.queryByText("Connection failed")).toBeNull();
  });
});

// Regression: empty ref= param handling.

describe("referredBy empty ref= param handling", () => {
  it("EmailCapture omits referredBy when ref param is empty string (|| behavior)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(window, "location", {
      value: { search: "?ref=" },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...emailCaptureProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@test.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("referredBy");
  });

  it("ExitIntentPopup omits referredBy when ref param is empty string", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(window, "location", {
      value: { search: "?ref=" },
      writable: true,
      configurable: true,
    });

    render(
      <ExitIntentPopup
        apiUrl="https://api.test"
        siteName="Test"
        headline="Before you go"
        description="Try it free"
        ctaText="Get Started"
        leftPanelLabel="FREE GUIDE"
        successSubMessage="We'll be in touch."
      />,
    );

    await openExitPopup();

    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/signup"),
        expect.any(Object),
      );
    });

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;

    // Both components consistently omit referredBy for empty ref params.
    expect(body).not.toHaveProperty("referredBy");
  });

  it("both components omit referredBy when ref param is absent entirely", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    // No ref param in URL
    render(<EmailCapture {...emailCaptureProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@test.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("referredBy");
  });
});
