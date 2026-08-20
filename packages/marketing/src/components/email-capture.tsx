import { useState, useEffect, useId, useRef } from "react";
import { clsx } from "clsx";
import { marketingCaptureDefaults } from "@kaiplan/knowledge/marketing";
import { PostSignupSurvey } from "./post-signup-survey";
import { TurnstileWidget } from "./turnstile-widget";
import { HoneypotField } from "./honeypot-field";
import type {
  SurveyQuestion,
  ReferralReward,
  SurveyQualificationConfig,
} from "../types";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import {
  trackEmailFocus,
  trackEmailBlurWithoutSubmit,
} from "../lib/form-interaction-tracker";
import {
  persistSignupAttribution,
  resolveSignupAttribution,
} from "../lib/signup-attribution";
import { setSignedUp } from "../lib/exit-popup-utils";

interface SignupResponse {
  referralCode?: string;
  position?: number;
  surveyToken?: string;
  surveyAvailable?: boolean;
}

type SubmitStatus =
  | "idle"
  | "loading"
  | "success"
  | "error-validation"
  | "error-duplicate"
  | "error-generic";

const PRE_SUBMIT_QUESTION_COPY_PATTERN =
  /\b(question|questions|survey|questionnaire)\b/i;

interface EmailCaptureProps {
  apiUrl: string;
  sourcePage: string;
  buttonText?: string;
  placeholder?: string;
  emailLabel?: string;
  inputId?: string;
  surveyQuestions: SurveyQuestion[];
  surveyQualification?: SurveyQualificationConfig;
  qualification?: SurveyQualificationConfig;
  discoveryCallUrl: string;
  subtitle?: string;
  whatHappensNext?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  surveyPreview?: string;
  referralRewards?: ReferralReward[];
  productName?: string;
  productDomain?: string;
  qualifiedHeading?: string;
  qualifiedBody?: string;
  qualifiedCtaText?: string;
  unqualifiedHeading?: string;
  unqualifiedBody?: string;
  unqualifiedCtaText?: string;
  unqualifiedCtaTarget?: string;
  qualifiedDismissText?: string;
  unqualifiedDismissText?: string;
  ariaLabel?: string;
  loadingText?: string;
  turnstileSiteKey?: string;
}

export function EmailCapture({
  apiUrl,
  sourcePage,
  buttonText = marketingCaptureDefaults.buttonText,
  placeholder,
  emailLabel = marketingCaptureDefaults.emailLabel,
  inputId,
  surveyQuestions,
  surveyQualification,
  qualification,
  discoveryCallUrl,
  subtitle,
  whatHappensNext,
  privacyNote,
  errorInvalidEmail = marketingCaptureDefaults.errorInvalidEmail,
  errorDuplicate,
  errorGeneric = marketingCaptureDefaults.errorGeneric,
  successMessage = marketingCaptureDefaults.successMessage,
  surveyPreview,
  referralRewards,
  productName,
  productDomain,
  qualifiedHeading,
  qualifiedBody,
  qualifiedCtaText,
  unqualifiedHeading,
  unqualifiedBody,
  unqualifiedCtaText,
  unqualifiedCtaTarget,
  qualifiedDismissText,
  unqualifiedDismissText,
  ariaLabel = marketingCaptureDefaults.ariaLabel,
  loadingText = marketingCaptureDefaults.loadingText,
  turnstileSiteKey,
}: EmailCaptureProps) {
  const generatedInputId = useId().replace(/:/g, "");
  const resolvedInputId = inputId ?? `email-capture-${generatedInputId}`;
  const errorId = `${resolvedInputId}-error`;
  const [email, setEmail] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [showSurvey, setShowSurvey] = useState(false);
  const [referralCode, setReferralCode] = useState<string | undefined>();
  const [position, setPosition] = useState<number | undefined>();
  const [surveyToken, setSurveyToken] = useState<string | undefined>();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleWhatHappensNext =
    whatHappensNext && !PRE_SUBMIT_QUESTION_COPY_PATTERN.test(whatHappensNext)
      ? whatHappensNext
      : undefined;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    persistSignupAttribution();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("survey") === "open") {
      const token = params.get("t");
      if (token) {
        setSurveyToken(token);
        setStatus("success");
        setSignedUp();
        setShowSurvey(true);
      }
    }
  }, []);

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value);
    if (status.startsWith("error")) {
      setStatus("idle");
    }
  }

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
      const attribution = resolveSignupAttribution();
      let shouldOpenSurvey = true;
      const res = await fetch(`${apiUrl}/api/signup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sourcePage,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          referredBy: attribution.referredBy,
          company_website: companyWebsite,
          turnstileToken,
        }),
      });

      if (res.ok) {
        try {
          const data = (await res.json()) as SignupResponse;
          if (data.referralCode) {
            setReferralCode(data.referralCode);
          }
          if (typeof data.position === "number") {
            setPosition(data.position);
          }
          if (data.surveyToken) {
            setSurveyToken(data.surveyToken);
          }
          if (data.surveyAvailable === false) {
            shouldOpenSurvey = false;
          }
        } catch {
          // Response may not be JSON — continue without referral data
        }
        const utmProps: Record<string, string> = {};
        const utmSource = attribution.utmSource;
        const utmMedium = attribution.utmMedium;
        const utmCampaign = attribution.utmCampaign;
        if (utmSource) utmProps.utm_source = utmSource;
        if (utmMedium) utmProps.utm_medium = utmMedium;
        if (utmCampaign) utmProps.utm_campaign = utmCampaign;
        trackEvent("signup_completed", {
          source_page: sourcePage,
          has_referral: attribution.referredBy !== undefined,
          ...utmProps,
        });
        trackEvent("signup_submitted", {
          source: "email_capture",
          source_page: sourcePage,
          ...utmProps,
        });
        setStatus("success");
        setSignedUp();
        if (shouldOpenSurvey) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            setShowSurvey(true);
          }, 1500);
        }
      } else if (res.status === 409) {
        trackEvent("signup_duplicate", { source_page: sourcePage });
        if (errorDuplicate) {
          setStatus("error-duplicate");
        } else {
          try {
            const data = (await res.json()) as SignupResponse;
            if (data.referralCode) {
              setReferralCode(data.referralCode);
            }
            if (typeof data.position === "number") {
              setPosition(data.position);
            }
            if (data.surveyToken) {
              setSurveyToken(data.surveyToken);
            }
            if (data.surveyAvailable === false) {
              shouldOpenSurvey = false;
            }
          } catch {
            // continue without referral data
          }
          setStatus("success");
          setSignedUp();
          if (shouldOpenSurvey) {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              setShowSurvey(true);
            }, 1500);
          }
        }
      } else {
        setStatus("error-generic");
      }
    } catch (err) {
      captureException(err);
      setStatus("error-generic");
    }
  }

  if (showSurvey) {
    return (
      <PostSignupSurvey
        apiUrl={apiUrl}
        surveyToken={surveyToken}
        questions={surveyQuestions}
        qualificationConfig={qualification ?? surveyQualification}
        qualification={qualification ?? surveyQualification}
        discoveryCallUrl={discoveryCallUrl}
        onComplete={() => setShowSurvey(false)}
        referralCode={referralCode}
        position={position}
        referralRewards={referralRewards}
        productName={productName}
        productDomain={productDomain}
        qualifiedHeading={qualifiedHeading}
        qualifiedBody={qualifiedBody}
        qualifiedCtaText={qualifiedCtaText}
        unqualifiedHeading={unqualifiedHeading}
        unqualifiedBody={unqualifiedBody}
        unqualifiedCtaText={unqualifiedCtaText}
        unqualifiedCtaTarget={unqualifiedCtaTarget}
        qualifiedDismissText={qualifiedDismissText}
        unqualifiedDismissText={unqualifiedDismissText}
        sourcePage={sourcePage}
      />
    );
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
      className="max-w-md mx-auto"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--component-gap-sm)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        aria-label={ariaLabel}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--component-gap-sm)",
        }}
      >
        <div
          className="flex flex-col sm:flex-row items-stretch sm:items-end"
          style={{ gap: "var(--component-gap-sm)" }}
        >
          <div className="flex flex-col gap-1 flex-1">
            <label
              htmlFor={resolvedInputId}
              className="font-medium text-[var(--color-brand-text)]"
              style={{ fontSize: "max(16px, var(--text-body))" }}
            >
              {emailLabel}
            </label>
            <input
              id={resolvedInputId}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={handleEmailChange}
              onFocus={() => trackEmailFocus(sourcePage)}
              onBlur={() => {
                if (status !== "success" && status !== "loading") {
                  trackEmailBlurWithoutSubmit(sourcePage, email.length > 0);
                }
              }}
              placeholder={placeholder ?? marketingCaptureDefaults.placeholder}
              aria-invalid={isError}
              aria-describedby={errorId}
              className={clsx(
                "w-full px-4 py-3 min-h-[44px] rounded-[var(--radius-md)] border",
                "bg-[var(--surface-sunken)]",
                "font-mono",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] focus-visible:shadow-[var(--shadow-glow-primary)]",
                "transition-[border-color] duration-[var(--transition-fast)]",
                isError
                  ? "border-[var(--color-error-500)] animate-[shake_0.4s_ease-in-out]"
                  : "border-[var(--color-neutral-300)]",
              )}
              disabled={status === "loading"}
              style={{
                caretColor: "var(--color-primary-500)",
                fontSize: "max(16px, var(--text-body))",
                boxShadow: "var(--shadow-md)",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading" || status === "success"}
            className={clsx(
              "btn-primary btn-shimmer",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
              "flex items-center justify-center gap-2 w-full sm:min-w-[140px] sm:w-auto",
              status === "loading" && "cursor-wait",
            )}
          >
            {status === "loading" ? (
              <>
                <span
                  className="w-4 h-4 rounded-full border-2 border-[var(--color-accent-950)] border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                <span>{loadingText}</span>
              </>
            ) : status === "success" ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="8"
                    fill="currentColor"
                    opacity="0.2"
                  />
                  <path
                    d="M4.5 8l2.5 2.5 4.5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {successMessage && <span>{successMessage}</span>}
              </>
            ) : (
              buttonText
            )}
          </button>
        </div>

        <HoneypotField value={companyWebsite} onChange={setCompanyWebsite} />

        <TurnstileWidget
          siteKey={turnstileSiteKey}
          onToken={setTurnstileToken}
        />
      </form>

      {status === "success" && surveyPreview ? (
        <p
          className="text-[var(--color-brand-muted)] text-center"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {surveyPreview}
        </p>
      ) : null}

      <p
        id={errorId}
        aria-live="polite"
        className={
          isError && !!currentErrorMessage
            ? "text-[var(--color-error-500)]"
            : "sr-only"
        }
        style={
          isError && !!currentErrorMessage
            ? { fontSize: "var(--text-caption)" }
            : undefined
        }
      >
        {isError ? currentErrorMessage : ""}
      </p>

      {subtitle ? (
        <p
          className="font-semibold text-[var(--color-brand-text)] text-center"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {subtitle}
        </p>
      ) : null}

      {privacyNote ? (
        <p
          className="text-[var(--color-brand-muted)]"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {privacyNote}
        </p>
      ) : null}

      {status === "idle" && visibleWhatHappensNext ? (
        <p
          className="text-[var(--color-brand-muted)] text-center"
          style={{ fontSize: "var(--text-caption)" }}
        >
          {visibleWhatHappensNext}
        </p>
      ) : null}
    </div>
  );
}
