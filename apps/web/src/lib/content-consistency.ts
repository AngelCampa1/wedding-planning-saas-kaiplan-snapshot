import { PLAN_PRICING, TRIAL_DURATION_DAYS } from "@kaiplan/shared";

export interface ContentConsistencyFile {
  relativePath: string;
  contents: string;
}

export interface ContentConsistencyIssue {
  relativePath: string;
  message: string;
}

function priceLabel(amount: string, suffix = "") {
  return `$${amount}${suffix}`;
}

function staleMonthlyPricePattern(
  amount: string,
  planTerms: readonly string[],
): RegExp {
  const planAlternation = planTerms.join("|");
  return new RegExp(
    `(?:${planAlternation})[\\s\\S]{0,80}\\$${amount.replace(
      ".",
      "\\.",
    )}\\/mo\\b|\\$${amount.replace(
      ".",
      "\\.",
    )}\\/mo\\b[\\s\\S]{0,80}(?:${planAlternation})`,
  );
}

function staleLifetimePricePattern(amount: string): RegExp {
  const lifetimeTerms =
    "Kaiplan|lifetime access|Lifetime tier|Lifetime plan|Lifetime option";
  const amountPattern = `\\$${amount}(?![\\d,]|\\s*[-–—]|\\/(?:mo|month|yr|year))\\b`;
  return new RegExp(
    `(?:${lifetimeTerms})[\\s\\S]{0,80}${amountPattern}|${amountPattern}[\\s\\S]{0,80}(?:${lifetimeTerms})`,
  );
}

const STALE_PRICING_PATTERNS = [
  {
    pattern: staleLifetimePricePattern("79"),
    label: priceLabel("79"),
  },
  {
    pattern: staleMonthlyPricePattern("10", ["Kaiplan", "Starter", "starter"]),
    label: priceLabel("10", "/mo"),
  },
  {
    pattern: staleMonthlyPricePattern("17.50", ["Kaiplan", "Pro", "pro"]),
    label: priceLabel("17.50", "/mo"),
  },
  {
    pattern: staleLifetimePricePattern("50"),
    label: priceLabel("50"),
  },
];
const OFF_BRAND_PHRASES = ["Answers for teams evaluating the fit"];
const STALE_PRODUCT_STATE_PATTERNS = [
  {
    pattern: /coming in the Pro tier/i,
    label: "coming in the Pro tier",
  },
  {
    pattern:
      /(?:Kaiplan|vendor management|vendor tracker)[\s\S]{0,120}not built yet|not built yet[\s\S]{0,120}(?:Kaiplan|vendor management|vendor tracker)/i,
    label: "not built yet",
  },
  {
    pattern: /(?:Kaiplan(?:'s)?\s+free tier|Kaiplan offers a free tier)/i,
    label: "Kaiplan free tier",
  },
];
const STALE_LAUNCH_PATTERNS = [
  { pattern: /choose your plan/i, label: "choose your plan" },
  { pattern: /choose the plan/i, label: "choose the plan" },
  { pattern: /pick a plan/i, label: "pick a plan" },
  { pattern: /card required/i, label: "card required" },
  { pattern: /requires a card/i, label: "requires a card" },
  {
    pattern: /continue into checkout/i,
    label: "continue into checkout",
  },
  {
    pattern: /Start your 1-month free trial/,
    label: "Start your 1-month free trial",
  },
  { pattern: /Try free for 30 days/, label: "Try free for 30 days" },
  {
    pattern: /Get 14 extra days on your free trial/,
    label: "Get 14 extra days on your free trial",
  },
  { pattern: /\baccount is ready\b/, label: "account is ready" },
  { pattern: /starting a free trial/, label: "starting a free trial" },
  { pattern: /Your free trial/, label: "Your free trial" },
  { pattern: /join waitlist/i, label: "join waitlist" },
  { pattern: /waitlist cohort/i, label: "waitlist cohort" },
];

const CANONICAL_PLAN_PRICE_PATTERNS = [
  {
    plan: "starter",
    label: "Starter",
    canonicalAmounts: [
      PLAN_PRICING.starter.monthlyPriceCents / 100,
      PLAN_PRICING.starter.annualPriceCents / 100,
    ],
    pattern:
      /\b(?:Kaiplan\s+)?Starter(?:\s+plan|\s+tier)?(?:[ \t]+(?:starts at|begins at|is|at|costs))?[ \t]*(?::|[;-])?[ \t]*\$(\d+(?:\.\d{1,2})?)/gi,
    reversePattern:
      /\$(\d+(?:\.\d{1,2})?)(?:\/(?:mo|month|yr|year)|[ \t]*(?:per|a)[ \t]+(?:month|year))?[ \t]+(?:on|for|as)[ \t]+(?:the[ \t]+)?Starter[ \t]+plan\b/gi,
    parentheticalPattern:
      /\$(\d+(?:\.\d{1,2})?)(?:\/(?:mo|month|yr|year)|[ \t]*(?:per|a)[ \t]+(?:month|year))?[ \t]*\((?:Kaiplan\s+)?Starter\)/gi,
    proximityPattern:
      /\b(?:Kaiplan\s+)?Starter\b[ \t]*(?:\(|:|[–—-]|\|)[^\n$]{0,24}\$(\d+(?:\.\d{1,2})?)(?:\/(?:mo|month|yr|year)|[ \t]*(?:per|a)[ \t]+(?:month|year))/gi,
  },
  {
    plan: "pro",
    label: "Pro",
    canonicalAmounts: [
      PLAN_PRICING.pro.monthlyPriceCents / 100,
      PLAN_PRICING.pro.annualPriceCents / 100,
    ],
    pattern:
      /\b(?:Kaiplan\s+)?Pro(?:\s+plan|\s+tier)?(?:[ \t]+(?:starts at|begins at|is|at|costs))?[ \t]*(?::|[;-])?[ \t]*\$(\d+(?:\.\d{1,2})?)/gi,
    reversePattern:
      /\$(\d+(?:\.\d{1,2})?)(?:\/(?:mo|month|yr|year)|[ \t]*(?:per|a)[ \t]+(?:month|year))?[ \t]+(?:on|for|as)[ \t]+Pro\b/gi,
    parentheticalPattern:
      /\$(\d+(?:\.\d{1,2})?)(?:\/(?:mo|month|yr|year)|[ \t]*(?:per|a)[ \t]+(?:month|year))?[ \t]*\((?:Kaiplan\s+)?Pro\)/gi,
    proximityPattern:
      /\b(?:Kaiplan\s+)?Pro\b[ \t]*(?:\(|:|[–—-]|\|)[^\n$]{0,24}\$(\d+(?:\.\d{1,2})?)(?:\/(?:mo|month|yr|year)|[ \t]*(?:per|a)[ \t]+(?:month|year))/gi,
  },
  {
    plan: "lifetime",
    label: "Lifetime",
    canonicalAmounts: [PLAN_PRICING.lifetime.oneTimePriceCents / 100],
    pattern:
      /\b(?:Kaiplan\s+)?Lifetime(?:\s+plan|\s+tier|\s+option)?(?:[ \t]+(?:starts at|begins at|is|at|costs))?[ \t]*(?::|[;-])?[ \t]*\$(\d+(?:\.\d{1,2})?)/gi,
    reversePattern:
      /\$(\d+(?:\.\d{1,2})?)(?:[ \t]+(?:one-time|once|as))?[ \t]+(?:on|for|as)?[ \t]*(?:a[ \t]+)?(?:lifetime|Lifetime)[ \t]+(?:plan|tier|option)?\b/gi,
    parentheticalPattern:
      /\$(\d+(?:\.\d{1,2})?)(?:[ \t]+(?:one-time|once|as))?[ \t]*\((?:Kaiplan\s+)?Lifetime\)/gi,
    proximityPattern:
      /\b(?:Kaiplan\s+)?Lifetime\b[ \t]*(?:\(|:|[–—-]|\|)[^\n$]{0,24}\$(\d+(?:\.\d{1,2})?)(?:[ \t]*(?:once|one-time|lifetime))?/gi,
  },
] as const;

const STARTER_MONTHLY_AMOUNT = PLAN_PRICING.starter.monthlyPriceCents / 100;
const PRO_MONTHLY_AMOUNT = PLAN_PRICING.pro.monthlyPriceCents / 100;

const KAIPLAN_STARTING_PRICE_PATTERNS = [
  /\bKaiplan\b[^\n.]{0,120}\bstarts?\s+at\s+\$(\d+(?:\.\d{1,2})?)/gi,
  /\bPlans?\s+start\s+at\s+\$(\d+(?:\.\d{1,2})?)[^\n.]{0,120}\b(?:Kaiplan|lifetime access)\b/gi,
  /\bKaiplan\b[^\n.]{0,120}\bPlans?\s+start\s+at\s+\$(\d+(?:\.\d{1,2})?)/gi,
] as const;

const KAIPLAN_MONTHLY_RANGE_PATTERNS = [
  /\bKaiplan\b[^\n.]{0,160}\$(\d+(?:\.\d{1,2})?)\/(?:mo|month)\s+(?:and|to|through|-)\s+\$(\d+(?:\.\d{1,2})?)\/(?:mo|month)/gi,
  /\bKaiplan\b[^\n.]{0,160}\$(\d+(?:\.\d{1,2})?)\s*-\s*\$(\d+(?:\.\d{1,2})?)\/(?:mo|month)/gi,
] as const;

const CANONICAL_TRIAL_DURATION_PATTERN =
  /(?:Kaiplan|New accounts|Starter|Pro)[\s\S]{0,120}\b(\d+)-day free trial\b|\b(\d+)-day free trial\b[\s\S]{0,120}(?:Kaiplan|Starter|Pro|full app access)/gi;

const PRIVACY_PROCESSORS = [
  "Stripe",
  "Resend",
  "Neon",
  "Apollo.io",
  "Cloudflare",
];

export function auditPrivacyConsistency(
  files: ContentConsistencyFile[],
): ContentConsistencyIssue[] {
  const issues: ContentConsistencyIssue[] = [];
  const privacyFile = files.find((f) => f.relativePath.includes("privacy"));
  if (!privacyFile) return issues;

  for (const processor of PRIVACY_PROCESSORS) {
    if (!privacyFile.contents.includes(processor)) {
      issues.push({
        relativePath: privacyFile.relativePath,
        message: `Privacy policy should mention third-party processor: ${processor}`,
      });
    }
  }
  return issues;
}

export function auditKaiplanContentConsistency(
  files: ContentConsistencyFile[],
): ContentConsistencyIssue[] {
  const issues: ContentConsistencyIssue[] = [];
  const seenIssues = new Set<string>();

  function pushIssue(issue: ContentConsistencyIssue) {
    const issueKey = `${issue.relativePath}\0${issue.message}`;
    if (!seenIssues.has(issueKey)) {
      seenIssues.add(issueKey);
      issues.push(issue);
    }
  }

  for (const file of files) {
    for (const pricePattern of CANONICAL_PLAN_PRICE_PATTERNS) {
      const matches = [
        ...file.contents.matchAll(pricePattern.pattern),
        ...file.contents.matchAll(pricePattern.reversePattern),
        ...file.contents.matchAll(pricePattern.parentheticalPattern),
        ...file.contents.matchAll(pricePattern.proximityPattern),
      ];
      for (const match of matches) {
        const amount = Number(match[1]);
        if (!pricePattern.canonicalAmounts.includes(amount)) {
          pushIssue({
            relativePath: file.relativePath,
            message: `Found noncanonical Kaiplan ${pricePattern.label} price: $${match[1]}`,
          });
        }
      }
    }

    for (const startingPricePattern of KAIPLAN_STARTING_PRICE_PATTERNS) {
      for (const match of file.contents.matchAll(startingPricePattern)) {
        const amount = Number(match[1]);
        if (amount !== STARTER_MONTHLY_AMOUNT) {
          pushIssue({
            relativePath: file.relativePath,
            message: `Found noncanonical Kaiplan starting price: $${match[1]}`,
          });
        }
      }
    }

    for (const monthlyRangePattern of KAIPLAN_MONTHLY_RANGE_PATTERNS) {
      for (const match of file.contents.matchAll(monthlyRangePattern)) {
        const starterAmount = Number(match[1]);
        const proAmount = Number(match[2]);

        if (starterAmount !== STARTER_MONTHLY_AMOUNT) {
          pushIssue({
            relativePath: file.relativePath,
            message: `Found noncanonical Kaiplan monthly range Starter price: $${match[1]}`,
          });
        }

        if (proAmount !== PRO_MONTHLY_AMOUNT) {
          pushIssue({
            relativePath: file.relativePath,
            message: `Found noncanonical Kaiplan monthly range Pro price: $${match[2]}`,
          });
        }
      }
    }

    for (const match of file.contents.matchAll(
      CANONICAL_TRIAL_DURATION_PATTERN,
    )) {
      const days = Number(match[1] ?? match[2]);
      if (days !== TRIAL_DURATION_DAYS) {
        pushIssue({
          relativePath: file.relativePath,
          message: `Found noncanonical Kaiplan trial length: ${days}-day`,
        });
      }
    }

    for (const pricingPattern of STALE_PRICING_PATTERNS) {
      if (pricingPattern.pattern.test(file.contents)) {
        pushIssue({
          relativePath: file.relativePath,
          message: `Found stale Kaiplan pricing language: ${pricingPattern.label}`,
        });
      }
    }

    for (const phrase of OFF_BRAND_PHRASES) {
      if (file.contents.includes(phrase)) {
        pushIssue({
          relativePath: file.relativePath,
          message: `Found off-brand B2B language: ${phrase}`,
        });
      }
    }

    for (const pattern of STALE_PRODUCT_STATE_PATTERNS) {
      if (pattern.pattern.test(file.contents)) {
        pushIssue({
          relativePath: file.relativePath,
          message: `Found stale product-state copy: ${pattern.label}`,
        });
      }
    }

    for (const pattern of STALE_LAUNCH_PATTERNS) {
      if (pattern.pattern.test(file.contents)) {
        pushIssue({
          relativePath: file.relativePath,
          message: `Found stale launch-state copy: ${pattern.label}`,
        });
      }
    }
  }

  return issues;
}
