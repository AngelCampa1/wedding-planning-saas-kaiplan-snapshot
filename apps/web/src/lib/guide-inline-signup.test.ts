import { describe, expect, it } from "vitest";
import { PUBLIC_APP_ORIGIN } from "./app-links";
import { buildGuideInlineSignupCopy } from "./guide-inline-signup";

describe("buildGuideInlineSignupCopy", () => {
  it("returns the editorial live-signup copy for guide pages", () => {
    expect(
      buildGuideInlineSignupCopy("/resources/guides/how-to-plan-a-wedding"),
    ).toEqual({
      sourcePage: "/resources/guides/how-to-plan-a-wedding",
      heading:
        "Create your Kaiplan account when you're ready to stop juggling tools",
      subtext:
        "Start the full app trial first, then choose the billing model that fits your engagement later.",
      buttonText: "Start planning with Kaiplan",
      ctaTarget: `${PUBLIC_APP_ORIGIN}/signup`,
      subtitle:
        "Starter, Pro, and Lifetime all begin from the same connected planning workspace.",
      whatHappensNext:
        "You'll create your account first and open the full workspace before deciding on a plan.",
      surveyPreview:
        "Budget, guests, vendors, and seating stay connected from day one.",
      variant: "editorial",
    });
  });
});
