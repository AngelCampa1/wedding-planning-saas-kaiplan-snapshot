import { MarketingIslandBoundary } from "./marketing-island-boundary";
import { FilterChips } from "./filter-chips";
import type { ComponentProps } from "react";

type FilterChipsIslandProps = ComponentProps<typeof FilterChips>;

/**
 * Combines MarketingIslandBoundary and FilterChips into a single React
 * component so that both run in the same React tree when hydrated via
 * client:load in Astro.
 *
 * Astro's client:load slot children are not independently hydrated — they
 * render as static HTML without event handlers. Passing FilterChips as a
 * slotted child of MarketingIslandBoundary (with client:load on the boundary)
 * meant filter and sort state never updated: useState never ran. Wrapping both
 * into one React component fixes that — the error boundary wraps live React
 * state and filtering works on hydration.
 */
export function FilterChipsIsland(props: FilterChipsIslandProps) {
  return (
    <MarketingIslandBoundary sectionName="Content filters">
      <FilterChips {...props} />
    </MarketingIslandBoundary>
  );
}
