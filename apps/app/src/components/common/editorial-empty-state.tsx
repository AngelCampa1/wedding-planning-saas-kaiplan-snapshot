import type { ReactNode } from "react";

interface EditorialEmptyStateProps {
  eyebrow: string;
  title: string;
  body: string;
  actions: ReactNode;
}

export function EditorialEmptyState({
  eyebrow,
  title,
  body,
  actions,
}: EditorialEmptyStateProps) {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-6 py-16 sm:py-24">
      <p className="font-body text-kicker text-muted-foreground">{eyebrow}</p>

      <h2
        className="heading-display font-heading text-foreground"
        style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
      >
        {title}
      </h2>

      <div aria-hidden className="rule-accent h-px w-16" />

      <p className="max-w-md font-body text-base text-muted-foreground">
        {body}
      </p>

      <div className="flex flex-wrap gap-3 pt-2">{actions}</div>
    </section>
  );
}
