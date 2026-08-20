import {
  BILLING_FEATURE_LABELS,
  BILLING_PLAN_LABELS,
  PLAN_PRICING,
  TRIAL_DURATION_DAYS,
} from "@kaiplan/shared";
import type {
  CompetitorKnowledgeEntry,
  CtaKnowledgeEntry,
  FaqKnowledgeEntry,
  LeadMagnetKnowledgeEntry,
  NurtureStepKnowledgeEntry,
  ProductFactKnowledgeEntry,
} from "./types";

const starterPricing = PLAN_PRICING.starter;
const proPricing = PLAN_PRICING.pro;
const lifetimePricing = PLAN_PRICING.lifetime;
const trialDurationLabel = `${TRIAL_DURATION_DAYS}-day`;

function toPublicPlanPricing(
  plan: (typeof PLAN_PRICING)[keyof typeof PLAN_PRICING],
) {
  return plan;
}

export const publicPlanPricing = {
  starter: toPublicPlanPricing(PLAN_PRICING.starter),
  pro: toPublicPlanPricing(PLAN_PRICING.pro),
  lifetime: toPublicPlanPricing(PLAN_PRICING.lifetime),
} as const;

export const kaiplanPricingFacts = {
  plans: publicPlanPricing,
  lifetimePriceLabel: lifetimePricing.price.replace(" once", " lifetime"),
} as const;

export const productIdentity = {
  name: "Kaiplan",
  domain: "kaiplan.app",
  contactEmail: "hello@kaiplan.app",
  areaServed: "United States",
  tagline: "Plan Your Wedding. Actually Plan It.",
  publicPositioning:
    "Paid wedding planning workspace for couples who want budget, guests, vendors, seating, and website planning without vendor ads.",
  targetAudience: "couples planning their wedding",
} as const;

export const publicPlanLabels = {
  starter: BILLING_PLAN_LABELS.starter,
  pro: BILLING_PLAN_LABELS.pro,
  lifetime: BILLING_PLAN_LABELS.lifetime,
} as const;

export const publicFeatureLabels = {
  vendors: BILLING_FEATURE_LABELS.vendors,
  extraPlanner: BILLING_FEATURE_LABELS.extraPlanner,
  weddingWebsite: BILLING_FEATURE_LABELS.weddingWebsite,
} as const;

export const publicPlanFeatures = {
  starter: [
    `Full-app ${trialDurationLabel} free trial`,
    "Budget ledger with vendor quotes",
    "Guest list management",
    "Drag-and-drop seating chart",
    "Wedding milestone checklist",
  ],
  pro: [
    `Full-app ${trialDurationLabel} free trial`,
    "Everything in Starter",
    "Vendor contact tracker",
    "Wedding website + RSVP",
    "Invite your partner or planner - role-based access (owner / editor / viewer), separate logins, no shared passwords",
    "Wedding milestone checklist",
  ],
  lifetime: [
    "Everything in Pro",
    "Pay once - yours forever",
    "No recurring charges",
    "Archive after the wedding - data stays forever",
  ],
} as const;

export const billingCopy = {
  trialPlanHint: `Start a ${trialDurationLabel} free trial with full app access. Choose a plan later.`,
  lifetimePlanHint:
    "Pay once for Lifetime access. There are no recurring charges.",
} as const;

export const publicSiteCopy = {
  metaDescription: `Kaiplan keeps wedding budgets, guests, vendors, seating, RSVPs, and tasks in one workspace without vendor ads. Plans start at ${starterPricing.price}, or pay ${kaiplanPricingFacts.lifetimePriceLabel}.`,
  trustSignals: {
    noVendorAdvertising:
      "No vendor advertising: we earn from you, not the vendors we recommend",
    realBudgetLedger: "Real budget ledger that tracks actual vendor quotes",
    connectedPlanning: "Budget, guests, vendors, and seating in one place",
    paidPlacementCount: "vendor ads or paid placements",
  },
  checkoutSubtitle:
    "Create your account to start the free trial. Choose or confirm a plan later.",
  heroBenefits: [
    "Budget ledger that tracks real vendor quotes",
    "Guest list, RSVP, and seating in one place",
    "Wedding timeline & milestone checklist",
    "No vendor ads, we earn from you, not the vendors",
    `From ${starterPricing.price}, or ${kaiplanPricingFacts.lifetimePriceLabel}`,
  ],
  heroSubheadline: `From ${starterPricing.price}. No vendor ads. No fragmented spreadsheets. Budget, guests, vendors, and seating stay connected.`,
  pricingTrialBannerText: `Start a ${trialDurationLabel} free trial with full app access. Choose a plan later.`,
  homepageProofBody:
    "Kaiplan is a paid planning system for couples who want one place for budget, guests, vendors, and seating without sponsored vendor placements steering every decision.",
  fakeDoorPricingConfirmation:
    "You're in. Finish creating your account to start the full app trial.",
  funnelBenefitBullets: [
    `${starterPricing.price}, or ${kaiplanPricingFacts.lifetimePriceLabel}`,
    "No vendor ads or paid placements",
    "Budget, guests, vendors, and seating in one place",
  ],
} as const;

export const marketingCaptureDefaults = {
  buttonText: "Continue",
  placeholder: "your@email.com",
  footerPlaceholder: "your@inbox.com",
  emailLabel: "Email address",
  ariaLabel: "Continue with your email",
  loadingText: "Sending...",
  errorInvalidEmail: "Please enter a valid email address",
  errorGeneric: "Something went wrong. Please try again.",
  successMessage: "You're in!",
  footerDispatchHeading: "Subscribe to dispatch.",
  footerDispatchBody: "A short letter when we ship something worth reading.",
  footerDispatchCta: "Send",
} as const;

export const unsubscribeCopy = {
  footerReason: "You received this because you signed up for",
  linkLabel: "Unsubscribe",
  pageTitle: "Unsubscribed",
  confirmationHeadline: "You've been unsubscribed",
  confirmationBody: "You will no longer receive nurture emails from",
  returnLabelPrefix: "Return to",
} as const;

export const marketingEmailCopy = {
  confirmation: {
    subjectTemplate: "You're in - {productName} signup confirmed",
    headlineTemplate: "Welcome to {productName}!",
    positionPrefix: "Your signup position is",
    positionSuffix: "Your trial is ready.",
    surveyPrompt: "Help us build the right thing - answer 3 quick questions:",
    primaryCtaLabel: "Take the 30-second survey",
    productLinkTemplate: "See what's in {productName}",
    referralHeading: "Extend your trial",
    referralPrompt:
      "Share your link - every referral adds free days to your trial:",
    referralCodeLabel: "Your referral code:",
    calendarPrompt: "Want to shape the product? Book a 15-minute call:",
    calendarCtaLabel: "Schedule a call",
  },
  leadMagnetDelivery: {
    subjectTemplate: "Your {leadMagnetTitle} is ready - {productName}",
    headlineTemplate: "Your {leadMagnetTitle} is ready",
    positionPrefix: "Your signup position is",
    positionSuffix: "Access your resource anytime using the link below.",
    primaryCtaLabel: "Download your PDF",
    secondaryCtaLabel: "Read online",
    referralHeading: "Extend your trial",
    referralPrompt:
      "Share your link - every referral adds free days to your trial:",
    referralCodeLabel: "Your referral code:",
  },
  surveyReminder: {
    subjectTemplate: "Quick question from {productName}",
    headline: "Quick favor?",
    bodyTemplate:
      "We'd love 30 seconds of your time. Your answers help us build {productName} for people like you.",
    primaryCtaLabel: "Answer 3 questions",
    permissionTemplate:
      "You recently signed up for {productName}. If you'd rather not hear from us, just ignore this email - we won't send another.",
  },
} as const;

export const leadMagnetKnowledge: LeadMagnetKnowledgeEntry[] = [
  {
    slug: "budget-template",
    title: "Free Wedding Budget Template: Quote, Deposit, Balance Tracker",
    description:
      "Track quotes, deposits, balances, payment status, and real vendor totals in one workbook.",
  },
  {
    slug: "hidden-cost-calculator-worksheet",
    title: "Free Hidden Wedding Cost Calculator Worksheet",
    description:
      "Find the fees, gratuities, rentals, taxes, and service charges that quietly push budgets over plan.",
  },
  {
    slug: "vendor-interview-question-list",
    title: "Free Wedding Vendor Interview Questions (All Categories)",
    description:
      "Ask sharper questions before you book photographers, caterers, venues, DJs, planners, and more.",
  },
  {
    slug: "vendor-red-flag-checklist",
    title: "Free Wedding Vendor Red Flag Checklist",
    description:
      "Spot risky contract, communication, pricing, review, and availability patterns before signing.",
  },
  {
    slug: "wedding-app-comparison-scorecard",
    title: "Free Wedding Planning App Comparison Scorecard",
    description:
      "Compare planning apps across budget, guests, seating, vendor tracking, websites, ads, and pricing.",
  },
  {
    slug: "wedding-timeline-template",
    title: "Free Wedding Day Timeline Template (Downloadable)",
    description:
      "Map ceremony, vendor arrival, hair and makeup, photos, reception, speeches, and teardown timing.",
  },
  {
    slug: "complete-wedding-checklist",
    title:
      "Complete Wedding Planning Checklist: Month-by-Month From Engagement to Wedding Day",
    description:
      "A month-by-month wedding checklist covering every task from engagement through wedding day, organized with checkboxes, timing guidance, and notes fields for each phase.",
  },
  {
    slug: "honeymoon-budget-planner",
    title:
      "Honeymoon Budget Planner: Category Breakdown, Cost Ranges, and Budget Ledger",
    description:
      "A honeymoon planning worksheet covering budget categories, per-destination cost estimates, travel insurance checklist, credit card points strategy, and a full budget ledger template.",
  },
  {
    slug: "pre-wedding-beauty-timeline",
    title:
      "Pre-Wedding Beauty Timeline: Hair, Makeup, and Getting-Ready Schedule",
    description:
      "A day-before and day-of beauty timeline for weddings, covering how to schedule hair and makeup for the full party, what to bring, and a blank 30-minute increment schedule template.",
  },
  {
    slug: "seating-chart-planning-template",
    title:
      "Wedding Seating Chart Planning Template: Tables, Groups, and Conflict Guide",
    description:
      "A worksheet for planning your wedding seating chart, including table layout options, guest grouping strategies, handling divorced parents, and a blank table template for every seat.",
  },
  {
    slug: "vendor-contract-review-checklist",
    title:
      "Wedding Vendor Contract Review Checklist: What to Check Before You Sign",
    description:
      "A clause-by-clause checklist for reviewing wedding vendor contracts before signing, covering payment terms, deliverables, cancellation refunds, substitution policy, and more.",
  },
  {
    slug: "wedding-photography-shot-list",
    title:
      "Wedding Photography Shot List Template (Print and Give to Your Photographer)",
    description:
      "A complete wedding shot list template covering getting ready, ceremony, family formals, wedding party, portraits, and reception with timing estimates for each section.",
  },
  {
    slug: "wedding-rsvp-tracker",
    title: "Wedding RSVP Tracker: Guest List Template with Follow-Up Strategy",
    description:
      "An RSVP tracking template with columns for every guest detail, a follow-up timeline for late responses, headcount submission guidance, and a summary count section.",
  },
  {
    slug: "wedding-venue-comparison-worksheet",
    title:
      "Wedding Venue Comparison Worksheet: Score Up to 5 Venues Side by Side",
    description:
      "A structured worksheet for comparing up to 5 wedding venues across 20+ criteria including catering policy, cancellation terms, noise curfews, and payment schedules.",
  },
  {
    slug: "wedding-vows-writing-worksheet",
    title:
      "Wedding Vows Writing Worksheet: Prompts, Structure, and Word Count Guide",
    description:
      "A worksheet guiding couples through writing personal wedding vows with reflection prompts, structure guidance, a word-count pacing guide, and tips for delivery on the day.",
  },
  {
    slug: "wedding-day-coordinator-notes",
    title:
      "Wedding Day Coordinator Notes: Timeline, Vendor Contacts, and Troubleshooting Guide",
    description:
      "A day-of coordinator notes template covering the vendor contact sheet, day-of timeline, emergency contacts, venue access instructions, and a troubleshooting guide for common problems.",
  },
].map((entry) => ({
  id: `marketing.lead-magnet.${entry.slug}`,
  domain: "marketing",
  audience: "public",
  consumers: ["marketing-pages", "marketing-email", "marketing-automation"],
  source: "canonical-kb",
  publicPath: `/free/${entry.slug}`,
  nurtureSequenceId: "kaiplan-lead-magnet-nurture",
  ...entry,
}));

function nurtureStep(
  sequenceId: string,
  stepIndex: 1 | 2 | 3 | 4,
  subject: string,
  headline: string,
  primaryCtaLabel: string,
  postScript: string,
): NurtureStepKnowledgeEntry {
  return {
    id: `marketing.nurture.${sequenceId}.${stepIndex}`,
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-email", "marketing-automation"],
    source: "canonical-kb",
    sequenceId,
    stepIndex,
    subject,
    headline,
    intro: subject,
    blocks: [{ kind: "p", text: subject }],
    primaryCtaLabel,
    postScript,
  };
}

export const nurtureSequences = leadMagnetKnowledge.map((leadMagnet) => ({
  id: leadMagnet.nurtureSequenceId,
  leadMagnetSlug: leadMagnet.slug,
  steps: [
    nurtureStep(
      leadMagnet.slug,
      1,
      `A planning note for ${leadMagnet.title}`,
      `Use your ${leadMagnet.title}`,
      "Re-open the resource",
      "Keep the resource nearby while you compare real wedding decisions.",
    ),
    nurtureStep(
      leadMagnet.slug,
      2,
      `What couples usually miss after downloading ${leadMagnet.title}`,
      "The part that usually gets missed",
      "Review the resource",
      "The next email shows how Kaiplan turns this worksheet into a live workflow.",
    ),
    nurtureStep(
      leadMagnet.slug,
      3,
      `How Kaiplan supports ${leadMagnet.title}`,
      "How Kaiplan turns this into a workflow",
      "See the feature tour",
      "Last email is the trial invitation if you want to try this in Kaiplan.",
    ),
    nurtureStep(
      leadMagnet.slug,
      4,
      `Start your Kaiplan trial with ${leadMagnet.title}`,
      "Start your Kaiplan trial",
      "Start your Kaiplan trial",
      "Your referral link extends your trial when another couple signs up.",
    ),
  ],
}));

export const marketingProductFacts: ProductFactKnowledgeEntry[] = [
  {
    id: "marketing.product.category",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    label: "Product category",
    value: "wedding planning",
  },
  {
    id: "marketing.product.positioning",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    label: "Positioning",
    value:
      "Paid wedding planning workspace for couples who want budget, guests, vendors, seating, and website planning without vendor ads.",
  },
  {
    id: "marketing.product.starting-price",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    label: "Starting price",
    value: starterPricing.price,
  },
];

export const marketingCtas = {
  publicSignup: {
    id: "marketing.cta.public-signup",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    text: "Start free trial",
    target: "/#pricing",
    message: "Start the full app trial now and choose a plan later.",
  },
  tofu: {
    id: "marketing.cta.tofu",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    text: "Start free trial",
    target: "/#pricing",
  },
  mofu: {
    id: "marketing.cta.mofu",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    text: "Start free trial",
    target: "/#pricing",
  },
} as const satisfies Record<string, CtaKnowledgeEntry>;

export const marketingCompetitors: CompetitorKnowledgeEntry[] = [
  {
    id: "marketing.competitor.the-knot",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "the-knot",
    name: "The Knot",
    pricing: "Free (vendor-funded)",
    weakness:
      "Vendor recommendations are influenced by paid placement and marketplace incentives",
  },
  {
    id: "marketing.competitor.weddingwire",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "weddingwire",
    name: "WeddingWire",
    pricing: "Free (vendor-funded)",
    weakness: "Same parent company as The Knot; identical ad-funded model",
  },
  {
    id: "marketing.competitor.zola",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "zola",
    name: "Zola",
    pricing: "Free (registry commissions)",
    weakness: "Registry-first product; planning tools are secondary",
  },
  {
    id: "marketing.competitor.joy",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "joy",
    name: "Joy (WithJoy)",
    pricing: "Free",
    weakness: "No real budget tools; website and RSVP only",
  },
  {
    id: "marketing.competitor.aisle-planner",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "aisle-planner",
    name: "Aisle Planner",
    pricing: "$29-$129/mo",
    weakness: "Built for professional wedding planners, not couples",
  },
  {
    id: "marketing.competitor.bridebook",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "bridebook",
    name: "Bridebook",
    pricing: "Free (vendor-funded)",
    weakness: "UK-centric product; US expansion is shallow",
  },
  {
    id: "marketing.competitor.hitchd",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "hitchd",
    name: "Hitchd",
    pricing: "Free (transaction fees)",
    weakness: "Registry-only; no planning, budget, or seating tools",
  },
  {
    id: "marketing.competitor.appy-couple",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "appy-couple",
    name: "Appy Couple",
    pricing: "$29-$49 one-time",
    weakness: "Guest communication only; no budget ledger or seating chart",
  },
  {
    id: "marketing.competitor.minted",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "minted",
    name: "Minted",
    pricing: "Free website builder",
    weakness:
      "Stationery e-commerce with a website builder; not a planning tool",
  },
  {
    id: "marketing.competitor.planning-pod",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    slug: "planning-pod",
    name: "Planning Pod",
    pricing: "$49-$149/mo",
    weakness: "Built for venue and event professionals, not couples",
  },
];

export const marketingFaqs: FaqKnowledgeEntry[] = [
  {
    id: "marketing.faq.what-is-kaiplan",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    question: "What is Kaiplan?",
    answer: `Kaiplan is a wedding planning tool we built because we kept seeing couples juggle six or more apps to manage their budget, guest list, vendors, and seating, while The Knot and WeddingWire pushed paid vendor listings at them. Kaiplan puts budget, guests, vendors, and seating in one place. Plans start at ${starterPricing.price}, or pay ${lifetimePricing.price} for lifetime access. We don't earn from vendor referrals.`,
  },
  {
    id: "marketing.faq.the-knot-difference",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    question: "How is Kaiplan different from The Knot?",
    answer:
      "The Knot and WeddingWire are marketplace platforms. Vendors can pay for extra visibility, which means the platforms are balancing couple experience with vendor revenue. Kaiplan earns its revenue directly from couples, so there is no financial incentive to push a paid listing over a better fit. Every recommendation you track in Kaiplan comes from your own research, not an ad buy.",
  },
  {
    id: "marketing.faq.monthly-vs-lifetime",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    question: "What's the difference between the monthly plan and Lifetime?",
    answer: `Starter (${starterPricing.price}) and Pro (${proPricing.price}) are month-to-month subscriptions you can choose after the full-app trial. The Lifetime tier is ${lifetimePricing.price} and includes everything in Pro with no recurring charges and no expiry.`,
  },
  {
    id: "marketing.faq.live-status",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    question: "Is Kaiplan live yet?",
    answer:
      "Yes. Kaiplan is live now. Create your account to start the full app trial, then choose or confirm a plan later when you're ready to keep your budget, guest list, vendors, and seating in one workspace.",
  },
  {
    id: "marketing.faq.starter-included",
    domain: "marketing",
    audience: "public",
    consumers: ["marketing-pages", "marketing-automation"],
    source: "canonical-kb",
    question: "What's included in the Starter plan?",
    answer: `The Starter plan (${starterPricing.price}) includes a budget ledger that tracks real vendor quotes, guest list management, and a drag-and-drop seating chart. The Pro plan (${proPricing.price}) adds a vendor contact tracker, a wedding website with RSVP, and role-based team access (invite your partner or planner with owner, editor, or viewer roles). The Lifetime tier (${lifetimePricing.price}) includes everything in Pro - your data stays forever, and you can archive the wedding once it's done.`,
  },
];

export function toMarketingFaqItems() {
  return marketingFaqs.map(({ question, answer }) => ({
    q: question,
    a: answer,
  }));
}
