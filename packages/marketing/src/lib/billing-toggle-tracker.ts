import { trackEvent } from "./analytics";

export function trackBillingToggle(
  period: "monthly" | "annual",
  sourcePage: string,
): void {
  trackEvent("billing_toggle_switched", {
    billing_period: period,
    source_page: sourcePage,
  });
}
