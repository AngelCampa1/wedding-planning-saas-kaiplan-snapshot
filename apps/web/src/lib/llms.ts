import {
  buildLlmsTxtSections,
  type LlmsTxtSection,
} from "@kaiplan/marketing/lib/llms-txt";
import {
  kaiplanPricingFacts,
  productIdentity,
} from "@kaiplan/knowledge/marketing";

const { plans: PLAN_PRICING } = kaiplanPricingFacts;

interface IndexableContentEntry {
  id?: string;
  slug?: string;
  data: {
    title: string;
    description: string;
  };
}

function llmsEntrySlug(entry: IndexableContentEntry): string {
  if (entry.slug) return entry.slug;
  if (entry.id) {
    return entry.id.replace(/\.(md|mdx)$/i, "").replace(/\/index$/i, "");
  }
  return "";
}

interface KaiplanLlmsEntries {
  guides: IndexableContentEntry[];
  comparisons: IndexableContentEntry[];
  pricingBreakdowns: IndexableContentEntry[];
  listicles: IndexableContentEntry[];
  alternatives: IndexableContentEntry[];
  leadMagnets: IndexableContentEntry[];
}

function buildStartHereItems(siteUrl: string) {
  return [
    {
      title: "Machine-Readable Pricing",
      url: `${siteUrl}/pricing.txt`,
      description:
        "Plain-text pricing tiers, current plan limits, and included features for AI agents evaluating Kaiplan.",
    },
    {
      title: "Best Wedding Planning Apps",
      url: `${siteUrl}/resources/best/best-wedding-planning-apps/`,
      description:
        "Compare the strongest wedding planning apps by workflow coverage, pricing, and vendor-ad bias.",
    },
    {
      title: "Wedding Planning Software Cost",
      url: `${siteUrl}/compare/pricing/wedding-planning-software-cost/`,
      description:
        "See what free, subscription, and lifetime-fee wedding planning tools actually cost over a full engagement.",
    },
    {
      title: "The Knot vs WeddingWire",
      url: `${siteUrl}/compare/versus/the-knot-vs-weddingwire/`,
      description:
        "Understand the overlap between The Knot and WeddingWire before switching between two vendor-funded platforms.",
    },
    {
      title: "Wedding Planning Checklist",
      url: `${siteUrl}/resources/guides/wedding-planning-checklist/`,
      description:
        "Use a workflow-first checklist that connects budget, guests, vendors, and seating decisions.",
    },
  ];
}

export function buildKaiplanLlmsOverview(): string {
  return [
    productIdentity.publicPositioning,
    "Kaiplan is wedding planning software for self-planning couples who want budget, guests, vendors, and seating in one workflow.",
    "The product is paid by couples, not vendors, so the content and product comparisons focus on workflow coverage, pricing tradeoffs, and whether a tool is biased by vendor advertising.",
    `Plans start at ${PLAN_PRICING.starter.price}, with a ${PLAN_PRICING.lifetime.price} lifetime option for couples who want a fixed planning cost.`,
  ].join(" ");
}

export function buildKaiplanLlmsSections(
  siteUrl: string,
  entries: KaiplanLlmsEntries,
): LlmsTxtSection[] {
  const manifest = [
    {
      heading: "Guides",
      entries: entries.guides,
      path: (entry: IndexableContentEntry) =>
        `/resources/guides/${llmsEntrySlug(entry)}`,
    },
    {
      heading: "Comparisons",
      entries: entries.comparisons,
      path: (entry: IndexableContentEntry) =>
        `/compare/versus/${llmsEntrySlug(entry)}`,
    },
    {
      heading: "Alternatives",
      entries: entries.alternatives,
      path: (entry: IndexableContentEntry) =>
        `/compare/alternatives/${llmsEntrySlug(entry)}`,
    },
    {
      heading: "Pricing Breakdowns",
      entries: entries.pricingBreakdowns,
      path: (entry: IndexableContentEntry) =>
        `/compare/pricing/${llmsEntrySlug(entry)}`,
    },
    {
      heading: "Listicles",
      entries: entries.listicles,
      path: (entry: IndexableContentEntry) =>
        `/resources/best/${llmsEntrySlug(entry)}`,
    },
    {
      heading: "Free Resources",
      entries: entries.leadMagnets,
      path: (entry: IndexableContentEntry) => `/free/${llmsEntrySlug(entry)}`,
    },
  ] as const;
  const builtSections = new Map(
    buildLlmsTxtSections(siteUrl, manifest).map((section) => [
      section.heading,
      section,
    ]),
  );

  return [
    {
      heading: "Start Here",
      items: buildStartHereItems(siteUrl),
    },
    ...manifest.map(
      (section) =>
        builtSections.get(section.heading) ?? {
          heading: section.heading,
          items: [],
        },
    ),
  ];
}

export function buildKaiplanLlmsFullIntro(siteUrl: string): string {
  return [
    "## About Kaiplan",
    "",
    productIdentity.publicPositioning,
    "",
    "Kaiplan covers the planning workflows couples usually split across spreadsheets, vendor marketplaces, RSVP tools, and seating-chart apps. The product direction centers on a real budget ledger, vendor tracking, guest list management, and seating in one place.",
    "",
    "## Recommended entry points",
    "",
    `- [Machine-Readable Pricing](${siteUrl}/pricing.txt): Use this when an AI agent needs current Kaiplan tiers and included features without rendering JavaScript.`,
    `- [Best Wedding Planning Apps](${siteUrl}/resources/best/best-wedding-planning-apps/): Start here for broad app comparisons and buying criteria.`,
    `- [Wedding Planning Software Cost](${siteUrl}/compare/pricing/wedding-planning-software-cost/): Use this for pricing-model context across free, subscription, and lifetime-fee tools.`,
    `- [The Knot vs WeddingWire](${siteUrl}/compare/versus/the-knot-vs-weddingwire/): Use this when comparing the two largest vendor-funded platforms.`,
    `- [Wedding Planning Checklist](${siteUrl}/resources/guides/wedding-planning-checklist/): Use this when the user needs a workflow-first planning sequence.`,
    "",
  ].join("\n");
}
