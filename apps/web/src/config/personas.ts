import type { PersonaDefinition } from "@kaiplan/marketing";

export const personas = [
  {
    slug: "frustrated-planner",
    label: "The Frustrated Planner",
    description: "A tool that actually works for her, not for vendors",
  },
  {
    slug: "anti-subscription-couple",
    label: "The Anti-Subscription Couple",
    description:
      "Paying as little as possible for a one-time task; or paying once and being done",
  },
  {
    slug: "spreadsheet-builder",
    label: "The Spreadsheet Builder",
    description: "Control over her data; something she can actually trust",
  },
  {
    slug: "research-first-buyer",
    label: "The Research-First Buyer",
    description:
      "Understanding what she's paying for; no hidden conflicts of interest",
  },
] as const satisfies readonly PersonaDefinition[];

export type PersonaSlug = (typeof personas)[number]["slug"];

