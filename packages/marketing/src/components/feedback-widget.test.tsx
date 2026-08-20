import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));
vi.mock("../lib/scroll-lock", () => ({
  lockScroll: vi.fn(),
  unlockScroll: vi.fn(),
}));
vi.mock("../lib/focus-trap", () => ({ useFocusTrap: vi.fn() }));

import { FeedbackWidget } from "./feedback-widget";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { useFocusTrap } from "../lib/focus-trap";

function cleanupFeedbackFixtures() {
  document.querySelectorAll("[data-test-feedback-fixture]").forEach((node) => {
    node.remove();
  });
}

type IntersectionObserverCallbackType = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;

let intersectionCallback: IntersectionObserverCallbackType | null = null;
const observedElements: Element[] = [];

class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];

  constructor(callback: IntersectionObserverCallbackType) {
    intersectionCallback = callback;
  }

  observe = vi.fn((element: Element) => {
    observedElements.push(element);
  });
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanupFeedbackFixtures();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 201 }));
  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  Object.defineProperty(window, "location", {
    value: { href: "https://crewroute.com/pricing" },
    writable: true,
    configurable: true,
  });
  document.documentElement.removeAttribute("data-mobile-nav-open");
  intersectionCallback = null;
  observedElements.length = 0;
});

afterEach(() => {
  cleanupFeedbackFixtures();
  vi.useRealTimers();
});

const defaultProps = { apiUrl: "https://crewroute.com" };

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Open feedback form" }));
}

function fillForm(cat: string = "Bug", msg: string = "test") {
  fireEvent.click(screen.getByRole("button", { name: cat }));
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: msg },
  });
}

describe("FeedbackWidget", () => {
  it("renders floating button with correct aria-label", () => {
    render(<FeedbackWidget {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "Open feedback form" }),
    ).toBeDefined();
  });

  it("uses a compact mobile trigger instead of hiding feedback access", () => {
    render(<FeedbackWidget {...defaultProps} />);
    const trigger = screen.getByRole("button", { name: "Open feedback form" });

    expect(trigger.className).toContain("max-sm:h-11");
    expect(trigger.className).toContain("max-sm:w-11");
    expect(trigger.className).toContain("max-sm:px-0");
    expect(trigger.className).toContain("max-sm:py-0");
    expect(trigger.className).toContain("max-sm:rounded-full");
    expect(trigger.className).not.toContain("hidden");
  });

  it("keeps the trigger near the viewport edge when no sticky CTA is present", () => {
    render(<FeedbackWidget {...defaultProps} />);
    const trigger = screen.getByRole("button", { name: "Open feedback form" });

    expect(trigger.className).toContain("bottom-6");
    expect(trigger.className).not.toContain("bottom-24");
  });

  it("offsets the trigger when a sticky CTA is present", async () => {
    const stickyCta = document.createElement("div");
    stickyCta.setAttribute("data-sticky-cta", "");
    document.body.appendChild(stickyCta);

    render(<FeedbackWidget {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Open feedback form" }).className,
      ).toContain("bottom-24");
    });
  });

  it("updates the trigger position when a sticky CTA is added later", async () => {
    render(<FeedbackWidget {...defaultProps} />);

    const stickyCta = document.createElement("div");
    stickyCta.setAttribute("data-sticky-cta", "");
    document.body.appendChild(stickyCta);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Open feedback form" }).className,
      ).toContain("bottom-24");
    });
  });

  it("hides the trigger while the mobile nav is open", () => {
    document.documentElement.setAttribute("data-mobile-nav-open", "true");

    render(<FeedbackWidget {...defaultProps} />);

    expect(
      screen.queryByRole("button", { name: "Open feedback form" }),
    ).toBeNull();
  });

  it("hides the trigger while a blocking dialog overlay is active", async () => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-test-feedback-fixture", "");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    document.body.appendChild(overlay);

    render(<FeedbackWidget {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Open feedback form" }),
      ).toBeNull();
    });
  });

  it("hides the trigger when the footer enters the viewport", async () => {
    const footer = document.createElement("footer");
    footer.setAttribute("data-site-footer", "");
    document.body.appendChild(footer);

    render(<FeedbackWidget {...defaultProps} />);

    expect(intersectionCallback).not.toBeNull();

    await act(async () => {
      intersectionCallback?.(
        [
          {
            isIntersecting: true,
            target: footer,
          } as unknown as IntersectionObserverEntry,
        ],
        new IntersectionObserverMock(() => {}),
      );
    });

    expect(
      screen.queryByRole("button", { name: "Open feedback form" }),
    ).toBeNull();
  });

  it("observes the site footer instead of nested content footers", () => {
    const nestedFooter = document.createElement("footer");
    const siteFooter = document.createElement("footer");
    siteFooter.setAttribute("data-site-footer", "");
    document.body.append(nestedFooter, siteFooter);

    render(<FeedbackWidget {...defaultProps} />);

    expect(observedElements).toHaveLength(1);
    expect(
      (observedElements[0] as HTMLElement).hasAttribute("data-site-footer"),
    ).toBe(true);
    expect((observedElements[0] as HTMLElement).tagName).toBe("FOOTER");
    expect(observedElements[0]).not.toBe(nestedFooter);
  });

  it("uses the WCAG-safe dark brand primary token for the trigger button", () => {
    // The previous brand sage scored 3.08:1 against white (axe serious fail);
    // the widget now renders on --color-primary-700 (~4.9:1) while keeping
    // the sage lineage. Guard against regressing to the lighter shades.
    render(<FeedbackWidget apiUrl="http://localhost" />);
    const btn = screen.getByRole("button", { name: "Open feedback form" });
    expect(btn.className).toContain("--color-primary-700");
    expect(btn.className).not.toContain("--color-primary-5");
    expect(btn.className).not.toContain("--color-brand-primary");
  });

  it("uses the WCAG-safe dark brand primary token for the selected category chip", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    const bugBtn = screen.getByRole("button", { name: "Bug" });
    fireEvent.click(bugBtn);
    expect(bugBtn.className).toContain("--color-primary-700");
    expect(bugBtn.className).not.toContain("--color-primary-5");
    expect(bugBtn.className).not.toContain("--color-brand-primary");
  });

  it("defaults to the other category so message-only submissions can proceed", () => {
    render(<FeedbackWidget {...defaultProps} />);

    openPanel();
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "This should be enough to submit." },
    });

    expect(
      screen
        .getByRole("button", { name: "Other" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Submit Feedback" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("opens panel on button click", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Send feedback");
  });

  it("moves focus to the first feedback control when the panel opens", () => {
    render(<FeedbackWidget {...defaultProps} />);

    openPanel();

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Other" }),
    );
  });

  it("restores focus to the trigger when the panel closes", () => {
    render(<FeedbackWidget {...defaultProps} />);

    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open feedback form" }),
    );
  });

  it("tracks feedback_opened on open", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    expect(trackEvent).toHaveBeenCalledWith("feedback_opened");
  });

  it("calls lockScroll on open and unlockScroll on close", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    expect(lockScroll).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(unlockScroll).toHaveBeenCalled();
  });

  it("calls useFocusTrap with panel ref and visibility", () => {
    render(<FeedbackWidget {...defaultProps} />);
    expect(useFocusTrap).toHaveBeenCalled();
  });

  it("shows category chips: Bug, Idea, Other", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    expect(screen.getByRole("button", { name: "Bug" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Idea" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Other" })).toBeDefined();
  });

  it("toggles category selection with aria-pressed", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    const bugBtn = screen.getByRole("button", { name: "Bug" });
    expect(bugBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(bugBtn);
    expect(bugBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("submit button is disabled without category or message", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    const submit = screen.getByRole("button", {
      name: "Submit Feedback",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("submit button is enabled with category and message", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm();
    const submit = screen.getByRole("button", {
      name: "Submit Feedback",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("shows character count", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    expect(screen.getByText("0/2000")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "hello" },
    });
    expect(screen.getByText("5/2000")).toBeDefined();
  });

  it("enforces max 2000 character limit on textarea", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    expect(textarea.getAttribute("maxlength")).toBe("2000");
  });

  it("validates email when provided and shows error for invalid email", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm();
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: "not-an-email" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Submit Feedback" }));
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
  });

  it("clears email error when user types", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm();
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: "not-an-email" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Submit Feedback" }));
    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeDefined();
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: "v" },
    });
    expect(
      screen.queryByText("Please enter a valid email address."),
    ).toBeNull();
  });

  it("submits successfully and shows success state", async () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm("Bug", "broken page");

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Submit Feedback" }));
    });

    await waitFor(() => {
      expect(screen.getByText("Thank you!")).toBeDefined();
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://crewroute.com/api/feedback/",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body,
    );
    expect(body.category).toBe("bug");
    expect(body.message).toBe("broken page");
    expect(body.pageUrl).toBe("https://crewroute.com/pricing");

    expect(trackEvent).toHaveBeenCalledWith("feedback_submitted", {
      category: "bug",
    });
  });

  it("sends email in request body when provided", async () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Idea" }));
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "great feature idea" },
    });
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: "test@example.com" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Submit Feedback" }));
    });

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body,
    );
    expect(body.email).toBe("test@example.com");
  });

  it("shows error state on fetch failure and calls captureException", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error"),
    );
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm();

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Submit Feedback" }));
    });

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });
    expect(captureException).toHaveBeenCalled();
  });

  it("shows error state on non-ok response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm();

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Submit Feedback" }));
    });

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeDefined();
    });
  });

  it("closes panel on ESC key", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    expect(screen.getByRole("dialog")).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes panel on backdrop click", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables fields during loading", async () => {
    let resolvePromise: (v: unknown) => void;
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((r) => {
        resolvePromise = r;
      }),
    );

    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm();

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Submit Feedback" }));
    });

    expect(
      (screen.getByLabelText("Message") as HTMLTextAreaElement).disabled,
    ).toBe(true);
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("Sending...")).toBeDefined();

    await act(async () => {
      resolvePromise!({ ok: true, status: 201 });
    });
  });

  it("does not submit when message is empty or whitespace only", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Bug" }));
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "   " },
    });
    const submit = screen.getByRole("button", {
      name: "Submit Feedback",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("auto-closes after success with 2s delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm();

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Submit Feedback" }));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("Thank you!")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resets form when closed and reopened", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    openPanel();
    expect(
      screen
        .getByRole("button", { name: "Other" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("0/2000")).toBeDefined();
  });

  it("email input has autoComplete='email' (WCAG 1.3.5)", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    const input = screen.getByLabelText(/Email/);
    expect(input.getAttribute("autocomplete")).toBe("email");
  });

  // --- Bot protection: honeypot + Turnstile ---

  it("renders a hidden honeypot input named company_website in the form", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    const honeypot = document.querySelector<HTMLInputElement>(
      'input[name="company_website"]',
    );
    expect(honeypot).not.toBeNull();
    expect(honeypot?.tabIndex).toBe(-1);
    let ancestor: HTMLElement | null = honeypot;
    while (ancestor) {
      expect(ancestor.getAttribute("aria-hidden")).not.toBe("true");
      ancestor = ancestor.parentElement;
    }
  });

  it("includes company_website and turnstileToken in the request body", async () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    fillForm("Bug", "broken page");
    const honeypot = document.querySelector<HTMLInputElement>(
      'input[name="company_website"]',
    );
    fireEvent.change(honeypot as HTMLInputElement, {
      target: { value: "trap" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body,
    );
    expect(body.company_website).toBe("trap");
    expect(body.turnstileToken).toBeNull();
  });

  it("does not render a Turnstile widget when no site key is configured", () => {
    render(<FeedbackWidget {...defaultProps} />);
    openPanel();
    expect(
      document.querySelector('script[src*="challenges.cloudflare.com"]'),
    ).toBeNull();
  });

  describe("with Turnstile enforcement", () => {
    afterEach(() => {
      delete (window as { turnstile?: unknown }).turnstile;
      document
        .querySelectorAll('script[src*="challenges.cloudflare.com"]')
        .forEach((node) => node.remove());
    });

    it("blocks submission until a token is solved when a site key is set", async () => {
      let solve: ((token: string) => void) | null = null;
      (window as { turnstile?: unknown }).turnstile = {
        render: (
          _el: HTMLElement,
          opts: { callback: (token: string) => void },
        ) => {
          solve = opts.callback;
          return "id";
        },
        remove: vi.fn(),
      };

      render(<FeedbackWidget {...defaultProps} turnstileSiteKey="site-key" />);
      openPanel();
      fillForm("Bug", "broken page");
      fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));

      // No token yet — blocked, fetch not called, error shown.
      await waitFor(() => {
        expect(
          screen.getByText("Something went wrong. Please try again."),
        ).toBeTruthy();
      });
      expect(fetch).not.toHaveBeenCalled();

      act(() => {
        solve?.("fb-token");
      });
      fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });
      const body = JSON.parse(
        (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body,
      );
      expect(body.turnstileToken).toBe("fb-token");
    });
  });
});
