import type { ReactNode } from "react";
import { BrandLogo } from "../brand-logo";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  tagline: string;
  children: ReactNode;
  footer: ReactNode;
  sellPanel?: ReactNode;
}

export function AuthShell({
  eyebrow,
  title,
  tagline,
  children,
  footer,
  sellPanel,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-surface">
      {/*
        lg:grid-cols-[5fr_1px_7fr] — the middle 1px track renders a
        hairline vertical divider between the brand panel (5fr) and the
        form panel (7fr). Kept as an arbitrary value because the 1px
        divider is an intentional one-off visual, not a design-system
        spacing token.
      */}
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[5fr_1px_7fr]">
        {/* Brand panel */}
        <aside
          className={`relative hidden flex-col px-10 py-16 lg:flex ${sellPanel ? "gap-0" : "justify-between"}`}
        >
          <div>
            <BrandLogo className="h-12 w-auto" />
          </div>

          {sellPanel ? (
            sellPanel
          ) : (
            <>
              <blockquote className="max-w-md">
                <p
                  className="heading-display font-heading text-foreground"
                  style={{ fontSize: "clamp(1.875rem, 2.6vw, 2.5rem)" }}
                >
                  The wedding tool for couples who want to plan,{" "}
                  <span
                    style={{
                      fontStyle: "normal",
                      color: "var(--color-primary)",
                    }}
                  >
                    not be sold to.
                  </span>
                </p>
                <footer className="mt-6 flex items-center gap-3">
                  <span aria-hidden className="rule-primary h-px w-8" />
                  <cite className="font-body text-kicker not-italic text-muted-foreground">
                    Kaiplan, est. 2025
                  </cite>
                </footer>
              </blockquote>

              <div className="font-body text-kicker text-muted-foreground">
                Calm tools <span className="mx-2 opacity-50">·</span> Generous
                space
              </div>
            </>
          )}
        </aside>

        {/* Vertical rule */}
        <div aria-hidden className="rule-primary hidden lg:block" />

        {/* Form panel */}
        <main className="flex items-center justify-center px-6 py-12 sm:px-10 sm:py-16">
          <div className="w-full max-w-md">
            <p className="font-body text-kicker text-muted-foreground">
              {eyebrow}
            </p>
            <h1
              className="mt-3 font-heading text-foreground"
              style={{
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: "clamp(2.25rem, 4.5vw, 3.25rem)",
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
              }}
            >
              {title}
            </h1>
            <p className="mt-3 font-body text-base text-muted-foreground">
              {tagline}
            </p>

            <div className="mt-10">{children}</div>

            <div className="mt-10 font-body text-sm text-muted-foreground">
              {footer}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
