import { marketingCtas } from "@kaiplan/knowledge/marketing";

export const DEFAULT_PUBLIC_SIGNUP_CTA_TEXT = marketingCtas.publicSignup.text;
export const DEFAULT_PUBLIC_SIGNUP_MESSAGE = marketingCtas.publicSignup.message;
const DISALLOWED_PUBLIC_CTA_TEXT_PATTERN =
  /\b(waitlist|questionnaire|survey|follow-?up)\b/i;
const DISALLOWED_PUBLIC_MESSAGE_PATTERN =
  /\b(waitlist|questionnaire|survey|follow-?up|try it free|1-month|sign[ -]?up)\b/i;

interface ResolvePublicSignupCtaOptions {
  sourcePage: string;
  explicitTarget?: string;
  explicitText?: string;
}

export interface PublicSignupCta {
  text: string;
  target: string;
}

export function sanitizePublicSignupCtaText(text?: string): string {
  if (!text) {
    return DEFAULT_PUBLIC_SIGNUP_CTA_TEXT;
  }

  return DISALLOWED_PUBLIC_CTA_TEXT_PATTERN.test(text)
    ? DEFAULT_PUBLIC_SIGNUP_CTA_TEXT
    : text;
}

export function sanitizePublicSignupMessage(
  text: string | undefined,
  fallback = DEFAULT_PUBLIC_SIGNUP_MESSAGE,
): string | undefined {
  if (!text) {
    return text;
  }

  return DISALLOWED_PUBLIC_MESSAGE_PATTERN.test(text) ? fallback : text;
}

export function resolvePublicSignupCta({
  sourcePage,
  explicitTarget,
  explicitText,
}: ResolvePublicSignupCtaOptions): PublicSignupCta {
  const target =
    explicitTarget ?? (sourcePage === "/" ? "#pricing" : "/#pricing");

  return {
    text: sanitizePublicSignupCtaText(explicitText),
    target,
  };
}
