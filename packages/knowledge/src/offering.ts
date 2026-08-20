import {
  BILLING_PLAN_LABELS,
  PLAN_PRICING,
  TRIAL_DURATION_DAYS,
} from "@kaiplan/shared";
import {
  kaiplanPricingFacts,
  publicPlanPricing,
  publicPlanFeatures,
  publicSiteCopy,
} from "./marketing";

const trialDurationLabel = `${TRIAL_DURATION_DAYS}-day`;
const choosePlanCta = {
  starter: `Choose ${BILLING_PLAN_LABELS.starter}`,
  pro: `Choose ${BILLING_PLAN_LABELS.pro}`,
  lifetime: `Choose ${BILLING_PLAN_LABELS.lifetime}`,
} as const;

export const kaiplanOffering = {
  plans: {
    starter: {
      ...publicPlanPricing.starter,
      highlighted: false,
      features: publicPlanFeatures.starter,
      bestFor:
        "Best for couples planning a small, focused wedding who only need the planning core.",
      description:
        "Starter is the budget ledger, the guest list, and the seating chart - the three surfaces every couple ends up needing inside the first month of planning. We built it for the couple who already knows the venue, has a date, and just wants the spreadsheet replaced. Real vendor quotes, real RSVP counts, real table arithmetic. Charged monthly so it stays in your budget the same way the cake quote does.",
      shortDescription: "Core planning tools",
      cadence: "billed monthly or yearly",
      ctaTextMarketing: "Start free trial",
      ctaTextHomepage: "Start free trial",
      ctaTextApp: choosePlanCta.starter,
    },
    pro: {
      ...publicPlanPricing.pro,
      highlighted: true,
      features: publicPlanFeatures.pro,
      bestFor:
        "Best for couples bringing a partner or planner into the workspace.",
      description:
        'Pro adds the surfaces that show up the moment the wedding gets bigger than one inbox. Vendor contracts get their own tracker. The wedding website lives in the same workspace as the guest list, so RSVPs flow back into the ledger without copy-paste. Role-based access lets your partner or planner sign in with their own account — no shared password, no "send me a screenshot." This is the plan most couples land on.',
      shortDescription: `Everything in ${BILLING_PLAN_LABELS.starter} plus premium features`,
      cadence: "billed monthly or yearly",
      ctaTextMarketing: "Start free trial",
      ctaTextHomepage: "Start free trial",
      ctaTextApp: choosePlanCta.pro,
    },
    lifetime: {
      ...publicPlanPricing.lifetime,
      highlighted: false,
      features: publicPlanFeatures.lifetime,
      bestFor:
        "Best for couples who would rather pay once and keep the data forever.",
      description: `${BILLING_PLAN_LABELS.lifetime} is the same product as ${BILLING_PLAN_LABELS.pro}, paid once. Most planning tools assume you'll churn the moment the wedding ends; we assume you'll want the budget ledger and guest list as a record of what you actually spent and who actually came. Pay ${PLAN_PRICING.lifetime.price}, keep your workspace, archive it after the wedding, come back when you want to look something up. No renewal email, no sunset date.`,
      shortDescription: "All features, one payment",
      cadence: "one-time purchase, no recurring charges",
      ctaTextMarketing: "See Lifetime price",
      ctaTextHomepage: "Get Lifetime access",
      ctaTextApp: choosePlanCta.lifetime,
    },
  },
  featureMatrix: [
    {
      id: "budget-ledger",
      label: "Budget ledger",
      availability: {
        starter: "Included",
        pro: "Included",
        lifetime: "Included",
      },
    },
    {
      id: "guest-list",
      label: "Guest list and RSVPs",
      availability: {
        starter: "Included",
        pro: "Included",
        lifetime: "Included",
      },
    },
    {
      id: "seating-chart",
      label: "Drag-and-drop seating chart",
      availability: {
        starter: "Included",
        pro: "Included",
        lifetime: "Included",
      },
    },
    {
      id: "milestone-checklist",
      label: "Milestone checklist",
      availability: {
        starter: "Included",
        pro: "Included",
        lifetime: "Included",
      },
    },
    {
      id: "csv-export",
      label: "CSV export",
      availability: {
        starter: "Included",
        pro: "Included",
        lifetime: "Included",
      },
    },
    {
      id: "vendor-tracker",
      label: "Vendor contact tracker",
      availability: { starter: null, pro: "Included", lifetime: "Included" },
    },
    {
      id: "wedding-website",
      label: "Wedding website with RSVP",
      availability: { starter: null, pro: "Included", lifetime: "Included" },
    },
    {
      id: "role-access",
      label: "Role-based team access",
      availability: { starter: null, pro: "Included", lifetime: "Included" },
    },
    {
      id: "billing",
      label: "Billing",
      availability: {
        starter: PLAN_PRICING.starter.price.replace("/mo", " / month"),
        pro: PLAN_PRICING.pro.price.replace("/mo", " / month"),
        lifetime: PLAN_PRICING.lifetime.price,
      },
    },
  ],
  featureChapters: {
    "budget-ledger": {
      eyebrow: "Budget",
      numeral: "I." as const,
      title: "A real ledger, not a generic budget category.",
      body: "Most wedding apps hand you a pie chart of national averages and call it a budget. We built the ledger to track the actual numbers that come out of your conversations — what the florist quoted, what the photographer's deposit was, what the band still wants on the day of. Every line carries a vendor name, a category, a paid column, and a remaining balance. The category totals reconcile in real time as the numbers move, which means the morning a new quote lands you can see what it does to the rest of the wedding before you reply to the email. We kept CSV export on every plan because the spreadsheet you started with deserves to come along.",
      whatItDoes: [
        "Real vendor quotes with deposit and balance columns",
        "Category totals that reconcile as numbers change",
        "CSV export on every plan",
        "Linked to vendor records so a quote and a contract live together",
      ],
    },
    "guest-list": {
      eyebrow: "Guests",
      numeral: "II." as const,
      title: "Guests, RSVPs, and dietary notes in one ledger.",
      body: "A guest list is a small database with personal stakes — your aunt's plus-one, your friend's gluten allergy, the cousin you are not actually inviting. We built one table that holds every name, every reply, every dietary note, and every group membership, with filter views for the chase list and the seating chart. The running count answers \"who hasn't replied?\" without a spreadsheet equation, and the export hands the caterer the file shape they actually want. When an RSVP changes, every other surface — seating, headcount, dinner counts — sees the change immediately. No copy-paste between tabs.",
      whatItDoes: [
        "Side, group, RSVP state, and dietary notes per guest",
        "Filter views for the chase list and the seating chart",
        "Caterer-shaped CSV export",
        "Live count of confirmed, declined, and pending replies",
      ],
    },
    "seating-chart": {
      eyebrow: "Seating",
      numeral: "III." as const,
      title: "A seating chart that does the table arithmetic.",
      body: 'Seating is where wedding logistics quietly fall apart in a spreadsheet. We built a canvas you can actually arrange the room on: drag a name from the unseated rail, drop it on a table, and the inspector counts heads, flags overcommitted tables, and warns when a couple has been split. Tables come in round, rectangular, and head-table shapes; you can rename them, move them, and rotate them without losing the assignments. The whole canvas stays in sync with the guest list — when an RSVP flips, the name moves to or from the unseated rail automatically. There is no "export to seating tool" step.',
      whatItDoes: [
        "Round, rectangular, and head-table shapes",
        "Inspector with per-table counts and notes",
        "Stays in sync with the guest list — no copy-paste",
        "Unseated rail surfaces who still needs a chair",
      ],
    },
    "vendor-tracker": {
      eyebrow: "Vendors",
      numeral: "IV." as const,
      title: "Vendors organized like contracts, not contacts.",
      body: "Most planning tools turn vendors into a contact card with a phone number. We built the vendor tracker as a contracts ledger: one row per vendor, with category, contract status, primary contact, and the last note you sent. Booked, in negotiation, and shortlisted are first-class states, not tags. Notes survive the inbox — the question you asked the photographer about second-shooter pricing lives next to the answer. Each vendor links back to its line in the budget ledger, so the quote and the contract live together, and the email you are hunting for at midnight is one click away.",
      whatItDoes: [
        "Booked, in negotiation, and shortlisted states",
        "Notes field that survives the inbox",
        "Linked from the budget so a quote and a contract live together",
        "Filter and sort by category, status, or last touch",
      ],
    },
    "wedding-website": {
      eyebrow: "Website",
      numeral: "V." as const,
      title: "Your wedding website, in the same workspace.",
      body: "Wedding websites usually live on a separate platform with its own login, its own template store, and its own ads. We built a wedding website that publishes from the same workspace you keep the budget in — hero, story, venue, optional external registry link, and an RSVP form whose responses flow straight back into the guest ledger. The layout is editorial, not template-store kitsch, and the Kaiplan wedding URL stays tied to the same planning workspace. There is no upsell paywall on the basics, no banner trying to sell your guests a registry, no separate dashboard to babysit.",
      whatItDoes: [
        "Editorial layout, no template-store kitsch",
        "RSVP responses flow back into the guest ledger",
        "Private household RSVP links",
        "SEO basics — clean meta, sitemap, sharable preview",
      ],
    },
    "milestone-checklist": {
      eyebrow: "Timeline",
      numeral: "VI." as const,
      title: "A checklist that knows what month you're in.",
      body: "A wedding timeline is sixty-plus tasks with overlapping deadlines and no two weddings running in the same order. We built the milestone checklist with a default plan we wrote ourselves, bucketed by months-out, so the day you start the engagement is the day you can see what to do twelve months out without inventing it. Custom tasks live next to the defaults; ignore the ones that don't apply to your wedding. The checklist stays quiet about what you have already finished — no badge spam, no celebratory animations, no notifications you didn't ask for. Just the work that is left.",
      whatItDoes: [
        "60+ tasks from twelve months out through the day-of",
        "Custom tasks live alongside the defaults",
        "Bucketed by months-out, anchored to the wedding date",
        "Quiet about what's already finished — no badge spam",
      ],
    },
  },
  planFaqs: [
    {
      id: "lifetime-after-wedding",
      q: `What happens after my wedding if I'm on ${BILLING_PLAN_LABELS.lifetime}?`,
      a: `Your workspace stays. You can keep the data archived inside Kaiplan, export everything to CSV, or both. There's no auto-delete, no sunset date, and no email asking you to renew — ${BILLING_PLAN_LABELS.lifetime} means the access doesn't expire.`,
    },
    {
      id: "starter-to-pro",
      q: `Can I switch from ${BILLING_PLAN_LABELS.starter} to ${BILLING_PLAN_LABELS.pro} mid-plan?`,
      a: "Yes. Upgrade from inside the workspace and the new tier kicks in immediately — your budget, guests, and seating chart carry over untouched. Downgrades work the same way at the next billing cycle.",
    },
    {
      id: "free-trial",
      q: "Is there a free trial?",
      a: `Yes. New accounts start with a ${trialDurationLabel} free trial with full app access. You can use the workspace before choosing a plan. ${BILLING_PLAN_LABELS.lifetime} is a one-time purchase with no trial. Pay ${PLAN_PRICING.lifetime.price}, with no auto-renewal.`,
    },
    {
      id: "no-vendor-ads",
      q: 'What does "no vendor ads" actually mean?',
      a: "It means the recommendations you see inside Kaiplan are the ones you wrote down. We don't sell sponsored placements, we don't take affiliate kickbacks on the vendors you book, and we don't reorder your shortlist behind the scenes. Revenue comes from couples paying for the workspace — that's the whole pricing model.",
    },
    {
      id: "cancel-monthly",
      q: "Can I cancel a monthly plan any time?",
      a: "Yes. Monthly plans cancel from inside the workspace, with no phone call and no retention queue. You keep access until the end of the period you've already paid for, and your data stays exportable after that.",
    },
    {
      id: "payment-methods",
      q: "What payment methods do you take?",
      a: "All major credit and debit cards, processed through our payments provider over a secure checkout. If your bank prefers a different method, write to us before you sign up and we'll see what we can do.",
    },
  ],
  homepageFaqs: [
    {
      q: "Why would I pay for Kaiplan instead of staying on free wedding apps?",
      a: "Free wedding apps are usually marketplaces first. Kaiplan is meant to be the planning workspace: real quote tracking, guest coordination, vendor tracking, and seating in one place, with revenue coming from couples instead of vendor placements.",
    },
    {
      q: "What happens after I start the trial?",
      a: `You create your account first and get the full planning workspace for ${TRIAL_DURATION_DAYS} days. Choose or confirm a plan later from inside the app when you know which billing model fits your engagement.`,
    },
    {
      q: "Which plan is the right fit if I only need Kaiplan for one wedding?",
      a: `${BILLING_PLAN_LABELS.starter} begins at ${PLAN_PRICING.starter.price} if you want a month-to-month option. If you would rather make one decision and keep your planning workspace for the full engagement, the lifetime option gives you the full product without ongoing renewals.`,
    },
    {
      q: "Why is there a lifetime option?",
      a: `A wedding is a finite planning project. ${kaiplanPricingFacts.lifetimePriceLabel} gives couples a way to pay once, keep access through the engagement, and avoid another subscription.`,
    },
    {
      q: "Does Kaiplan include a wedding checklist?",
      a: "Yes — every Kaiplan wedding comes with a pre-built milestone checklist covering 60+ tasks from 12+ months out through the day-of. Check off tasks as you go, add your own, and track your overall progress at a glance.",
    },
    {
      q: "Can I export my data?",
      a: "Yes — your guest list, budget ledger, and vendor tracker are all exportable as CSV files directly from Settings. Your data is yours. We don't sell it, and you're never locked in.",
    },
    {
      q: "What happens after the wedding?",
      a: `Your Kaiplan account stays active. When you're ready, you can archive your wedding in one click — it becomes read-only, but all your data stays accessible and exportable forever. On the ${BILLING_PLAN_LABELS.lifetime} plan, your account is never deleted. On monthly plans, data remains available for 30 days after cancellation.`,
    },
    {
      q: "Does Kaiplan use AI?",
      a: "We're evaluating AI features for budget suggestions and vendor messaging. We'll ship them when they're accurate, not just fast. Until then, Kaiplan stays deterministic: every number on your ledger is something you or your vendor entered.",
    },
  ],
  copy: {
    lifetimePriceLabel: kaiplanPricingFacts.lifetimePriceLabel,
    trialBannerText: publicSiteCopy.pricingTrialBannerText,
  },
} as const;

export type KaiplanOffering = typeof kaiplanOffering;
