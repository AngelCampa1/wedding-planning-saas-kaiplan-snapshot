import { useState } from "react";
import { clsx } from "clsx";
import { marketingCaptureDefaults } from "@kaiplan/knowledge/marketing";
import { setSignedUp } from "../lib/exit-popup-utils";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import { sanitizeHtml } from "../lib/sanitize";
import { TurnstileWidget } from "./turnstile-widget";
import { HoneypotField } from "./honeypot-field";

const LEAD_MAGNET_UNLOCK_PREFIX = "lead-magnet-unlocked:";

function getUnlockKey(leadMagnetSlug: string | undefined): string | null {
  return leadMagnetSlug
    ? `${LEAD_MAGNET_UNLOCK_PREFIX}${leadMagnetSlug}`
    : null;
}

function isLeadMagnetUnlocked(leadMagnetSlug: string | undefined): boolean {
  const unlockKey = getUnlockKey(leadMagnetSlug);
  if (!unlockKey) return false;

  try {
    return localStorage.getItem(unlockKey) === "true";
  } catch {
    return false;
  }
}

function setLeadMagnetUnlocked(leadMagnetSlug: string | undefined): void {
  const unlockKey = getUnlockKey(leadMagnetSlug);
  if (!unlockKey) return;

  try {
    localStorage.setItem(unlockKey, "true");
  } catch {
    // localStorage unavailable (private browsing, restricted context)
  }
}

type SubmitStatus =
  | "idle"
  | "loading"
  | "success"
  | "error-validation"
  | "error-generic";

interface GatedContentProps {
  apiUrl: string;
  leadMagnetTitle: string;
  leadMagnetSlug?: string;
  description: string;
  ctaText?: string;
  teaserHtml: string;
  gatedHtml: string;
  privacyNote?: string;
  sourcePage?: string;
  /** Link to the web-readable version of the magnet (Read online fallback). */
  webVersionHref?: string;
  /** Headline shown above the gate form. */
  headline?: string;
  turnstileSiteKey?: string;
}

interface SignupResponseBody {
  downloadToken?: string;
}

export function GatedContent({
  apiUrl,
  leadMagnetTitle,
  leadMagnetSlug,
  description,
  ctaText,
  teaserHtml,
  gatedHtml,
  privacyNote = "No spam. Unsubscribe anytime.",
  sourcePage,
  webVersionHref,
  headline = "Get the PDF",
  turnstileSiteKey,
}: GatedContentProps) {
  const buttonLabel = ctaText ?? "Email me the PDF";
  const [unlocked, setUnlocked] = useState(() =>
    isLeadMagnetUnlocked(leadMagnetSlug),
  );
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");

  if (unlocked && status !== "success") {
    return (
      <div className="prose prose-lg max-w-none">
        <div
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(teaserHtml + gatedHtml),
          }}
        />
      </div>
    );
  }

  const isError = status === "error-validation" || status === "error-generic";

  const errorMessage =
    status === "error-validation"
      ? `${marketingCaptureDefaults.errorInvalidEmail}.`
      : status === "error-generic"
        ? marketingCaptureDefaults.errorGeneric
        : "";

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

    setStatus("loading");

    try {
      const res = await fetch(`${apiUrl}/api/signup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sourcePage: sourcePage ?? "lead-magnet",
          leadMagnetTitle,
          ...(leadMagnetSlug ? { leadMagnetSlug } : {}),
          company_website: companyWebsite,
          turnstileToken,
        }),
      });

      const handleUnlock = async (fireSignupSubmitted: boolean) => {
        let body: SignupResponseBody;
        try {
          body = (await res.json()) as SignupResponseBody;
        } catch {
          body = {};
        }
        setSubmittedEmail(email);
        setDownloadToken(
          typeof body.downloadToken === "string" ? body.downloadToken : null,
        );
        setLeadMagnetUnlocked(leadMagnetSlug);
        setSignedUp();
        setStatus("success");
        setUnlocked(true);
        trackEvent("lead_magnet_unlocked", { title: leadMagnetTitle });
        if (fireSignupSubmitted) {
          trackEvent("signup_submitted", {
            source: "gated_content",
            source_page: sourcePage ?? "lead-magnet",
          });
        }
      };

      if (res.ok) {
        await handleUnlock(true);
      } else if (res.status === 409) {
        // Already signed up elsewhere — still unlock and show download.
        await handleUnlock(false);
      } else {
        setStatus("error-generic");
      }
    } catch (err) {
      captureException(err);
      setStatus("error-generic");
    }
  }

  if (status === "success") {
    const downloadHref = downloadToken
      ? `${apiUrl}/api/lead-magnets/download?token=${downloadToken}`
      : null;

    return (
      <div>
        <div
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(teaserHtml) }}
        />
        <div
          className="relative rounded-[var(--radius-lg,12px)] border border-[var(--color-neutral-200)] p-6 sm:p-8 text-center"
          style={{ background: "var(--surface-sunken)" }}
        >
          <h3
            className="font-heading font-bold mb-2"
            style={{
              fontSize: "var(--text-heading, 1.25rem)",
              color: "var(--color-brand-text)",
            }}
          >
            Your PDF is ready.
          </h3>
          <p
            className="mb-6"
            style={{
              fontSize: "var(--text-caption, 0.875rem)",
              color: "var(--color-brand-muted)",
            }}
          >
            We sent it to {submittedEmail}. You can also download it right now.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto items-center justify-center">
            {downloadHref ? (
              <a
                href={downloadHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary btn-shimmer whitespace-nowrap px-6"
              >
                Download now
              </a>
            ) : null}
            {webVersionHref ? (
              <a
                href={webVersionHref}
                className="inline-flex items-center justify-center min-h-[44px] px-3 underline"
                style={{
                  fontSize: "var(--text-caption, 0.875rem)",
                  color: "var(--color-brand-muted)",
                }}
              >
                Read online
              </a>
            ) : null}
          </div>

          <p
            className="mt-4"
            style={{
              fontSize: "var(--text-caption, 0.875rem)",
              color: "var(--color-brand-muted)",
            }}
          >
            Check your inbox for the email copy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Teaser content */}
      <div
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(teaserHtml) }}
      />

      {/* Gate overlay with gradient fade */}
      <div className="lead-magnet-gate relative">
        {/* Gradient fade effect */}
        <div
          className="pointer-events-none h-24 -mt-24 relative z-10"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--surface-sunken))",
          }}
        />

        {/* Email gate form */}
        <div
          className="relative z-20 rounded-[var(--radius-lg,12px)] border border-[var(--color-neutral-200)] p-6 sm:p-8 text-center"
          style={{ background: "var(--surface-sunken)" }}
        >
          <h3
            className="font-heading font-bold mb-2"
            style={{
              fontSize: "var(--text-heading, 1.25rem)",
              color: "var(--color-brand-text)",
            }}
          >
            {headline}
          </h3>
          <p
            className="mb-6"
            style={{
              fontSize: "var(--text-caption, 0.875rem)",
              color: "var(--color-brand-muted)",
            }}
          >
            {description}
          </p>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-1 text-left">
              <label
                htmlFor="gated-content-email"
                className="font-medium text-[var(--color-brand-text)] sm:sr-only"
                style={{ fontSize: "max(16px, var(--text-body, 1rem))" }}
              >
                {marketingCaptureDefaults.emailLabel}
              </label>
              <input
                id="gated-content-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status.startsWith("error")) setStatus("idle");
                }}
                placeholder={marketingCaptureDefaults.placeholder}
                aria-label={marketingCaptureDefaults.emailLabel}
                aria-invalid={isError}
                aria-describedby="gated-content-error"
                className={clsx(
                  "w-full px-4 py-3 min-h-[44px] rounded-[var(--radius-md,8px)] border",
                  "bg-[var(--surface-sunken)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]",
                  "transition-[border-color] duration-[var(--transition-fast,150ms)]",
                  isError
                    ? "border-[var(--color-error-500)]"
                    : "border-[var(--color-neutral-300)]",
                )}
                disabled={status === "loading"}
                style={{ fontSize: "max(16px, var(--text-body, 1rem))" }}
              />
            </div>

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
                "whitespace-nowrap px-6 w-full sm:w-auto",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                status === "loading" && "cursor-wait",
              )}
            >
              {status === "loading"
                ? marketingCaptureDefaults.loadingText
                : buttonLabel}
            </button>
          </form>

          <p
            id="gated-content-error"
            aria-live="polite"
            className={
              isError ? "text-[var(--color-error-500)] mt-2" : "sr-only"
            }
            style={
              isError
                ? { fontSize: "var(--text-caption, 0.875rem)" }
                : undefined
            }
          >
            {isError ? errorMessage : ""}
          </p>

          <p
            className="mt-4"
            style={{
              fontSize: "var(--text-caption, 0.875rem)",
              color: "var(--color-brand-muted)",
            }}
          >
            {privacyNote}
          </p>
        </div>
      </div>
    </div>
  );
}
