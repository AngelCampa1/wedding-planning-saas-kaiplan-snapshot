import { Component, type ReactNode } from "react";
import { captureException } from "../lib/sentry-client";
import { cn } from "../lib/utils";

interface MarketingIslandBoundaryProps {
  children: ReactNode;
  sectionName?: string;
  fallbackClassName?: string;
}

interface MarketingIslandBoundaryState {
  hasError: boolean;
}

export class MarketingIslandBoundary extends Component<
  MarketingIslandBoundaryProps,
  MarketingIslandBoundaryState
> {
  state: MarketingIslandBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    captureException(error);
  }

  private handleRefresh = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      const sectionName = this.props.sectionName ?? "This section";

      return (
        <div
          role="alert"
          className={cn(
            "rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-neutral-300)_55%,transparent)] bg-[color-mix(in_srgb,var(--surface-secondary)_88%,white)] p-4 text-left shadow-[var(--shadow-sm)]",
            this.props.fallbackClassName,
          )}
        >
          <p className="font-mono text-[length:var(--text-caption)] uppercase tracking-[0.22em] text-[var(--color-accent-700)]">
            Unavailable
          </p>
          <h3 className="mt-2 font-heading text-[length:var(--text-body-lg)] font-bold text-[var(--color-brand-text)]">
            Interactive section unavailable
          </h3>
          <p className="mt-2 text-[length:var(--text-caption)] leading-6 text-[var(--color-brand-muted)]">
            {sectionName} hit a problem before it could load. Refresh the page
            to try again.
          </p>
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-neutral-300)_70%,transparent)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-text)] transition-colors hover:border-[var(--color-accent-400)] hover:text-[var(--color-accent-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
            onClick={this.handleRefresh}
          >
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
