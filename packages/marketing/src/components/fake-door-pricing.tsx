import { useState, useEffect, useRef, type MouseEvent } from "react";
import type {
  PricingTier,
  SurveyQuestion,
  ReferralReward,
  SurveyQualificationConfig,
} from "../types";
import { EmailCapture } from "./email-capture";
import { useFocusTrap } from "../lib/focus-trap";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";
import {
  formatAnnualPrice,
  formatAnnualMonthlyEquivalent,
} from "../lib/pricing-utils";
import { trackBillingToggle } from "../lib/billing-toggle-tracker";
import { findPricingIntentTierFromSearch } from "../lib/pricing-intent";
import {
  DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
  DEFAULT_PUBLIC_SIGNUP_MESSAGE,
  sanitizePublicSignupMessage,
} from "../lib/public-signup-cta";

interface FakeDoorEmailCaptureProps {
  apiUrl: string;
  sourcePage: string;
  surveyQuestions: SurveyQuestion[];
  surveyQualification?: SurveyQualificationConfig;
  qualification?: SurveyQualificationConfig;
  discoveryCallUrl: string;
  ariaLabel?: string;
  buttonText?: string;
  subtitle?: string;
  whatHappensNext?: string;
  surveyPreview?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  referralRewards?: ReferralReward[];
  productName?: string;
  productDomain?: string;
  qualifiedHeading?: string;
  qualifiedBody?: string;
  qualifiedCtaText?: string;
  qualifiedDismissText?: string;
  unqualifiedHeading?: string;
  unqualifiedBody?: string;
  unqualifiedCtaText?: string;
  unqualifiedCtaTarget?: string;
  unqualifiedDismissText?: string;
}

interface FakeDoorPricingProps {
  apiUrl: string;
  sourcePage: string;
  tiers: PricingTier[];
  onTierClick?: () => void;
  confirmationMessage?: string;
  buttonPrefix?: string;
  heading?: string;
  popularTier?: string;
  popularBadgeText?: string;
  selectedBadgeText?: string;
  recommendedBadgeText?: string;
  socialProofText?: string;
  selectedMessages?: Record<string, string>;
  emailCapture?: FakeDoorEmailCaptureProps;
  clearButtonText?: string;
  modalAriaLabel?: string;
  trialBannerText?: string;
  annualSavingsText?: string;
  monthlyToggleLabel?: string;
  annualToggleLabel?: string;
  showBillingToggle?: boolean;
}

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getAnnualPriceDisplay(tier: PricingTier): string {
  if (tier.annualPriceOverride) return tier.annualPriceOverride;
  if (tier.monthlyPriceCents !== undefined) {
    return formatAnnualPrice(tier.monthlyPriceCents, tier.unitLabel);
  }
  return tier.price;
}

export function FakeDoorPricing({
  apiUrl,
  sourcePage,
  tiers,
  onTierClick,
  confirmationMessage,
  buttonPrefix,
  heading,
  popularTier,
  popularBadgeText = "Most Popular",
  selectedBadgeText = "Selected",
  recommendedBadgeText = "RECOMMENDED",
  socialProofText,
  selectedMessages,
  emailCapture,
  clearButtonText = "Clear",
  modalAriaLabel = "See plan details and continue",
  trialBannerText,
  annualSavingsText,
  monthlyToggleLabel,
  annualToggleLabel,
  showBillingToggle,
}: FakeDoorPricingProps) {
  const [sessionId, setSessionId] = useState("");
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set());
  const [lastSelectedTier, setLastSelectedTier] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">(
    "monthly",
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasHandledUrlIntentRef = useRef(false);

  const canShowToggle =
    showBillingToggle !== false &&
    tiers.some((t) => t.monthlyPriceCents !== undefined) &&
    !tiers.every((t) => t.pricingModel === "one-time");

  function closeModal() {
    setModalOpen(false);
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }

  function clearSelection() {
    setSelectedTiers(new Set());
    setLastSelectedTier(null);
    setModalOpen(false);
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }

  // Initialize sessionId client-side only to avoid SSR/hydration mismatch
  useEffect(() => {
    setSessionId(generateSessionId());
  }, []);

  useFocusTrap(dialogRef, modalOpen);

  useEffect(() => {
    if (modalOpen) {
      closeBtnRef.current?.focus();
    }
  }, [modalOpen]);

  // Body scroll lock when modal is open
  useEffect(() => {
    if (!modalOpen) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeModal();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen]);

  useEffect(() => {
    if (!emailCapture || tiers.length === 0) return;
    document.documentElement.dataset.fakeDoorPricingReady = "true";
    document.dispatchEvent(new CustomEvent("fake-door-pricing-ready"));

    return () => {
      delete document.documentElement.dataset.fakeDoorPricingReady;
    };
  }, [emailCapture, tiers]);

  async function handleTierSelection(tierName: string) {
    if (!selectedTiers.has(tierName)) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
    setSelectedTiers((prev) => new Set([...prev, tierName]));
    setLastSelectedTier(tierName);
    if (emailCapture) {
      setModalOpen(true);
    }

    try {
      await fetch(`${apiUrl}/api/pricing-click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tierName.toLowerCase(),
          sourcePage,
          sessionId,
          billingPeriod,
        }),
      });
      trackEvent("pricing_tier_clicked", {
        tier_name: tierName,
        source_page: sourcePage,
        billing_period: billingPeriod,
      });
    } catch (err) {
      captureException(err);
    }

    onTierClick?.();
  }

  function resolveTierName(targetTierName?: string): string | undefined {
    if (!targetTierName) {
      return tiers[0]?.name;
    }

    return tiers.find(
      (tier) => tier.name.toLowerCase() === targetTierName.toLowerCase(),
    )?.name;
  }

  // Listen for external open-pricing-modal event (from sticky CTA)
  useEffect(() => {
    if (!emailCapture || tiers.length === 0) return;
    function handleOpenModal(event: Event) {
      const customEvent = event as CustomEvent<{ tierName?: string }>;
      const tierName = resolveTierName(customEvent.detail?.tierName);
      if (!tierName) return;
      void handleTierSelection(tierName);
    }
    document.addEventListener("open-pricing-modal", handleOpenModal);
    return () =>
      document.removeEventListener("open-pricing-modal", handleOpenModal);
  }, [
    billingPeriod,
    emailCapture,
    onTierClick,
    selectedTiers,
    sessionId,
    sourcePage,
    tiers,
    apiUrl,
  ]);

  useEffect(() => {
    if (
      hasHandledUrlIntentRef.current ||
      !emailCapture ||
      tiers.length === 0 ||
      sessionId.length === 0
    ) {
      return;
    }

    const tierName = findPricingIntentTierFromSearch(
      window.location.search,
      tiers,
    );
    if (!tierName) return;

    hasHandledUrlIntentRef.current = true;
    void handleTierSelection(tierName);
  }, [
    apiUrl,
    billingPeriod,
    emailCapture,
    onTierClick,
    sessionId,
    sourcePage,
    tiers,
  ]);

  const hasSelection = selectedTiers.size > 0;
  const visibleTrialBannerText = sanitizePublicSignupMessage(trialBannerText);

  return (
    <>
      <section
        data-fake-door-pricing
        className="px-4 py-[var(--section-py)]"
        style={{ background: "var(--section-gradient-b)" }}
      >
        <div className="max-w-5xl mx-auto">
          {visibleTrialBannerText && (
            <p className="text-center mb-4 text-[length:var(--text-caption)] font-medium text-[var(--color-accent-600)]">
              {visibleTrialBannerText}
            </p>
          )}
          {heading && (
            <div className="flex items-baseline justify-between mb-10">
              <h2 className="text-[length:var(--text-heading)] font-bold font-heading">
                {heading}
              </h2>
              {hasSelection && (
                <button
                  onClick={clearSelection}
                  className="transition-colors text-[length:var(--text-caption)] underline text-[var(--color-neutral-500)] hover:text-[var(--color-brand-text)]"
                >
                  {clearButtonText}
                </button>
              )}
            </div>
          )}
          {!heading && hasSelection && (
            <div className="flex justify-end mb-4">
              <button
                onClick={clearSelection}
                className="transition-colors text-[length:var(--text-caption)] underline text-[var(--color-neutral-500)] hover:text-[var(--color-brand-text)]"
              >
                {clearButtonText}
              </button>
            </div>
          )}
          {canShowToggle && (
            <div
              role="radiogroup"
              aria-label="Billing period"
              className="flex justify-center mb-8"
            >
              <div className="inline-flex rounded-full border border-[var(--color-neutral-300)] p-1 bg-[var(--surface-secondary)]">
                <button
                  role="radio"
                  aria-checked={billingPeriod === "monthly"}
                  onClick={() => {
                    setBillingPeriod("monthly");
                    trackBillingToggle("monthly", sourcePage);
                  }}
                  className={[
                    "inline-flex min-h-11 items-center rounded-full px-5 py-2 text-[length:var(--text-caption)] font-medium transition-[background-color,color] duration-[var(--transition-base)]",
                    billingPeriod === "monthly"
                      ? "bg-[var(--color-accent-500)] text-[var(--color-accent-950)]"
                      : "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-text)]",
                  ].join(" ")}
                >
                  {monthlyToggleLabel ?? "Monthly"}
                </button>
                <button
                  role="radio"
                  aria-checked={billingPeriod === "annual"}
                  onClick={() => {
                    setBillingPeriod("annual");
                    trackBillingToggle("annual", sourcePage);
                  }}
                  className={[
                    "inline-flex min-h-11 items-center rounded-full px-5 py-2 text-[length:var(--text-caption)] font-medium transition-[background-color,color] duration-[var(--transition-base)]",
                    billingPeriod === "annual"
                      ? "bg-[var(--color-accent-500)] text-[var(--color-accent-950)]"
                      : "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-text)]",
                  ].join(" ")}
                >
                  {annualToggleLabel ?? "Annual"}
                </button>
              </div>
            </div>
          )}
          <div
            className={`grid gap-6 ${tiers.length === 1 ? "max-w-lg mx-auto" : tiers.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}
          >
            {tiers.map((tier) => {
              const isSelected = selectedTiers.has(tier.name);
              const isPopular =
                popularTier !== undefined &&
                tier.name.toLowerCase() === popularTier.toLowerCase();
              return (
                <div
                  key={tier.name}
                  className={[
                    "relative rounded-[var(--radius-md)] p-8",
                    tiers.length === 1 && "md:p-10",
                    "bg-[var(--surface-primary)] shadow-[var(--shadow-card)] border-[var(--color-neutral-200)]",
                    "hover:-translate-y-[var(--card-hover-lift)] hover:scale-[var(--card-hover-scale)] hover:shadow-[var(--shadow-lg)]",
                    "transition-[transform,box-shadow,border-color] duration-[var(--transition-base)]",
                    isPopular ? "mt-3" : "",
                    isSelected
                      ? "border-2 border-[var(--color-accent-400)] bg-[var(--color-accent-50)]"
                      : tier.highlighted
                        ? "border-2 border-[var(--color-accent-400)] bg-[var(--color-accent-50)] shadow-[var(--shadow-lg)]"
                        : "border border-[var(--color-neutral-300)]",
                  ].join(" ")}
                >
                  {isPopular && !isSelected && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-[length:var(--text-caption)] font-bold rounded-full bg-[var(--color-accent-500)] text-[var(--color-accent-950)]">
                      {popularBadgeText}
                    </span>
                  )}
                  {isSelected && (
                    <span className="font-mono absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
                      {selectedBadgeText}
                    </span>
                  )}
                  {!isSelected && tier.highlighted && (
                    <span className="font-mono absolute top-3 right-3 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-widest bg-[var(--color-accent-100)] text-[var(--color-accent-700)] shadow-[var(--shadow-sm)]">
                      {recommendedBadgeText}
                    </span>
                  )}
                  {billingPeriod === "annual" && annualSavingsText && (
                    <span className="font-mono inline-block mb-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
                      {annualSavingsText}
                    </span>
                  )}
                  <h3
                    className="font-bold font-heading"
                    style={{ fontSize: "var(--text-subheading)" }}
                  >
                    {tier.name}
                  </h3>
                  <p className="mt-3">
                    {billingPeriod === "annual" ? (
                      <>
                        <span className="font-mono text-[length:var(--text-hero)] font-bold leading-none">
                          {getAnnualPriceDisplay(tier)}
                        </span>
                        {tier.monthlyPriceCents !== undefined && (
                          <span className="block text-[length:var(--text-caption)] text-[var(--color-brand-muted)] mt-0.5">
                            {formatAnnualMonthlyEquivalent(
                              tier.monthlyPriceCents,
                              tier.unitLabel,
                            )}
                          </span>
                        )}
                        {tier.monthlyPriceCents !== undefined && (
                          <span className="block text-[length:var(--text-caption)] text-[var(--color-brand-muted)] line-through">
                            {tier.price}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-mono text-[length:var(--text-hero)] font-bold leading-none">
                        {tier.price}
                      </span>
                    )}
                  </p>
                  {tier.description && (
                    <p className="text-[length:var(--text-caption)] text-[var(--color-brand-muted)] mt-1">
                      {tier.description}
                    </p>
                  )}
                  <ul className="mt-6 space-y-3">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[var(--color-accent-500)] text-[var(--surface-primary)] flex items-center justify-center">
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M2 5l2 2 4-4"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className="text-[length:var(--text-caption)] text-[var(--color-brand-text)]">
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => void handleTierSelection(tier.name)}
                    className={[
                      "mt-8 w-full",
                      isSelected
                        ? "btn-secondary bg-[var(--color-accent-100)] text-[var(--color-accent-700)] border-2 border-[var(--color-accent-400)]"
                        : tier.highlighted
                          ? "btn-primary btn-primary--pulse btn-shimmer"
                          : "btn-primary btn-shimmer",
                    ].join(" ")}
                  >
                    {isSelected ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M2 7l3.5 3.5L12 3.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {selectedBadgeText}
                      </span>
                    ) : tier.ctaText ? (
                      tier.ctaText
                    ) : buttonPrefix ? (
                      `${buttonPrefix} ${tier.name}`
                    ) : (
                      tier.name
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          {socialProofText && (
            <p className="mx-auto mt-5 max-w-2xl text-center text-[length:var(--text-body)] leading-7 text-[var(--color-brand-muted)]">
              {socialProofText}
            </p>
          )}
          {hasSelection &&
            !emailCapture &&
            (() => {
              const tierKey = lastSelectedTier?.toLowerCase() ?? "";
              const normalizedMessages = selectedMessages
                ? Object.fromEntries(
                    Object.entries(selectedMessages).map(([k, v]) => [
                      k.toLowerCase(),
                      v,
                    ]),
                  )
                : undefined;
              const message =
                tierKey && normalizedMessages?.[tierKey]
                  ? normalizedMessages[tierKey]
                  : confirmationMessage;
              return message ? (
                <p className="text-center mt-6 text-[var(--color-brand-muted)]">
                  {message}
                </p>
              ) : null;
            })()}
        </div>
      </section>

      {/* Email capture modal — mounts outside the section so it overlays everything */}
      {modalOpen && emailCapture && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: "var(--surface-overlay)" }}
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={modalAriaLabel}
        >
          <div
            className="relative w-full max-w-lg mx-4 rounded-[var(--radius-lg)] shadow-[var(--shadow-ambient)] overflow-hidden"
            style={{ background: "var(--surface-elevated)" }}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <button
              ref={closeBtnRef}
              type="button"
              aria-label="Close"
              onClick={closeModal}
              className="absolute top-3 right-3 z-10 min-w-11 min-h-11 flex items-center justify-center rounded-full text-[var(--color-neutral-500)] hover:bg-[var(--surface-secondary)] transition-colors"
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
            <div className="p-6 pt-8">
              <EmailCapture
                {...emailCapture}
                surveyQualification={
                  emailCapture.qualification ?? emailCapture.surveyQualification
                }
                qualification={
                  emailCapture.qualification ?? emailCapture.surveyQualification
                }
                buttonText={
                  emailCapture.buttonText ?? DEFAULT_PUBLIC_SIGNUP_CTA_TEXT
                }
                subtitle={
                  emailCapture.subtitle ??
                  (emailCapture.productName
                    ? `Start the trial now, then choose a plan later inside ${emailCapture.productName}.`
                    : DEFAULT_PUBLIC_SIGNUP_MESSAGE)
                }
                ariaLabel={emailCapture.ariaLabel ?? modalAriaLabel}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
