interface HubCallToActionCopy {
  heading: string;
  body: string;
  buttonText: string;
}

interface KaiplanHubCopy {
  title: string;
  description: string;
  faqHeading: string;
  ctaHeading: string;
  ctaBody: string;
  ctaButtonText: string;
}

function createHubCopy(
  title: string,
  description: string,
  faqHeading: string,
  cta: HubCallToActionCopy,
): KaiplanHubCopy {
  return {
    title,
    description,
    faqHeading,
    ctaHeading: cta.heading,
    ctaBody: cta.body,
    ctaButtonText: cta.buttonText,
  };
}

export function getKaiplanCompareHubCopy(): KaiplanHubCopy {
  return createHubCopy(
    "Compare Wedding Planning Software",
    "Side-by-side comparisons of wedding planning software, alternative options, and pricing breakdowns — ranked by planning depth, not vendor ads.",
    "Wedding planning comparison questions",
    {
      heading: "Ready to plan without vendor pressure?",
      body: "Create your Kaiplan account, start the full app trial, and decide on billing later.",
      buttonText: "Start planning with Kaiplan",
    },
  );
}

export function getKaiplanResourcesHubCopy(): KaiplanHubCopy {
  return createHubCopy(
    "Wedding Planning Resources & Guides",
    "Practical wedding planning guides, app comparisons, and free templates for couples building a budget and picking tools — without vendor ads steering the process.",
    "Wedding planning guide questions",
    {
      heading: "Want a calmer way to plan the budget?",
      body: "Create your account and move budget, guests, vendors, and seating into one connected planning workspace.",
      buttonText: "Start planning with Kaiplan",
    },
  );
}

export function getKaiplanAlternativesHubCopy(): KaiplanHubCopy {
  return createHubCopy(
    "Wedding Planning Software Alternatives",
    "See how Kaiplan compares to the big names with real pricing, planning tradeoffs, and zero vendor ads in the product model.",
    "Wedding planning alternative questions",
    {
      heading: "Want the no-ad planning option?",
      body: "Create your account, start the full app trial, and plan without vendor ads steering every decision.",
      buttonText: "Start planning with Kaiplan",
    },
  );
}

export function getKaiplanVersusHubCopy(): KaiplanHubCopy {
  return createHubCopy(
    "Wedding Planning Software Comparisons",
    "Side-by-side wedding planning software comparisons focused on pricing, workflow fit, and the tradeoffs couples feel once planning gets real.",
    "Wedding planning comparison questions",
    {
      heading: "Need help choosing between tools?",
      body: "When you're ready, create your account and continue into the Kaiplan plan that matches your engagement.",
      buttonText: "Start planning with Kaiplan",
    },
  );
}

export function getKaiplanPricingHubCopy(): KaiplanHubCopy {
  return createHubCopy(
    "Wedding Planning Pricing Breakdowns",
    "What wedding planning software actually costs, including hidden fees, vendor-funded tradeoffs, and the planning workflows behind the price tag.",
    "Wedding planning pricing questions",
    {
      heading: "Tired of surprise fees and vague pricing?",
      body: "Create your account and continue into the Kaiplan plan that replaces stitched-together, vendor-funded tools.",
      buttonText: "Start planning with Kaiplan",
    },
  );
}

export function getKaiplanBestAppsHubCopy(): KaiplanHubCopy {
  return createHubCopy(
    "Best Wedding Planning Apps",
    "Best wedding planning apps ranked by real features — budget tracking depth, guest list tools, vendor management, and whether the app earns from couples or vendors.",
    "Best wedding planning app questions",
    {
      heading: "Want a planning tool with no vendor ads?",
      body: "Create your account and start planning with the Kaiplan workspace couples use instead of vendor-funded directories.",
      buttonText: "Start planning with Kaiplan",
    },
  );
}

export function getKaiplanGuidesHubCopy(): KaiplanHubCopy {
  return createHubCopy(
    "Wedding Planning Guides",
    "Step-by-step wedding planning guides covering budgets, timelines, vendors, and checklists — written for couples planning without professional help.",
    "Wedding planning guide questions",
    {
      heading: "Want help keeping the budget steady?",
      body: "Create your account and move budget, guests, vendors, and seating into one connected planning workspace.",
      buttonText: "Start planning with Kaiplan",
    },
  );
}
