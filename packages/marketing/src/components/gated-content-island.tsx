import { MarketingIslandBoundary } from "./marketing-island-boundary";
import { GatedContent } from "./gated-content";
import type { ComponentProps } from "react";

type GatedContentIslandProps = ComponentProps<typeof GatedContent>;

/**
 * Combines MarketingIslandBoundary and GatedContent into a single React
 * component so that both run in the same React tree when hydrated via
 * client:load in Astro.
 *
 * Astro's client:load slot children are not independently hydrated — they
 * render as static HTML without event handlers. Passing GatedContent as a
 * slotted child of MarketingIslandBoundary (with client:load on the boundary)
 * meant the form never mounted: Turnstile was never injected and submit
 * handlers never ran. Wrapping both into one React component fixes that — the
 * error boundary wraps live React state and the form's effects run on hydration.
 */
export function GatedContentIsland(props: GatedContentIslandProps) {
  return (
    <MarketingIslandBoundary sectionName="Lead magnet signup">
      <GatedContent {...props} />
    </MarketingIslandBoundary>
  );
}
