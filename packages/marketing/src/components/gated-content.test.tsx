import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockInstance,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { marketingCaptureDefaults } from "@kaiplan/knowledge/marketing";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));
vi.mock("../lib/exit-popup-utils", () => ({
  isSignedUp: vi.fn(() => false),
  setSignedUp: vi.fn(),
}));

import { isSignedUp, setSignedUp } from "../lib/exit-popup-utils";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import { GatedContent } from "./gated-content";

const mockIsSignedUp = isSignedUp as unknown as MockInstance;
const mockSetSignedUp = setSignedUp as unknown as MockInstance;
const mockTrackEvent = trackEvent as unknown as MockInstance;
const mockCaptureException = captureException as unknown as MockInstance;

const DOWNLOAD_TOKEN = "a".repeat(64);

const defaultProps = {
  apiUrl: "https://api.test",
  leadMagnetTitle: "Free Guide to Testing",
  leadMagnetSlug: "free-guide-to-testing",
  description: "Enter your email — we'll send the full PDF to your inbox.",
  ctaText: "Email me the PDF",
  teaserHtml: "<h2>Section 1</h2><p>This is free content.</p>",
  gatedHtml: "<h2>Section 2</h2><p>This is gated content.</p>",
  webVersionHref: "/free/free-guide-to-testing/read",
};

function jsonResponse(
  body: unknown,
  init: { ok: boolean; status: number },
): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => body,
  } as unknown as Response;
}

function getForm(): HTMLFormElement {
  return screen.getByLabelText("Email address").closest("form")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockIsSignedUp.mockReturnValue(false);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { success: true, downloadToken: DOWNLOAD_TOKEN },
          { ok: true, status: 200 },
        ),
      ),
  );
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
});

describe("GatedContent", () => {
  it("keeps content gated when only the global signup flag is set", () => {
    mockIsSignedUp.mockReturnValue(true);
    render(<GatedContent {...defaultProps} />);

    expect(screen.getByText("This is free content.")).toBeDefined();
    expect(screen.queryByText("This is gated content.")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Email address" }),
    ).toBeDefined();
  });

  it("renders full content immediately only for the matching unlocked slug", () => {
    localStorage.setItem("lead-magnet-unlocked:free-guide-to-testing", "true");
    render(<GatedContent {...defaultProps} />);

    expect(screen.getByText("This is free content.")).toBeDefined();
    expect(screen.getByText("This is gated content.")).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not unlock a different lead magnet slug", () => {
    localStorage.setItem("lead-magnet-unlocked:other-guide", "true");
    render(<GatedContent {...defaultProps} />);

    expect(screen.getByText("This is free content.")).toBeDefined();
    expect(screen.queryByText("This is gated content.")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Email address" }),
    ).toBeDefined();
  });

  it("renders only teaser + gate form when isSignedUp() returns false", () => {
    render(<GatedContent {...defaultProps} />);

    expect(screen.getByText("This is free content.")).toBeDefined();
    expect(screen.queryByText("This is gated content.")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Email address" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Email me the PDF" }),
    ).toBeDefined();
    expect(screen.getByText(defaultProps.description)).toBeDefined();
  });

  it("uses 'Email me the PDF' as the default CTA when none is provided", () => {
    render(
      <GatedContent
        {...defaultProps}
        ctaText={undefined as unknown as string}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Email me the PDF" }),
    ).toBeDefined();
  });

  it("renders the new PDF-first headline and subhead by default", () => {
    render(<GatedContent {...defaultProps} />);
    expect(screen.getByText("Get the PDF")).toBeDefined();
    expect(screen.getByText(defaultProps.description)).toBeDefined();
  });

  it("shows email validation error on invalid input", () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.submit(getForm());

    expect(
      screen.getByText(`${marketingCaptureDefaults.errorInvalidEmail}.`),
    ).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls /api/signup/ with leadMagnetSlug and leadMagnetTitle on submit", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "https://api.test/api/signup/",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "test@example.com",
            sourcePage: "lead-magnet",
            leadMagnetTitle: "Free Guide to Testing",
            leadMagnetSlug: "free-guide-to-testing",
            company_website: "",
            turnstileToken: null,
          }),
        }),
      );
    });
  });

  it("omits leadMagnetSlug when not provided", async () => {
    render(<GatedContent {...defaultProps} leadMagnetSlug={undefined} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      const call = (fetch as unknown as MockInstance).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.leadMagnetSlug).toBeUndefined();
      expect(body.leadMagnetTitle).toBe("Free Guide to Testing");
    });
  });

  it("forwards the provided sourcePage (e.g. /free/ path)", async () => {
    render(<GatedContent {...defaultProps} sourcePage="/free/my-guide" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      const call = (fetch as unknown as MockInstance).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.sourcePage).toBe("/free/my-guide");
    });
  });

  it("renders thank-you panel with Download now button on successful signup with token", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockSetSignedUp).toHaveBeenCalled();
      expect(screen.getByText("Your PDF is ready.")).toBeDefined();
    });
    expect(
      localStorage.getItem("lead-magnet-unlocked:free-guide-to-testing"),
    ).toBe("true");

    const bodyEl = screen.getByText(/We sent it to/);
    expect(bodyEl.textContent).toContain("test@example.com");

    const downloadLink = screen.getByRole("link", { name: "Download now" });
    expect(downloadLink.getAttribute("href")).toBe(
      `https://api.test/api/lead-magnets/download?token=${DOWNLOAD_TOKEN}`,
    );
    expect(downloadLink.getAttribute("target")).toBe("_blank");
    expect(downloadLink.getAttribute("rel")).toBe("noopener noreferrer");

    // Secondary "Read online" link uses webVersionHref
    const readOnline = screen.getByRole("link", { name: "Read online" });
    expect(readOnline.getAttribute("href")).toBe(defaultProps.webVersionHref);

    // Gated body content is no longer shown directly — thank-you replaces the form
    expect(screen.queryByText("This is gated content.")).toBeNull();

    // Tertiary nurture hint
    expect(
      screen.getByText("Check your inbox for the email copy."),
    ).toBeDefined();
  });

  it("renders thank-you panel on 409 duplicate when downloadToken is included", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { success: true, downloadToken: DOWNLOAD_TOKEN },
            { ok: false, status: 409 },
          ),
        ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("Your PDF is ready.")).toBeDefined();
      expect(mockSetSignedUp).toHaveBeenCalled();
      expect(mockTrackEvent).toHaveBeenCalledWith("lead_magnet_unlocked", {
        title: "Free Guide to Testing",
      });
      const submittedCall = mockTrackEvent.mock.calls.find(
        (args: unknown[]) => args[0] === "signup_submitted",
      );
      expect(submittedCall).toBeUndefined();
    });

    const downloadLink = screen.getByRole("link", { name: "Download now" });
    expect(downloadLink.getAttribute("href")).toBe(
      `https://api.test/api/lead-magnets/download?token=${DOWNLOAD_TOKEN}`,
    );
  });

  it("falls back to Read online only when success response has no downloadToken", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: true }, { ok: true, status: 200 }),
        ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("Your PDF is ready.")).toBeDefined();
    });

    expect(screen.queryByRole("link", { name: "Download now" })).toBeNull();
    const readOnline = screen.getByRole("link", { name: "Read online" });
    expect(readOnline.getAttribute("href")).toBe(defaultProps.webVersionHref);
  });

  it("falls back to Read online when JSON parsing throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("invalid JSON");
        },
      } as unknown as Response),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("Your PDF is ready.")).toBeDefined();
    });

    expect(screen.queryByRole("link", { name: "Download now" })).toBeNull();
    expect(screen.getByRole("link", { name: "Read online" })).toBeDefined();
  });

  it("does not render Read online link when webVersionHref is omitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: true }, { ok: true, status: 200 }),
        ),
    );

    render(<GatedContent {...defaultProps} webVersionHref={undefined} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText("Your PDF is ready.")).toBeDefined();
    });

    expect(screen.queryByRole("link", { name: "Read online" })).toBeNull();
  });

  it("calls setSignedUp() on successful response", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockSetSignedUp).toHaveBeenCalled();
    });
  });

  it("handles network error with error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure")),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
      expect(mockCaptureException).toHaveBeenCalled();
    });
  });

  it("handles non-409 error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "Server error" }, { ok: false, status: 500 }),
        ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });
  });

  it("does NOT fire signup_submitted on 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { success: true, downloadToken: DOWNLOAD_TOKEN },
            { ok: false, status: 409 },
          ),
        ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith("lead_magnet_unlocked", {
        title: "Free Guide to Testing",
      });
    });

    const submittedCall = mockTrackEvent.mock.calls.find(
      (args: unknown[]) => args[0] === "signup_submitted",
    );
    expect(submittedCall).toBeUndefined();
  });

  it("tracks lead_magnet_unlocked and signup_submitted events on success", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith("lead_magnet_unlocked", {
        title: defaultProps.leadMagnetTitle,
      });
      expect(mockTrackEvent).toHaveBeenCalledWith("signup_submitted", {
        source: "gated_content",
        source_page: "lead-magnet",
      });
    });
  });

  it("fires signup_submitted with the provided sourcePage when given", async () => {
    render(<GatedContent {...defaultProps} sourcePage="/free/my-guide" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith("signup_submitted", {
        source: "gated_content",
        source_page: "/free/my-guide",
      });
    });
  });

  it("does NOT fire signup_submitted on error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "fail" }, { ok: false, status: 500 }),
        ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });

    const submittedCall = mockTrackEvent.mock.calls.find(
      (args: unknown[]) => args[0] === "signup_submitted",
    );
    expect(submittedCall).toBeUndefined();
  });

  it("gate form is accessible (labels, aria-invalid, error descriptions)", () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("aria-label")).toBe(
      marketingCaptureDefaults.emailLabel,
    );
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBe("gated-content-error");

    // Trigger validation error
    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.submit(getForm());

    expect(input.getAttribute("aria-invalid")).toBe("true");
    const errorEl = document.getElementById("gated-content-error");
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toBe(
      `${marketingCaptureDefaults.errorInvalidEmail}.`,
    );
  });

  it("uses canonical capture defaults for label, placeholder, privacy, and loading copy", async () => {
    let resolveSubmit!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveSubmit = resolve;
          }),
      ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText(marketingCaptureDefaults.emailLabel);
    expect(input.getAttribute("placeholder")).toBe(
      marketingCaptureDefaults.placeholder,
    );
    expect(screen.getByText("No spam. Unsubscribe anytime.")).toBeDefined();

    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    expect(
      screen.getByText(marketingCaptureDefaults.loadingText),
    ).toBeDefined();

    resolveSubmit(
      jsonResponse(
        { success: true, downloadToken: DOWNLOAD_TOKEN },
        { ok: true, status: 200 },
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("Your PDF is ready.")).toBeDefined();
    });
  });

  it("renders custom privacy note", () => {
    render(
      <GatedContent {...defaultProps} privacyNote="Custom privacy text." />,
    );
    expect(screen.getByText("Custom privacy text.")).toBeDefined();
  });

  it("renders default privacy note when none provided", () => {
    render(<GatedContent {...defaultProps} />);
    expect(screen.getByText("No spam. Unsubscribe anytime.")).toBeDefined();
  });

  it("disables form during submission", async () => {
    let resolveSubmit!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveSubmit = resolve;
          }),
      ),
    );

    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    const button = screen.getByRole("button", {
      name: "Email me the PDF",
    });

    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    expect(input.hasAttribute("disabled")).toBe(true);
    expect(button.hasAttribute("disabled")).toBe(true);

    resolveSubmit(
      jsonResponse(
        { success: true, downloadToken: DOWNLOAD_TOKEN },
        { ok: true, status: 200 },
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("Your PDF is ready.")).toBeDefined();
    });
  });

  it("clears error state when user types after validation error", () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");

    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.submit(getForm());

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();

    fireEvent.change(input, { target: { value: "test@example.com" } });

    expect(
      screen.queryByText("Please enter a valid email address."),
    ).toBeNull();
  });

  // --- WCAG 1.3.5 autocomplete & required ---

  it("email input has autoComplete='email' (WCAG 1.3.5)", () => {
    render(<GatedContent {...defaultProps} />);
    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("autocomplete")).toBe("email");
  });

  it("email input has required attribute", () => {
    render(<GatedContent {...defaultProps} />);
    const input = screen.getByLabelText("Email address");
    expect((input as HTMLInputElement).required).toBe(true);
  });

  // --- Anti-spam: honeypot + Turnstile token ---

  it("sends company_website and turnstileToken in the POST body", async () => {
    render(<GatedContent {...defaultProps} />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      const call = (fetch as unknown as MockInstance).mock.calls[0]!;
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.company_website).toBe("");
      expect(body.turnstileToken).toBeNull();
    });
  });

  it("renders the honeypot field with no Turnstile widget when no site key", () => {
    render(<GatedContent {...defaultProps} />);
    expect(document.getElementById("company_website")).not.toBeNull();
    // Turnstile renders nothing without a site key (local dev bypass).
    expect(document.querySelector("script[src*='turnstile']")).toBeNull();
  });

  it("blocks submit and shows an error when a site key is set but no token", async () => {
    render(<GatedContent {...defaultProps} turnstileSiteKey="0x-test-key" />);

    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
