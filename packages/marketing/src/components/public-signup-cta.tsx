import type {
  ReferralReward,
  SurveyQualificationConfig,
  SurveyQuestion,
} from "../types";
import { resolvePublicSignupCta } from "../lib/public-signup-cta";

interface PublicSignupCtaProps {
  apiUrl?: string;
  sourcePage: string;
  buttonText?: string;
  ctaText?: string;
  ctaTarget?: string;
  placeholder?: string;
  emailLabel?: string;
  inputId?: string;
  surveyQuestions?: SurveyQuestion[];
  surveyQualification?: SurveyQualificationConfig;
  qualification?: SurveyQualificationConfig;
  discoveryCallUrl?: string;
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
}

export default function PublicSignupCta({
  sourcePage,
  buttonText,
  ctaText,
  ctaTarget,
}: PublicSignupCtaProps) {
  const resolvedCta = resolvePublicSignupCta({
    sourcePage,
    explicitTarget: ctaTarget,
    explicitText: ctaText ?? buttonText,
  });

  return (
    <a
      href={resolvedCta.target}
      className="btn-primary btn-shimmer inline-flex items-center justify-center w-full sm:w-auto"
    >
      {resolvedCta.text}
    </a>
  );
}
