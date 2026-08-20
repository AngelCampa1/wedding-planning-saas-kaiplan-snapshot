import { MarketingIslandBoundary } from "./marketing-island-boundary";
import { ExitIntentPopup } from "./exit-intent-popup";
import type { ComponentProps } from "react";

type ExitIntentPopupIslandProps = ComponentProps<typeof ExitIntentPopup>;

/**
 * Combines MarketingIslandBoundary and ExitIntentPopup into a single React
 * component so that both run in the same React tree when hydrated via
 * client:only="react" in Astro.
 *
 * Astro's client:only slot children are not independently hydrated — they
 * render as static HTML without event handlers. Passing ExitIntentPopup as a
 * slotted child of MarketingIslandBoundary (with client:only on the boundary)
 * meant the popup never mounted: no exit-intent listener was ever attached, so
 * the popup never appeared in production. Wrapping both into one React
 * component fixes that — the error boundary wraps live React state and the
 * popup's effects run on hydration.
 */
export function ExitIntentPopupIsland(props: ExitIntentPopupIslandProps) {
  return (
    <MarketingIslandBoundary sectionName="Signup popup">
      <ExitIntentPopup {...props} />
    </MarketingIslandBoundary>
  );
}
