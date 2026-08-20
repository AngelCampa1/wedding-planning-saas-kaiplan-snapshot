import { useState, useEffect, useRef, useCallback } from "react";
import { clsx } from "clsx";
import { useFocusTrap } from "../lib/focus-trap";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import { EMAIL_REGEX } from "../lib/email-validation";
import { TurnstileWidget } from "./turnstile-widget";
import { HoneypotField } from "./honeypot-field";

type SubmitStatus = "idle" | "loading" | "success" | "error";
type Category = "bug" | "idea" | "other";

interface FeedbackWidgetProps {
  apiUrl: string;
  turnstileSiteKey?: string;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Other" },
];

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_CATEGORY: Category = "other";

export function FeedbackWidget({
  apiUrl,
  turnstileSiteKey,
}: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [hasStickyCta, setHasStickyCta] = useState(false);
  const [hasBlockingOverlay, setHasBlockingOverlay] = useState(false);
  const [hasFooterInView, setHasFooterInView] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstCategoryRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldRestoreFocusRef = useRef(false);

  const openPanel = useCallback(() => {
    setOpen(true);
    trackEvent("feedback_opened");
  }, []);

  const closePanel = useCallback(() => {
    shouldRestoreFocusRef.current = true;
    setOpen(false);
    setCategory(DEFAULT_CATEGORY);
    setMessage("");
    setEmail("");
    setEmailError(false);
    setCompanyWebsite("");
    setTurnstileToken(null);
    setStatus("idle");
  }, []);

  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closePanel]);

  useEffect(() => {
    if (!open) return;
    firstCategoryRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (open || !shouldRestoreFocusRef.current) return;
    triggerRef.current?.focus({ preventScroll: true });
    shouldRestoreFocusRef.current = false;
  }, [open]);
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    function syncFloatingWidgetState() {
      setHasStickyCta(document.querySelector("[data-sticky-cta]") !== null);
      setHasBlockingOverlay(
        document.querySelector('[aria-modal="true"]') !== null,
      );
    }

    syncFloatingWidgetState();

    const observer = new MutationObserver(() => {
      syncFloatingWidgetState();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-modal"],
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    function syncMobileNavState() {
      setMobileNavOpen(
        document.documentElement.dataset.mobileNavOpen === "true",
      );
    }

    syncMobileNavState();

    const observer = new MutationObserver(syncMobileNavState);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mobile-nav-open"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const footer = document.querySelector("[data-site-footer]");
    if (!footer || typeof IntersectionObserver === "undefined") {
      setHasFooterInView(false);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setHasFooterInView(entry?.isIntersecting ?? false);
    });

    observer.observe(footer);

    return () => {
      observer.disconnect();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (message.trim().length === 0) return;

    if (email.length > 0 && !EMAIL_REGEX.test(email)) {
      setEmailError(true);
      return;
    }

    // When a Turnstile site key is configured, block submission until solved.
    /* c8 ignore next 3 -- covered in component tests; v8 misses this async submit branch on jsdom. */
    if (turnstileSiteKey && !turnstileToken) {
      setStatus("error");
      return;
    }

    setStatus("loading");

    try {
      const res = await fetch(`${apiUrl}/api/feedback/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          email: email.length > 0 ? email : undefined,
          pageUrl: window.location.href,
          company_website: companyWebsite,
          turnstileToken,
        }),
      });

      if (res.ok) {
        setStatus("success");
        trackEvent("feedback_submitted", { category });
        timerRef.current = setTimeout(() => {
          closePanel();
        }, 2000);
      } else {
        setStatus("error");
      }
    } catch (err) {
      captureException(err);
      setStatus("error");
    }
  }

  const canSubmit = message.trim().length > 0 && status !== "loading";
  const shouldShowTrigger =
    !open && !hasBlockingOverlay && !mobileNavOpen && !hasFooterInView;

  return (
    <>
      {shouldShowTrigger && (
        <button
          type="button"
          onClick={openPanel}
          ref={triggerRef}
          aria-label="Open feedback form"
          className={clsx(
            "fixed right-4 z-40 sm:right-6 sm:bottom-6",
            hasStickyCta ? "bottom-24" : "bottom-6",
            "flex min-h-11 min-w-11 items-center justify-center gap-2 px-4 py-2.5 max-sm:right-3 max-sm:h-11 max-sm:w-11 max-sm:rounded-full max-sm:px-0 max-sm:py-0",
            "rounded-full shadow-lg",
            "text-[length:var(--text-caption)] font-medium",
            "transition-transform hover:scale-[1.02] cursor-pointer",
            "bg-[var(--color-primary-700)] text-white",
          )}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 2h12a1 1 0 011 1v8a1 1 0 01-1 1H5l-3 3V3a1 1 0 011-1z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="max-sm:sr-only">Feedback</span>
        </button>
      )}

      {open && (
        <div
          data-backdrop
          onClick={closePanel}
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Send feedback"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              "absolute right-0 top-0 h-full w-full max-w-md",
              "flex flex-col",
              "bg-[var(--surface-sunken)] shadow-2xl",
              "animate-[var(--animate-slide-in-right)]",
            )}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-neutral-200)]">
              <h2 className="text-[length:var(--text-subheading)] font-semibold text-[var(--color-brand-text)]">
                Send Feedback
              </h2>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Close"
                className="min-w-11 min-h-11 flex items-center justify-center rounded-full hover:bg-[var(--color-neutral-100)] transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M1 1l12 12M13 1L1 13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {status === "success" ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 48 48"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="color-mix(in srgb, var(--color-brand-primary) 20%, transparent)"
                  />
                  <path
                    d="M16 24l6 6 10-12"
                    stroke="var(--color-brand-primary)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="text-[length:var(--text-subheading)] font-semibold text-[var(--color-brand-text)]">
                  Thank you!
                </p>
                <p className="text-[length:var(--text-caption)] text-[var(--color-brand-muted)]">
                  Your feedback has been submitted.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex-1 flex flex-col gap-4 px-6 py-4 overflow-y-auto pb-[env(safe-area-inset-bottom)]"
              >
                <fieldset>
                  <legend className="text-[length:var(--text-caption)] font-medium text-[var(--color-brand-text)] mb-2">
                    Category
                  </legend>
                  <div className="flex gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        ref={
                          cat.value === DEFAULT_CATEGORY
                            ? firstCategoryRef
                            : undefined
                        }
                        onClick={() => setCategory(cat.value)}
                        className={clsx(
                          "inline-flex min-h-11 items-center rounded-full px-4 py-1.5 text-[length:var(--text-caption)] font-medium transition-colors",
                          category === cat.value
                            ? "bg-[var(--color-primary-700)] text-white"
                            : "bg-[var(--color-neutral-100)] text-[var(--color-brand-text)] hover:bg-[var(--color-neutral-200)]",
                        )}
                        aria-pressed={category === cat.value}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label
                    htmlFor="feedback-message"
                    className="text-[length:var(--text-caption)] font-medium text-[var(--color-brand-text)] mb-1 block"
                  >
                    Message
                  </label>
                  <textarea
                    id="feedback-message"
                    value={message}
                    onChange={(e) =>
                      setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
                    }
                    placeholder="Tell us what's on your mind..."
                    rows={5}
                    maxLength={MAX_MESSAGE_LENGTH}
                    disabled={status === "loading"}
                    className={clsx(
                      "w-full px-3 py-2 rounded-[var(--radius-md)] border text-base sm:text-[length:var(--text-caption)] resize-none",
                      "bg-[var(--surface-sunken)]",
                      "border-[var(--color-neutral-300)]",
                      "focus:outline-none focus:border-[var(--color-brand-primary)] focus:ring-1 focus:ring-[var(--color-brand-primary)]",
                      "disabled:opacity-50",
                    )}
                  />
                  <p className="text-[length:var(--text-caption)] text-[var(--color-brand-muted)] mt-1 text-right">
                    {message.length}/{MAX_MESSAGE_LENGTH}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="feedback-email"
                    className="text-[length:var(--text-caption)] font-medium text-[var(--color-brand-text)] mb-1 block"
                  >
                    Email{" "}
                    <span className="text-[var(--color-brand-muted)] font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(false);
                    }}
                    placeholder="you@company.com"
                    disabled={status === "loading"}
                    aria-invalid={emailError}
                    aria-describedby={
                      emailError ? "feedback-email-error" : undefined
                    }
                    className={clsx(
                      "w-full px-3 py-2 rounded-[var(--radius-md)] border text-base sm:text-[length:var(--text-caption)]",
                      "bg-[var(--surface-sunken)]",
                      emailError
                        ? "border-[var(--color-error-500)]"
                        : "border-[var(--color-neutral-300)]",
                      "focus:outline-none focus:border-[var(--color-brand-primary)] focus:ring-1 focus:ring-[var(--color-brand-primary)]",
                      "disabled:opacity-50",
                    )}
                  />
                  {emailError && (
                    <p
                      id="feedback-email-error"
                      className="text-[length:var(--text-caption)] text-[var(--color-error-500)] mt-1"
                    >
                      Please enter a valid email address.
                    </p>
                  )}
                </div>

                {status === "error" && (
                  <p
                    className="text-[length:var(--text-caption)] text-[var(--color-error-500)]"
                    role="alert"
                  >
                    Something went wrong. Please try again.
                  </p>
                )}

                <HoneypotField
                  value={companyWebsite}
                  onChange={setCompanyWebsite}
                />

                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  onToken={setTurnstileToken}
                />

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={clsx(
                    "w-full py-2.5 rounded-[var(--radius-md)] text-[length:var(--text-caption)] font-semibold transition-colors",
                    "bg-[var(--color-primary-700)] text-white",
                    "hover:bg-[color-mix(in_srgb,var(--color-brand-primary)_85%,black)]",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    status === "loading" && "cursor-wait",
                  )}
                >
                  {status === "loading" ? "Sending..." : "Submit Feedback"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
