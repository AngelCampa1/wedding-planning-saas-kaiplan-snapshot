import type { LeadMagnet } from "../types";

interface ResolveInput {
  pathname: string;
  knowledge: LeadMagnet[];
  hint?: string;
  explicitSlug?: string;
}

// Ordered: first match wins, so specific rules precede generic ones.
const RULES: ReadonlyArray<{ slug: string; keywords: readonly string[] }> = [
  {
    slug: "hidden-cost-calculator-worksheet",
    keywords: ["hidden cost", "hidden fee", "hidden-cost"],
  },
  { slug: "vendor-contract-review-checklist", keywords: ["contract"] },
  {
    slug: "vendor-red-flag-checklist",
    keywords: ["red flag", "red-flag", "scam"],
  },
  {
    slug: "wedding-app-comparison-scorecard",
    keywords: [
      "compare",
      "comparison",
      "/alternatives",
      "/vs/",
      "-vs-",
      "best app",
      "best-app",
      "app-comparison",
      "app comparison",
    ],
  },
  {
    slug: "seating-chart-planning-template",
    keywords: ["seating", "seat chart", "table chart"],
  },
  {
    slug: "wedding-timeline-template",
    keywords: ["timeline", "day-of", "day of", "schedule"],
  },
  {
    slug: "complete-wedding-checklist",
    keywords: [
      "checklist",
      "to-do",
      "todo",
      "plan a wedding",
      "planning steps",
    ],
  },
  {
    slug: "wedding-rsvp-tracker",
    keywords: ["rsvp", "guest list", "guest-list"],
  },
  { slug: "wedding-venue-comparison-worksheet", keywords: ["venue"] },
  {
    slug: "wedding-photography-shot-list",
    keywords: ["shot list", "shot-list", "photo list", "photography checklist"],
  },
  { slug: "wedding-vows-writing-worksheet", keywords: ["vow", "vows"] },
  { slug: "honeymoon-budget-planner", keywords: ["honeymoon"] },
  {
    slug: "pre-wedding-beauty-timeline",
    keywords: ["beauty", "hair", "makeup", "skincare"],
  },
  {
    slug: "wedding-day-coordinator-notes",
    keywords: ["coordinator", "day-of coordinator"],
  },
  {
    slug: "vendor-interview-question-list",
    keywords: [
      "vendor",
      "photographer",
      "caterer",
      "catering",
      "florist",
      "florals",
      "dj",
      "band",
      "planner",
      "officiant",
      "videographer",
    ],
  },
  {
    slug: "budget-template",
    keywords: [
      "budget",
      "cost",
      "afford",
      "price",
      "pricing",
      "spend",
      "money",
    ],
  },
];

const FALLBACK_SLUG = "budget-template";

/**
 * Match a single keyword against the haystack.
 * Plain alphanumeric keywords (no spaces, hyphens, or slashes) are matched with
 * word boundaries so short tokens like "dj" and "band" don't fire inside words
 * like "adjust" or "husband". All other keywords (with hyphens, slashes, or
 * spaces) fall back to a simple substring check.
 */
function matchesKeyword(haystack: string, keyword: string): boolean {
  if (/^[a-z0-9]+$/.test(keyword)) {
    return new RegExp(`\\b${keyword}s?\\b`).test(haystack);
  }
  return haystack.includes(keyword);
}

function bySlug(knowledge: LeadMagnet[], slug: string): LeadMagnet | undefined {
  return knowledge.find((entry) => entry.slug === slug);
}

export function resolvePageLeadMagnet(input: ResolveInput): LeadMagnet | null {
  const { pathname, knowledge, hint, explicitSlug } = input;
  if (knowledge.length === 0) return null;

  if (explicitSlug) {
    const explicit = bySlug(knowledge, explicitSlug);
    if (explicit) return explicit;
  }

  const haystack = `${pathname} ${hint ?? ""}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => matchesKeyword(haystack, keyword))) {
      const match = bySlug(knowledge, rule.slug);
      if (match) return match;
    }
  }

  const fallback = bySlug(knowledge, FALLBACK_SLUG);
  if (fallback) return fallback;
  // knowledge is non-empty (checked above), so knowledge[0] is always defined.
  return knowledge[0] as LeadMagnet;
}
