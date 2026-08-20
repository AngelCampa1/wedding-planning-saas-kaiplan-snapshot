import { MarketingIslandBoundary } from "./marketing-island-boundary";
import { FeedbackWidget } from "./feedback-widget";

interface FeedbackWidgetIslandProps {
  apiUrl: string;
  turnstileSiteKey?: string;
}

/**
 * Combines MarketingIslandBoundary and FeedbackWidget into a single React
 * component so that both run in the same React tree when hydrated via
 * client:only="react" in Astro.
 *
 * Astro's client:only slot children are not independently hydrated — they
 * render as static HTML without event handlers. By wrapping the boundary and
 * the widget into one React component, the error boundary wraps live React
 * state and the button click handlers are correctly attached on hydration.
 */
export function FeedbackWidgetIsland({
  apiUrl,
  turnstileSiteKey,
}: FeedbackWidgetIslandProps) {
  return (
    <MarketingIslandBoundary sectionName="Feedback widget">
      <FeedbackWidget apiUrl={apiUrl} turnstileSiteKey={turnstileSiteKey} />
    </MarketingIslandBoundary>
  );
}
