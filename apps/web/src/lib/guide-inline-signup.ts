import { buildAppSignupUrl } from "./app-links";

export interface GuideInlineSignupCopy {
  sourcePage: string;
  heading: string;
  subtext: string;
  buttonText: string;
  ctaTarget: string;
  subtitle: string;
  whatHappensNext: string;
  surveyPreview: string;
  variant: "editorial";
}

export function buildGuideInlineSignupCopy(
  sourcePage: string,
): GuideInlineSignupCopy {
  return {
    sourcePage,
    heading:
      "Create your Kaiplan account when you're ready to stop juggling tools",
    subtext:
      "Start the full app trial first, then choose the billing model that fits your engagement later.",
    buttonText: "Start planning with Kaiplan",
    ctaTarget: buildAppSignupUrl(),
    subtitle:
      "Starter, Pro, and Lifetime all begin from the same connected planning workspace.",
    whatHappensNext:
      "You'll create your account first and open the full workspace before deciding on a plan.",
    surveyPreview:
      "Budget, guests, vendors, and seating stay connected from day one.",
    variant: "editorial",
  };
}
