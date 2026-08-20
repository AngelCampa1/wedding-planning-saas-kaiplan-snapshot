import type { BuyerStage, CtaAnalyticsContext } from "../types";

export type CtaClickEventProperties = Record<string, unknown> & {
  button_text: string;
  href: string;
  section: string;
  page_path: string;
  page_family?: string;
  buyer_stage?: BuyerStage;
  placement?: string;
  intent?: string;
  target?: string;
};

const SENSITIVE_QUERY_KEY_RE =
  /authorization|cookie|token|secret|code|password|session|stripe|invite|rsvp|referral|webhook|email/i;
const EMAIL_VALUE_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const TOKENISH_VALUE_RE = /^[A-Za-z0-9._~=-]{24,}$/;

function isSensitiveQueryValue(value: string): boolean {
  if (EMAIL_VALUE_RE.test(value) || TOKENISH_VALUE_RE.test(value)) {
    return true;
  }

  try {
    const decoded = decodeURIComponent(value);
    return EMAIL_VALUE_RE.test(decoded) || TOKENISH_VALUE_RE.test(decoded);
  } catch {
    return false;
  }
}

interface CtaClickEventPropertyInput {
  buttonText: string;
  href: string;
  section: string;
  pagePath: string;
}

const CTA_ANALYTICS_ATTRIBUTE_MAP = {
  pageFamily: "data-cta-page-family",
  buyerStage: "data-cta-buyer-stage",
  placement: "data-cta-placement",
  intent: "data-cta-intent",
  target: "data-cta-target",
} as const;

type CtaAnalyticsAttributeKey = keyof typeof CTA_ANALYTICS_ATTRIBUTE_MAP;

export function buildCtaAnalyticsAttributes(
  context?: CtaAnalyticsContext,
): Record<string, string> {
  const attributes: Record<string, string> = {
    "data-cta-button": "",
  };

  if (!context) {
    return attributes;
  }

  for (const [key, attributeName] of Object.entries(
    CTA_ANALYTICS_ATTRIBUTE_MAP,
  ) as Array<[CtaAnalyticsAttributeKey, string]>) {
    const value = context[key];
    if (value) {
      attributes[attributeName] = value;
    }
  }

  return attributes;
}

function readCtaAnalyticsAttribute(
  element: HTMLElement,
  attributeName: string,
): string | undefined {
  const ownValue = element.getAttribute(attributeName);
  if (ownValue) {
    return ownValue;
  }

  const parentWithValue = element.closest(`[${attributeName}]`);
  const inheritedValue = parentWithValue?.getAttribute(attributeName);
  return inheritedValue || undefined;
}

export function sanitizeCtaHref(href: string): string {
  if (href === "" || href.startsWith("#")) {
    return href;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:\/\//i.test(href)) {
    return "[External]";
  }

  try {
    const url = new URL(href, "https://kaiplan.app");
    for (const key of Array.from(url.searchParams.keys())) {
      const value = url.searchParams.get(key) ?? "";
      if (SENSITIVE_QUERY_KEY_RE.test(key) || isSensitiveQueryValue(value)) {
        url.searchParams.set(key, "[Filtered]");
      }
    }
    const query = url.searchParams.toString();
    return `${url.pathname}${query ? `?${query}` : ""}`;
  } catch {
    const [pathAndQuery = ""] = href.split("#", 1);
    const queryIndex = pathAndQuery.indexOf("?");
    const path =
      queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
    const query = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : "";
    if (!query) {
      return path;
    }
    const scrubbedQuery = query
      .split("&")
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        const rawKey =
          separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
        const rawValue =
          separatorIndex >= 0 ? part.slice(separatorIndex + 1) : "";
        if (
          SENSITIVE_QUERY_KEY_RE.test(rawKey) ||
          isSensitiveQueryValue(rawValue)
        ) {
          return `${rawKey}=[Filtered]`;
        }
        return part;
      })
      .join("&");
    return `${path}?${scrubbedQuery}`;
  }
}

export function getCtaAnalyticsContext(
  element: HTMLElement,
): CtaAnalyticsContext {
  return {
    pageFamily: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.pageFamily,
    ),
    buyerStage: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.buyerStage,
    ) as BuyerStage | undefined,
    placement: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.placement,
    ),
    intent: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.intent,
    ),
    target: readCtaAnalyticsAttribute(
      element,
      CTA_ANALYTICS_ATTRIBUTE_MAP.target,
    ),
  };
}

export function buildCtaClickEventProperties(
  element: HTMLElement,
  input: CtaClickEventPropertyInput,
): CtaClickEventProperties {
  const context = getCtaAnalyticsContext(element);

  return {
    button_text: input.buttonText,
    href: sanitizeCtaHref(input.href),
    section: input.section,
    page_path: input.pagePath,
    ...(context.pageFamily ? { page_family: context.pageFamily } : {}),
    ...(context.buyerStage ? { buyer_stage: context.buyerStage } : {}),
    ...(context.placement ? { placement: context.placement } : {}),
    ...(context.intent ? { intent: context.intent } : {}),
    ...(context.target ? { target: context.target } : {}),
  };
}
