import type { FaqItem } from "@kaiplan/marketing";
import { kaiplanPricingFacts } from "@kaiplan/knowledge/marketing";

const { plans: PLAN_PRICING } = kaiplanPricingFacts;
const starterPrice = PLAN_PRICING.starter.price;
const proPrice = PLAN_PRICING.pro.price;
const lifetimePrice = PLAN_PRICING.lifetime.price;

export const hubFaqs: Record<string, FaqItem[]> = {
  "/compare": [
    {
      q: "How does Kaiplan compare to The Knot for wedding planning?",
      a: "The Knot earns revenue from vendors who pay for visibility, so its directory is part planning tool and part marketplace. Kaiplan earns directly from couples, so there is no financial incentive to steer you toward a paid listing.",
    },
    {
      q: "What's the main difference between Kaiplan and free wedding planning tools?",
      a: `Free wedding planning tools are typically ad-supported or registry-driven. The vendors they surface have paid for placement, and the budget tools tend to underestimate costs. Kaiplan is a paid tool from ${starterPrice} or ${lifetimePrice}, with no vendor revenue. What you see reflects your actual budget, not a vendor's ad spend.`,
    },
    {
      q: "Does Kaiplan replace tools like Zola or Joy?",
      a: "Kaiplan replaces the planning and budget functionality in Zola or Joy. Zola is primarily a registry product and Joy is RSVP and guest communication. Neither has a real budget ledger or vendor tracking. Kaiplan handles budget, guest list, vendors, and seating in one place.",
    },
    {
      q: "Is Appy Couple a direct competitor to Kaiplan?",
      a: "Appy Couple charges a one-time fee and focuses on guest communication only, no budget ledger, seating chart, or vendor tracking. Kaiplan has monthly plans plus a Lifetime option, and it is a full planning tool. If you need budget management and vendor coordination, they're different categories.",
    },
  ],
  "/compare/alternatives": [
    {
      q: "Why would I switch from The Knot or WeddingWire to Kaiplan?",
      a: "The Knot and WeddingWire generate revenue from vendors who pay for featured placement. Kaiplan doesn't earn from vendor referrals, so the tool can give you planning support without directing you toward paid listings.",
    },
    {
      q: "Can I use Kaiplan if I've already started planning with another tool?",
      a: "Yes. Kaiplan doesn't require you to start from scratch. You can enter your existing vendor quotes, guest list, and budget figures when you set up your account. The alternatives pages note migration-specific considerations for moving from major platforms.",
    },
    {
      q: "Is Aisle Planner an alternative to Kaiplan?",
      a: "Aisle Planner is built for professional wedding planners managing multiple clients, its pricing and feature set reflect that. Kaiplan is built for the couple doing their own planning. If you're not working with a professional planner, Aisle Planner's monthly fee structure doesn't make sense for a single wedding.",
    },
  ],
  "/compare/versus": [
    {
      q: "How do these wedding planning tool comparisons evaluate vendor bias?",
      a: "Each comparison documents the platform's revenue model, specifically whether vendor recommendations are paid placements. This is the single biggest conflict of interest in wedding planning software and it's rarely disclosed transparently. The versus pages make it explicit.",
    },
    {
      q: "Is Bridebook a good alternative for US couples?",
      a: "Bridebook is a UK-built product with shallow US expansion. Its vendor directories are strong in the UK but thin in most US markets. The comparison pages document where Bridebook's coverage falls short for US couples vs. what The Knot or WeddingWire offer in terms of local vendor data.",
    },
    {
      q: "Which wedding planning tools have a one-time fee instead of a subscription?",
      a: `Kaiplan offers both: a ${starterPrice} Starter plan, a ${proPrice} Pro plan, and a ${lifetimePrice} Lifetime option. Appy Couple also uses one-time pricing but covers guest communication only, no budget ledger or seating chart. The versus pages flag pricing model as a comparison point so you can factor it into the decision.`,
    },
  ],
  "/compare/pricing": [
    {
      q: "Why are most wedding planning apps free?",
      a: "Free wedding planning platforms typically earn from vendor advertising, the vendors pay to be featured in their directories and recommendation lists. You pay nothing out of pocket, but the tool's incentives are aligned with vendors, not with you. The pricing pages document the revenue model behind each major platform.",
    },
    {
      q: "What's included in Kaiplan's pricing plans?",
      a: `The Starter plan (${starterPrice}) covers budget ledger, guest list management, and seating chart. The Pro plan (${proPrice}) adds vendor tracking, wedding website with RSVP, and role-based team access so you can invite your partner or planner with separate logins. The Lifetime tier (${lifetimePrice}) includes everything in Pro with no recurring charges. One payment covers the full planning lifecycle and the wedding archive stays accessible forever.`,
    },
    {
      q: "How does Planning Pod pricing compare to Kaiplan?",
      a: "Planning Pod charges $49-$149/month and is designed for event professionals managing multiple weddings, not individual couples. For a single wedding, that's a significant recurring cost for a tool built for a different use case. The pricing breakdown page covers the full cost comparison.",
    },
  ],
  "/resources": [
    {
      q: "What kind of wedding planning information is in these guides?",
      a: "The resources section covers two areas: ranked lists of wedding planning tools evaluated on features, pricing, and vendor bias, and practical guides for couples building a budget, managing vendors, and navigating a planning process that most platforms make unnecessarily complicated.",
    },
    {
      q: "Are these guides sponsored by any wedding vendors?",
      a: "No. Kaiplan earns revenue from couples directly, not from vendor advertising. These guides don't have paid placements, sponsored rankings, or affiliate vendor links. What you read reflects our honest assessment, not vendor ad spend.",
    },
    {
      q: "Where can I learn about The Knot's vendor advertising model?",
      a: "The resources section covers how wedding platform vendor advertising works, how to evaluate planning tools, and how to spot when a directory is blending recommendations with paid visibility.",
    },
  ],
  "/resources/best": [
    {
      q: "How are wedding planning apps ranked in these roundups?",
      a: "Rankings evaluate apps on feature completeness for couples (not professionals), pricing model transparency, vendor bias disclosure, and whether the tool handles budget, guest, vendor, and seating in one place. We don't accept vendor placements.",
    },
    {
      q: "Which wedding planning tools have the least vendor bias?",
      a: "The roundup on vendor-neutral planning tools identifies which platforms earn from couples vs. which earn from vendor placements. Tools without vendor advertising revenue are structurally more neutral on vendor recommendations, the roundup makes this explicit.",
    },
    {
      q: "Is there a roundup comparing wedding planning tools by feature set?",
      a: "Yes. The feature comparison roundup covers which tools include budget management, guest management, seating charts, and vendor tracking, and which are single-function tools marketed as full planning suites.",
    },
  ],
  "/resources/guides": [
    {
      q: "What wedding planning guide topics are covered?",
      a: "The guides cover building a realistic wedding budget, how to evaluate vendor contracts, how to manage a guest list without fragmented spreadsheets, and how to tell the difference between a vendor recommendation and a paid placement on popular platforms.",
    },
    {
      q: "Is there a guide on building a wedding budget without platform bias?",
      a: "Yes. The budget guide covers how to build an accurate budget ledger using real vendor quotes, what free platform budget calculators typically miss, and how to track actual costs vs. initial estimates as vendors confirm.",
    },
    {
      q: "Where can I learn about wedding platform advertising?",
      a: "The guide section covers how vendor directories make money, how paid placement can shape rankings, and how to use those platforms without confusing visibility with fit.",
    },
  ],
};
