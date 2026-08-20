import { useState, useEffect, useRef, useCallback } from "react";
import { useFocusTrap } from "../lib/focus-trap";
import { clsx } from "clsx";
import {
  isSignedUp,
  isWithinSuppressWindow,
  setSuppressed,
  setSignedUp,
  detectScrollBack,
  SUPPRESS_DAYS,
} from "../lib/exit-popup-utils";
import { EXIT_POPUP_DEFAULTS } from "../lib/exit-popup-defaults";
import type { LeadMagnet } from "../types";
import { EMAIL_REGEX } from "../lib/email-validation";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import {
  persistSignupAttribution,
  resolveSignupAttribution,
} from "../lib/signup-attribution";
import { TurnstileWidget } from "./turnstile-widget";
import { HoneypotField } from "./honeypot-field";

type SubmitStatus =
  | "idle"
  | "loading"
  | "success"
  | "error-validation"
  | "error-duplicate"
  | "error-generic";

interface ExitIntentPopupProps {
  apiUrl: string;
  siteName: string;
  leadMagnet?: LeadMagnet;
  leadMagnetOptions?: LeadMagnet[];
  headline: string;
  description: string;
  ctaText: string;
  leftPanelLabel: string;
  successSubMessage: string;
  showLeadMagnetContent?: boolean;
  declineText?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  loadingText?: string;
  turnstileSiteKey?: string;
}

export function ExitIntentPopup({
  apiUrl,
  siteName,
  leadMagnet,
  leadMagnetOptions,
  headline,
  description,
  ctaText,
  leftPanelLabel,
  successSubMessage,
  showLeadMagnetContent = true,
  declineText = EXIT_POPUP_DEFAULTS.declineText,
  privacyNote = EXIT_POPUP_DEFAULTS.privacyNote,
  errorInvalidEmail = EXIT_POPUP_DEFAULTS.errorInvalidEmail,
  errorDuplicate = EXIT_POPUP_DEFAULTS.errorDuplicate,
  errorGeneric = EXIT_POPUP_DEFAULTS.errorGeneric,
  successMessage = EXIT_POPUP_DEFAULTS.successMessage,
  loadingText,
  turnstileSiteKey,
}: ExitIntentPopupProps) {
  const selectableLeadMagnets =
    showLeadMagnetContent && leadMagnetOptions && leadMagnetOptions.length > 0
      ? leadMagnetOptions
      : showLeadMagnetContent && leadMagnet
        ? [leadMagnet]
        : [];
  const defaultLeadMagnet =
    selectableLeadMagnets.find(
      (option) => option.slug && option.slug === leadMagnet?.slug,
    ) ??
    selectableLeadMagnets.find(
      (option) => option.title === leadMagnet?.title,
    ) ??
    selectableLeadMagnets[0];
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [selectedLeadMagnetKey, setSelectedLeadMagnetKey] = useState(
    () => defaultLeadMagnet?.slug ?? defaultLeadMagnet?.title ?? "",
  );
  const [submittedLeadMagnet, setSubmittedLeadMagnet] =
    useState<LeadMagnet | null>(null);
  const triggeredRef = useRef(false);
  const dismissedRef = useRef(false);
  // Tracks whether the shown analytics event has fired within this popup
  // lifecycle. Resets naturally on component unmount/remount if re-show is
  // ever needed; there is no runtime path that resets it while dismissed.
  const shownTrackedRef = useRef(false);
  const peakScrollYRef = useRef(0);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const selectedLeadMagnetRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedLeadMagnet =
    selectableLeadMagnets.find(
      (option) => (option.slug ?? option.title) === selectedLeadMagnetKey,
    ) ?? defaultLeadMagnet;
  const showResourcePicker = selectableLeadMagnets.length > 1;

  const resolvedDescription =
    showLeadMagnetContent && selectedLeadMagnet?.description
      ? selectedLeadMagnet.description
      : description;
  const panelTitle = showLeadMagnetContent
    ? (selectedLeadMagnet?.title ?? `${siteName} Guide`)
    : undefined;
  const resolvedSuccessSubMessage =
    showResourcePicker && (submittedLeadMagnet ?? selectedLeadMagnet)
      ? `Check your inbox for ${
          (submittedLeadMagnet ?? selectedLeadMagnet)!.title
        }.`
      : successSubMessage;

  const dismiss = useCallback(() => {
    setSuppressed();
    dismissedRef.current = true;
    triggeredRef.current = false;
    setVisible(false);
    setSubmittedLeadMagnet(null);
    setCompanyWebsite("");
    setTurnstileToken(null);
    trackEvent("exit_popup_dismissed");
  }, []);

  // Focus email input when popup opens
  useEffect(() => {
    if (visible && showResourcePicker && selectedLeadMagnetRef.current) {
      selectedLeadMagnetRef.current.focus();
      return;
    }
    if (visible && emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, [visible, showResourcePicker]);

  // Esc key handler — only active when visible
  useEffect(() => {
    if (!visible) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismiss();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, dismiss]);

  useFocusTrap(dialogRef, visible);

  // Body scroll lock when visible
  useEffect(() => {
    if (!visible) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [visible]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Mount: attach exit-intent triggers
  useEffect(() => {
    persistSignupAttribution();

    if (isSignedUp() || isWithinSuppressWindow(SUPPRESS_DAYS)) {
      return;
    }

    const timer = setTimeout(() => {
      triggeredRef.current = true;
    }, 5000);

    function handleMouseLeave(e: MouseEvent) {
      if (triggeredRef.current && !dismissedRef.current && e.clientY < 5) {
        setVisible(true);
        if (!shownTrackedRef.current) {
          shownTrackedRef.current = true;
          trackEvent("exit_popup_shown", { trigger: "mouseleave" });
        }
      }
    }

    document.addEventListener("mouseleave", handleMouseLeave);

    let scrollHandler: (() => void) | null = null;

    if ("ontouchstart" in window) {
      scrollHandler = () => {
        const currentY = window.scrollY;
        if (currentY > peakScrollYRef.current) {
          peakScrollYRef.current = currentY;
        }
        if (
          triggeredRef.current &&
          !dismissedRef.current &&
          detectScrollBack(currentY, peakScrollYRef.current, 300, 200)
        ) {
          setVisible(true);
          if (!shownTrackedRef.current) {
            shownTrackedRef.current = true;
            trackEvent("exit_popup_shown", { trigger: "scroll_back" });
          }
        }
      };
      window.addEventListener("scroll", scrollHandler, { passive: true });
    }

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseleave", handleMouseLeave);
      if (scrollHandler) {
        window.removeEventListener("scroll", scrollHandler);
      }
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      setStatus("error-validation");
      return;
    }

    // When a Turnstile site key is configured, block submission until the
    // challenge is solved. Without a key (local dev), submit with no token.
    if (turnstileSiteKey && !turnstileToken) {
      setStatus("error-generic");
      return;
    }

    const submittingLeadMagnet = selectedLeadMagnet ?? null;
    setSubmittedLeadMagnet(submittingLeadMagnet);
    setStatus("loading");

    try {
      const attribution = resolveSignupAttribution();
      const res = await fetch(`${apiUrl}/api/signup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sourcePage: "exit-popup",
          ...(showLeadMagnetContent &&
            submittingLeadMagnet && {
              leadMagnetTitle: submittingLeadMagnet.title,
              leadMagnetSlug: submittingLeadMagnet.slug,
            }),
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          referredBy: attribution.referredBy,
          company_website: companyWebsite,
          turnstileToken,
        }),
      });

      if (res.ok) {
        setSignedUp();
        dismissedRef.current = true;
        setStatus("success");
        trackEvent("exit_popup_converted");
        trackEvent("signup_submitted", {
          source: "exit_popup",
          source_page: "exit-popup",
        });
        timerRef.current = setTimeout(() => {
          setVisible(false);
        }, 2000);
      } else if (res.status === 409) {
        setSubmittedLeadMagnet(null);
        setStatus("error-duplicate");
      } else {
        setSubmittedLeadMagnet(null);
        setStatus("error-generic");
      }
    } catch (err) {
      captureException(err);
      setSubmittedLeadMagnet(null);
      setStatus("error-generic");
    }
  }

  if (!visible) {
    return null;
  }

  const isError =
    status === "error-validation" ||
    status === "error-duplicate" ||
    status === "error-generic";

  const currentErrorMessage =
    status === "error-validation"
      ? errorInvalidEmail
      : status === "error-duplicate"
        ? errorDuplicate
        : status === "error-generic"
          ? errorGeneric
          : "";

  return (
    <div
      data-backdrop
      onClick={dismiss}
      className="fixed inset-0 flex items-center justify-center z-[80]"
      style={{ background: "var(--exit-popup-overlay-bg)" }}
    >
      {/* Dialog — stop propagation so clicks inside don't dismiss */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-popup-heading"
        onClick={(e) => e.stopPropagation()}
        className="relative mx-4 flex max-h-[calc(100vh-2rem)] [max-height:calc(100dvh-2rem)] w-full max-w-[640px] flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)] rounded-[var(--radius-lg)] shadow-[var(--shadow-ambient)] sm:flex-row sm:pb-0"
      >
        {/* Left panel (subtle primary tint) */}
        <div className="hidden sm:flex flex-col items-center justify-center gap-3 p-6 sm:w-44 sm:shrink-0 bg-[var(--color-primary-50)] border-r border-[var(--color-neutral-200)]">
          {/* Document SVG icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="8"
              y="4"
              width="28"
              height="36"
              rx="3"
              style={{ fill: "var(--color-primary-700)" }}
              fillOpacity="0.25"
            />
            <rect
              x="10"
              y="6"
              width="24"
              height="32"
              rx="2"
              style={{ fill: "var(--color-primary-700)" }}
              fillOpacity="0.9"
            />
            <rect
              x="14"
              y="13"
              width="16"
              height="2"
              rx="1"
              fill="var(--color-primary-50)"
            />
            <rect
              x="14"
              y="18"
              width="16"
              height="2"
              rx="1"
              fill="var(--color-primary-50)"
            />
            <rect
              x="14"
              y="23"
              width="10"
              height="2"
              rx="1"
              fill="var(--color-primary-50)"
            />
          </svg>
          <span
            className="text-[length:var(--text-caption)] font-bold tracking-widest uppercase"
            style={{ color: "var(--color-primary-700)" }}
          >
            {leftPanelLabel}
          </span>
          {panelTitle ? (
            <p
              className="text-[length:var(--text-caption)] font-semibold text-center leading-snug"
              style={{ color: "var(--color-primary-700)" }}
            >
              {panelTitle}
            </p>
          ) : null}
        </div>

        {/* Right panel (white/surface) */}
        <div
          className="flex flex-col gap-4 p-6 flex-1"
          style={{ background: "var(--surface-sunken)" }}
        >
          {/* Close button */}
          <button
            type="button"
            aria-label="Close"
            onClick={dismiss}
            className={clsx(
              "absolute top-3 right-3",
              "w-11 h-11 flex items-center justify-center",
              "rounded-full text-[var(--color-neutral-500)]",
              "hover:bg-[var(--color-neutral-100)]",
              "transition-colors",
            )}
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

          {status === "success" ? (
            /* Success state */
            <div className="flex flex-col gap-2 pt-2">
              <h2
                id="exit-popup-heading"
                className="font-heading font-bold text-[var(--color-brand-text)]"
                style={{ fontSize: "var(--text-heading)" }}
              >
                {successMessage}
              </h2>
              <p className="text-[length:var(--text-caption)] text-[var(--color-brand-muted)]">
                {resolvedSuccessSubMessage}
              </p>
            </div>
          ) : (
            /* Form state */
            <>
              <h2
                id="exit-popup-heading"
                className="font-heading font-bold text-[var(--color-brand-text)] pr-12 leading-snug"
                style={{ fontSize: "var(--text-heading)" }}
              >
                {headline}
              </h2>
              <p className="text-[length:var(--text-caption)] text-[var(--color-brand-muted)]">
                {resolvedDescription}
              </p>

              {showResourcePicker ? (
                <fieldset
                  className="grid gap-2"
                  aria-label="Choose your free resource"
                >
                  <legend className="sr-only">Choose your free resource</legend>
                  {selectableLeadMagnets.map((option) => {
                    const optionKey = option.slug ?? option.title;
                    const isSelected = optionKey === selectedLeadMagnetKey;
                    return (
                      <label
                        key={optionKey}
                        className={clsx(
                          "flex cursor-pointer gap-3 rounded-[var(--radius-md)] border px-3 py-2.5",
                          "transition-[border-color,background-color,box-shadow]",
                          isSelected
                            ? "border-[var(--color-primary-500)] bg-[var(--color-primary-50)] shadow-[var(--shadow-sm)]"
                            : "border-[var(--color-neutral-200)] bg-[var(--surface-sunken)] hover:border-[var(--color-neutral-300)]",
                        )}
                      >
                        <input
                          ref={isSelected ? selectedLeadMagnetRef : undefined}
                          type="radio"
                          name="exit-popup-lead-magnet"
                          value={optionKey}
                          checked={isSelected}
                          disabled={status === "loading"}
                          onChange={() => setSelectedLeadMagnetKey(optionKey)}
                          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary-700)]"
                        />
                        <span className="grid gap-1">
                          <span
                            className="font-semibold leading-tight text-[var(--color-brand-text)]"
                            style={{ fontSize: "var(--text-caption)" }}
                          >
                            {option.title}
                          </span>
                          <span
                            className="leading-snug text-[var(--color-brand-muted)]"
                            style={{ fontSize: "var(--text-caption)" }}
                          >
                            {option.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                  ref={emailInputRef}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status.startsWith("error")) setStatus("idle");
                  }}
                  placeholder="you@company.com"
                  aria-label="Email address"
                  aria-invalid={isError}
                  aria-describedby="exit-popup-error"
                  className={clsx(
                    "w-full px-4 py-2.5 rounded-[var(--radius-md)] border text-base sm:text-[length:var(--text-caption)]",
                    "bg-[var(--surface-sunken)]",
                    "focus:outline-none focus:border-[var(--color-primary-500)] focus:border-2",
                    "transition-[border-color] duration-[var(--transition-fast)]",
                    isError
                      ? "border-[var(--color-error-500)]"
                      : "border-[var(--color-neutral-300)]",
                  )}
                  disabled={status === "loading"}
                />

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
                  disabled={status === "loading"}
                  className={clsx(
                    "btn-primary btn-shimmer",
                    "w-full",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
                    status === "loading" && "cursor-wait",
                  )}
                >
                  {status === "loading"
                    ? (loadingText ?? "Sending\u2026")
                    : ctaText}
                </button>
              </form>

              <p
                id="exit-popup-error"
                aria-live="polite"
                className={
                  isError ? "text-[var(--color-error-500)]" : "sr-only"
                }
                style={
                  isError ? { fontSize: "var(--text-caption)" } : undefined
                }
              >
                {isError ? currentErrorMessage : ""}
              </p>

              <p
                className="text-[var(--color-brand-muted)]"
                style={{ fontSize: "var(--text-caption)" }}
              >
                {privacyNote}
              </p>

              <button
                type="button"
                onClick={dismiss}
                className="inline-flex min-h-11 items-center text-base sm:text-[length:var(--text-caption)] transition-colors text-[var(--color-brand-muted)] underline underline-offset-2 hover:text-[var(--color-brand-text)] text-left"
              >
                {declineText}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
