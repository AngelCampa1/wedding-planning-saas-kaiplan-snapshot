import type { SiteConfig } from "@kaiplan/marketing";
import {
  leadMagnetKnowledge,
  marketingCompetitors,
  marketingCtas,
  productIdentity,
  publicSiteCopy,
  toMarketingFaqItems,
} from "@kaiplan/knowledge/marketing";
import { kaiplanOffering } from "@kaiplan/knowledge";
import type { ImageMetadata } from "astro";
import { buildAppLoginUrl, buildAppSignupUrl } from "@/lib/app-links";
import ledgerScreenshot from "@/assets/screenshots/ledger.png";
import guestsScreenshot from "@/assets/screenshots/guests.png";
import seatingScreenshot from "@/assets/screenshots/seating.png";
import vendorsScreenshot from "@/assets/screenshots/vendors.png";

export type ScreenshotEntry = {
  src: ImageMetadata;
  alt: string;
  caption: string;
  feature: string;
};

const starterPricing = kaiplanOffering.plans.starter;
const lifetimePriceLabel = kaiplanOffering.copy.lifetimePriceLabel;

export const siteConfig = {
  name: productIdentity.name,
  domain: productIdentity.domain,
  defaultOgImage: "/og-default.png",
  metaDescription: publicSiteCopy.metaDescription,
  contactEmail: productIdentity.contactEmail,
  areaServed: productIdentity.areaServed,
  tagline: productIdentity.tagline,
  author: {
    name: "Angel Campa",
    jobTitle: "Kaiplan founder",
    credentials:
      "Builds wedding planning software focused on budgeting, guest workflows, and vendor-neutral planning.",
    url: "https://kaiplan.app/about/",
  },

  logo: {
    light: "/logo-light.svg",
    dark: "/logo-dark.svg",
  },

  theme: {
    // Editorial overhaul (Wave 0): Cream / Ink / Terracotta replaces sage / gold.
    // `primary` becomes the single hot accent (Terracotta). `accent` is the
    // supporting moss tone reserved for select editorial moments.
    primary: "#B0432A",
    accent: "#3A4A2C",
    surface: "#F5F1EA",
    text: "#171311",
    muted: "#3D3530",
    fonts: {
      heading: "Instrument Serif",
      body: "Geist",
      mono: "Geist Mono",
    },
  },

  product: {
    category: "wedding planning",
    price: starterPricing.price,
    targetAudience: productIdentity.targetAudience,
    trustSignals: [
      {
        text: publicSiteCopy.trustSignals.noVendorAdvertising,
        category: "compliance",
      },
      {
        text: `Starts at ${starterPricing.price}, or ${lifetimePriceLabel}`,
        category: "roi",
      },
      {
        text: publicSiteCopy.trustSignals.realBudgetLedger,
        category: "feature",
      },
      {
        text: publicSiteCopy.trustSignals.connectedPlanning,
        category: "feature",
      },
    ],
  },

  competitors: marketingCompetitors.map(
    ({ slug, name, pricing, weakness }) => ({
      slug,
      name,
      pricing,
      weakness,
    }),
  ),

  funnel: {
    tofu: {
      ctaMode: "educate",
      ctaText: marketingCtas.tofu.text,
      ctaTarget: marketingCtas.tofu.target,
    },
    mofu: {
      ctaMode: "evaluate",
      ctaText: marketingCtas.mofu.text,
      ctaTarget: marketingCtas.mofu.target,
    },
    bofu: {
      ctaMode: "convert",
      ctaText: "Start planning",
      ctaTarget: buildAppSignupUrl(),
    },
    ctaSubtitle: publicSiteCopy.checkoutSubtitle,
  },

  survey: {
    questions: [
      {
        id: "planner",
        text: "Who's planning the wedding?",
        options: [
          "Just me",
          "Me and my partner",
          "With a professional wedding planner",
        ],
      },
      {
        id: "current_tool",
        text: "What are you using now?",
        options: [
          "The Knot or WeddingWire",
          "Google Sheets or Airtable",
          "Nothing yet",
          "Multiple different apps",
        ],
      },
      {
        id: "pain",
        text: "What's your biggest headache?",
        options: [
          "Budget keeps changing unexpectedly",
          "Vendor recommendations feel biased",
          "My tools don't talk to each other",
          "I'm using 4+ tools that don't talk to each other",
        ],
      },
    ],
  },

  faqs: toMarketingFaqItems(),

  problemAgitation: {
    heading: "Still juggling six apps to plan your wedding?",
    closingLine: "Here's how Kaiplan fixes it.",
    painPoints: [
      "The Knot and WeddingWire earn from the vendors they recommend. Their 'best vendor' lists are paid placements.",
      "Most couples end up juggling 3 to 6 tools: one for budget, one for RSVP, one for seating, one for vendors.",
      "74% of newly married couples go over their originally expected budget. Rough planning estimates and hidden fees make those overruns harder to catch early.",
    ],
  },

  referral: {
    enabled: true,
    rewards: [
      { threshold: 1, description: "Unlock the vendor shortlisting worksheet" },
      { threshold: 3, description: "Free lifetime access" },
    ],
  },

  leadMagnet: leadMagnetKnowledge
    .filter((leadMagnet) => leadMagnet.slug === "budget-template")
    .map(({ title, description, slug }) => ({
      title,
      description,
      slug,
    }))[0],

  leadMagnetOptions: leadMagnetKnowledge.map(
    ({ title, description, slug }) => ({
      title,
      description,
      slug,
    }),
  ),

  exitPopup: { enabled: true },

  socialProof: [
    {
      icon: "star",
      value: "$34,200",
      label: "average US wedding cost (The Knot 2026)",
    },
    {
      icon: "shield",
      value: starterPricing.price.replace("/mo", ""),
      label: `starting monthly price, or ${lifetimePriceLabel}`,
    },
    {
      icon: "check",
      value: "0",
      label: publicSiteCopy.trustSignals.paidPlacementCount,
    },
    {
      icon: "users",
      value: "74%",
      label:
        "of newly married couples went over their original budget (Zola First Look 2025)",
    },
  ],

  heroBenefits: [...publicSiteCopy.heroBenefits],

  heroCopy: {
    subheadline: publicSiteCopy.heroSubheadline,
  },

  pricingConfig: {
    trialBannerText: publicSiteCopy.pricingTrialBannerText,
  },

  pricingTiers: (["starter", "pro", "lifetime"] as const).map((key) => {
    const plan = kaiplanOffering.plans[key];
    return {
      name: plan.name,
      price: plan.price,
      monthlyPriceCents: plan.monthlyPriceCents,
      annualPriceCents: plan.annualPriceCents,
      annualPriceOverride: plan.annualPrice,
      highlighted: plan.highlighted,
      features: [...plan.features],
      ctaText: plan.ctaTextMarketing,
      ...(plan.pricingModel === "one-time"
        ? { pricingModel: "one-time" as const }
        : {}),
    };
  }),

  nav: {
    items: [
      { label: "Features", href: "/features/" },
      {
        label: "Resources",
        href: "/resources/",
        megaMenu: {
          groups: [
            {
              heading: "Directories",
              links: [
                {
                  label: "Resource Library",
                  href: "/resources/",
                  description: "All hubs, guides, comparisons, and templates.",
                },
                {
                  label: "All Planning Guides",
                  href: "/resources/guides/",
                  description: "The complete guide collection.",
                },
                {
                  label: "Best Apps & Tools",
                  href: "/resources/best/",
                  description: "Ranked shortlist collection.",
                },
              ],
            },
            {
              heading: "Planning Hubs",
              links: [
                {
                  label: "Wedding Budget",
                  href: "/resources/wedding-budget/",
                  description: "Budget tracking, templates, and tools.",
                },
                {
                  label: "Wedding Costs",
                  href: "/resources/wedding-costs/",
                  description: "Cost guides, pricing, and hidden fees.",
                },
                {
                  label: "Wedding Vendors",
                  href: "/resources/wedding-vendors/",
                  description: "Vendor research, quotes, and contracts.",
                },
                {
                  label: "Guests, RSVP & Seating",
                  href: "/resources/guest-list-rsvp-seating/",
                  description: "Guest lists, RSVPs, invites, and seating.",
                },
                {
                  label: "Timeline & Checklist",
                  href: "/resources/timeline-checklist/",
                  description: "Checklist and schedule resources.",
                },
                {
                  label: "Websites & Registry",
                  href: "/resources/wedding-websites-registry/",
                  description: "Wedding websites, RSVPs, and registries.",
                },
                {
                  label: "Planning Tools",
                  href: "/resources/wedding-planning-tools/",
                  description: "Apps, alternatives, comparisons, and pricing.",
                },
              ],
            },
            {
              heading: "Compare & Tools",
              links: [
                {
                  label: "Alternatives",
                  href: "/compare/alternatives/",
                  description: "Kaiplan vs the big wedding apps.",
                },
                {
                  label: "Versus Pages",
                  href: "/compare/versus/",
                  description: "Head-to-head feature comparisons.",
                },
                {
                  label: "Pricing Breakdowns",
                  href: "/compare/pricing/",
                  description: "What wedding planning software really costs.",
                },
                {
                  label: "Templates",
                  href: "/templates/",
                  description: "Downloadable worksheets and scorecards.",
                },
              ],
            },
          ],
        },
      },
      { label: "Pricing", href: "/pricing/" },
      { label: "Compare", href: "/compare/" },
      { label: "About", href: "/about/" },
      { label: "Sign in", href: buildAppLoginUrl() },
    ],
  },

  footer: {
    linkGroups: [
      {
        heading: "Compare",
        links: [
          { label: "Alternatives", href: "/compare/alternatives/" },
          { label: "Comparisons", href: "/compare/versus/" },
          { label: "Pricing", href: "/compare/pricing/" },
        ],
      },
      {
        heading: "Resources",
        links: [
          { label: "Resource Library", href: "/resources/" },
          { label: "Planning Guides", href: "/resources/guides/" },
          { label: "Best Apps", href: "/resources/best/" },
          { label: "Free Templates", href: "/templates/" },
          {
            label: "Free Budget Template",
            href: "/free/budget-template/",
          },
          { label: "Product Help", href: "/help/" },
        ],
      },
      {
        heading: "Product",
        links: [
          { label: "Features", href: "/features/" },
          { label: "Pricing", href: "/pricing/" },
          { label: "Templates", href: "/templates/" },
          { label: "About", href: "/about/" },
        ],
      },
    ],
    legalLinks: [
      { label: "Privacy", href: "/privacy/" },
      { label: "Terms", href: "/terms/" },
    ],
  },

  copy: {
    emailCapture: {
      subtitle:
        "Tell us what you're planning and we'll send the resource to your inbox.",
      whatHappensNext:
        "Quick 3-question survey so we can send the right planning resources.",
    },
    homepage: {
      proofBody: publicSiteCopy.homepageProofBody,
    },
    fakeDoorPricing: {
      confirmationMessage: publicSiteCopy.fakeDoorPricingConfirmation,
    },
    survey: {
      unqualifiedCtaText: "Browse our planning guides",
      unqualifiedCtaTarget: "/resources/guides/",
    },
    funnelCta: {
      benefitBullets: [...publicSiteCopy.funnelBenefitBullets],
    },
    exitPopup: {
      headline: "Before you go, grab your free resource.",
      description: "A free planning tool to help you stay on track.",
      ctaText: "Get my free copy",
      leftPanelLabel: "FREE DOWNLOAD",
      successSubMessage: "Check your inbox. It's on the way.",
    },
  },
} satisfies SiteConfig;

export const screenshotGallery: ScreenshotEntry[] = [
  {
    src: ledgerScreenshot,
    alt: "Kaiplan budget ledger showing vendor quote, deposit paid, and remaining balance",
    caption:
      "Real numbers, not estimates. The ledger tracks what vendors quoted, what you've paid, and what you still owe — updated in real time.",
    feature: "Budget Ledger",
  },
  {
    src: guestsScreenshot,
    alt: "Kaiplan guest list with RSVP status for each guest",
    caption:
      "Guest list linked to RSVP and seating. Every confirmed guest flows directly into the seating chart — no copy-paste.",
    feature: "Guest List",
  },
  {
    src: seatingScreenshot,
    alt: "Kaiplan drag-and-drop seating chart populated from RSVP responses",
    caption:
      "Drag-and-drop seating built from your RSVP data. Rearrange tables in seconds — the chart stays in sync as guests confirm.",
    feature: "Seating Chart",
  },
  {
    src: vendorsScreenshot,
    alt: "Kaiplan vendor contact tracker with status and notes",
    caption:
      "All your vendors in one place. Track status, notes, and contract details — no more hunting through email threads.",
    feature: "Vendor Tracker",
  },
];
