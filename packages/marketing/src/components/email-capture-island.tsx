import { MarketingIslandBoundary } from "./marketing-island-boundary";
import { EmailCapture } from "./email-capture";
import type { ComponentProps } from "react";

type EmailCaptureIslandProps = ComponentProps<typeof EmailCapture>;

/**
 * Combines MarketingIslandBoundary and EmailCapture into a single React
 * component so that both run in the same React tree when hydrated via
 * client:visible in Astro.
 *
 * Astro's client:visible slot children are not independently hydrated — they
 * render as static HTML without event handlers. Passing EmailCapture as a
 * slotted child of MarketingIslandBoundary (with client:visible on the boundary)
 * meant the form never mounted: Turnstile was never injected and submit
 * handlers never ran. Wrapping both into one React component fixes that — the
 * error boundary wraps live React state and the form's effects run on hydration.
 */
export function EmailCaptureIsland(props: EmailCaptureIslandProps) {
  return (
    <MarketingIslandBoundary sectionName="Signup form">
      <EmailCapture {...props} />
    </MarketingIslandBoundary>
  );
}
