import type { ContentRouteInventory } from "./content-route-inventory";

export const resourcePillarSlugs = [
  "wedding-budget",
  "wedding-costs",
  "wedding-vendors",
  "guest-list-rsvp-seating",
  "timeline-checklist",
  "wedding-websites-registry",
  "wedding-planning-tools",
] as const;

export type ResourcePillarSlug = (typeof resourcePillarSlugs)[number];

export interface ResourcePillar {
  slug: ResourcePillarSlug;
  href: `/resources/${ResourcePillarSlug}/`;
  navLabel: string;
  title: string;
  description: string;
  eyebrow: string;
  faqs: { q: string; a: string }[];
}

export interface PillarResourceItem {
  href: string;
  title: string;
  description?: string;
  publishedAt?: string;
  type: string;
}

export const resourcePillars: readonly ResourcePillar[] = [
  {
    slug: "wedding-budget",
    href: "/resources/wedding-budget/",
    navLabel: "Wedding Budget",
    eyebrow: "Budget Hub",
    title: "Wedding Budget Resources",
    description:
      "Budget guides, spreadsheet migration help, budget tools, and cost-control resources for couples who want clear numbers before they commit.",
    faqs: [
      {
        q: "What belongs in a wedding budget?",
        a: "A useful wedding budget includes venue, catering, attire, photography, flowers, music, stationery, gratuities, taxes, and a contingency line for late surprises.",
      },
      {
        q: "Should couples use a spreadsheet or a planning app?",
        a: "A spreadsheet works early, but an app is easier once vendor quotes, guest count changes, payment due dates, and shared decisions start moving at once.",
      },
    ],
  },
  {
    slug: "wedding-costs",
    href: "/resources/wedding-costs/",
    navLabel: "Wedding Costs",
    eyebrow: "Cost Hub",
    title: "Wedding Cost Guides",
    description:
      "State cost guides, guest-count cost guides, vendor price explainers, and hidden-cost resources for planning with realistic ranges.",
    faqs: [
      {
        q: "Why do wedding cost estimates vary so much?",
        a: "Costs change with guest count, region, season, service level, and what is included in each vendor quote.",
      },
      {
        q: "Which costs do couples most often miss?",
        a: "Taxes, service fees, delivery, setup, alterations, rentals, gratuities, overtime, postage, and day-of meals are common misses.",
      },
    ],
  },
  {
    slug: "wedding-vendors",
    href: "/resources/wedding-vendors/",
    navLabel: "Vendors",
    eyebrow: "Vendor Hub",
    title: "Wedding Vendor Planning Resources",
    description:
      "Vendor research, contract, quote comparison, venue, photographer, caterer, officiant, and vendor-management resources in one hub.",
    faqs: [
      {
        q: "How should couples compare wedding vendors?",
        a: "Compare scope, availability, included services, cancellation terms, payment schedule, staffing, communication style, and total quoted cost.",
      },
      {
        q: "What is the risk with vendor directories?",
        a: "Some directories mix organic results with paid placement, so couples should verify reviews, contracts, and quotes outside the listing page.",
      },
    ],
  },
  {
    slug: "guest-list-rsvp-seating",
    href: "/resources/guest-list-rsvp-seating/",
    navLabel: "Guests & RSVPs",
    eyebrow: "Guest Hub",
    title: "Guest List, RSVP, and Seating Resources",
    description:
      "Guides and tools for guest lists, RSVP tracking, seating charts, invitations, save-the-dates, and guest-facing wedding details.",
    faqs: [
      {
        q: "When should couples start the guest list?",
        a: "Start the guest list before venue shopping because guest count drives venue size, catering cost, invitations, rentals, and seating complexity.",
      },
      {
        q: "When does seating become hard to manage?",
        a: "Seating gets harder once RSVPs, family groups, meal choices, venue tables, and last-minute guest changes need to stay in sync.",
      },
    ],
  },
  {
    slug: "timeline-checklist",
    href: "/resources/timeline-checklist/",
    navLabel: "Timeline & Checklist",
    eyebrow: "Timeline Hub",
    title: "Wedding Timeline and Checklist Resources",
    description:
      "Planning timelines, checklists, day-of schedules, emergency kits, and workflow resources for turning research into action.",
    faqs: [
      {
        q: "What should a wedding checklist include?",
        a: "A checklist should cover budget, venue, vendors, guests, attire, website, invitations, ceremony, reception, payments, and day-of logistics.",
      },
      {
        q: "When should couples build a day-of timeline?",
        a: "Build the first day-of timeline after major vendors are booked, then refine it as ceremony, photo, hair, makeup, and transportation details settle.",
      },
    ],
  },
  {
    slug: "wedding-websites-registry",
    href: "/resources/wedding-websites-registry/",
    navLabel: "Websites & Registry",
    eyebrow: "Website Hub",
    title: "Wedding Website and Registry Resources",
    description:
      "Wedding website, RSVP, registry, invitation, stationery, and website-builder comparisons for couples choosing guest-facing tools.",
    faqs: [
      {
        q: "What should a wedding website include?",
        a: "Include the schedule, venue details, travel notes, dress code, RSVP instructions, registry links, and any guest-specific logistics.",
      },
      {
        q: "Are free wedding websites really free?",
        a: "Many are free to publish, but the provider may monetize registry commissions, stationery, vendor ads, or upgrades around the website.",
      },
    ],
  },
  {
    slug: "wedding-planning-tools",
    href: "/resources/wedding-planning-tools/",
    navLabel: "Planning Tools",
    eyebrow: "Tools Hub",
    title: "Wedding Planning Tools and App Resources",
    description:
      "Best-app rankings, alternatives, comparisons, pricing breakdowns, and software guides for couples evaluating wedding planning tools.",
    faqs: [
      {
        q: "How should couples choose a wedding planning app?",
        a: "Choose based on the jobs you need done: budget tracking, guest management, vendor notes, RSVP, seating, checklist, partner access, and exportability.",
      },
      {
        q: "Why compare wedding apps by business model?",
        a: "Business model affects incentives. Apps funded by vendor ads, registry commissions, or stationery sales may prioritize different outcomes than couples do.",
      },
    ],
  },
];

const routeKeywordPillars: readonly [RegExp, readonly ResourcePillarSlug[]][] =
  [
    [/budget|spreadsheet|hidden-cost|cost-control/i, ["wedding-budget"]],
    [
      /cost|pricing|price|fee|paid|subscription|one-time|planner|venue|catering|photography|flowers|dress|cake|hair|makeup|arch|officiant/i,
      ["wedding-costs"],
    ],
    [
      /vendor|venue|caterer|photographer|officiant|contract|quote|directory|ads|planner/i,
      ["wedding-vendors"],
    ],
    [
      /guest|rsvp|seating|seat|invitation|save-the-date|registry|website|stationery|minted|appy-couple|joy/i,
      ["guest-list-rsvp-seating"],
    ],
    [
      /timeline|checklist|schedule|day-of|morning|emergency|plan-a-wedding|planning-tips|mistakes|advice/i,
      ["timeline-checklist"],
    ],
    [
      /website|registry|invitation|stationery|minted|zola|joy|appy-couple|hitchd/i,
      ["wedding-websites-registry"],
    ],
    [
      /app|tool|software|alternative|versus|vs|compare|comparison|knot|zola|weddingwire|bridebook|aisle-planner|planning-pod|hitchd|joy|planner/i,
      ["wedding-planning-tools"],
    ],
    [
      /\/resources\/guides\/(?:destination|how-to-|wedding-|what-does|why-couples|bachelorette|elopement|engagement-party|fall-|lgbtq|micro-|outdoor|second-|winter-)|-planning-guide/i,
      ["timeline-checklist"],
    ],
    [
      /\/resources\/guides\/(?:is-kaiplan|kaiplan-features|kaiplan-lifetime)/i,
      ["wedding-planning-tools"],
    ],
    [
      /\/free\/wedding-day-coordinator|\/free\/wedding-vows/i,
      ["timeline-checklist"],
    ],
  ];

const fallbackPillar: ResourcePillarSlug = "wedding-planning-tools";

export function getResourcePillars(): readonly ResourcePillar[] {
  return resourcePillars;
}

export function getResourcePillarBySlug(
  slug: string,
): ResourcePillar | undefined {
  return resourcePillars.find((pillar) => pillar.slug === slug);
}

export function getPillarsForHref(href: string): ResourcePillarSlug[] {
  const pillars = getMatchedPillarsForHref(href);

  return pillars.length > 0 ? pillars : [fallbackPillar];
}

function getMatchedPillarsForHref(href: string): ResourcePillarSlug[] {
  const normalized = normalizeHref(href);
  const pillars = new Set<ResourcePillarSlug>();

  for (const [pattern, slugs] of routeKeywordPillars) {
    if (!pattern.test(normalized)) continue;
    for (const slug of slugs) pillars.add(slug);
  }

  if (
    normalized.startsWith("/compare/") ||
    normalized.startsWith("/resources/best/")
  ) {
    pillars.add("wedding-planning-tools");
  }

  return [...pillars];
}

export function getPrimaryPillarForHref(href: string): ResourcePillar {
  const [slug] = getPillarsForHref(href);
  return getResourcePillarBySlug(slug) as ResourcePillar;
}

export function getPillarResources(
  slug: ResourcePillarSlug,
  resources: readonly PillarResourceItem[],
): PillarResourceItem[] {
  return resources.filter((resource) =>
    getPillarsForHref(resource.href).includes(slug),
  );
}

export function assertCompletePillarCoverage(
  inventory: ContentRouteInventory,
): void {
  const missing = Array.from(inventory.indexablePaths).filter(
    (href) => getMatchedPillarsForHref(href).length === 0,
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing resource pillar assignments: ${missing.join(", ")}`,
    );
  }
}

export function normalizeHref(href: string): string {
  if (href === "/") return href;
  return href.endsWith("/") ? href : `${href}/`;
}
