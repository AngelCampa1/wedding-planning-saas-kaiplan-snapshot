interface WidgetLoadErrorProps {
  title: string;
  /**
   * Deliberately ignored. Load failures can include backend or network details,
   * so widgets always render the customer-safe fallback below.
   */
  message?: string;
}

export function WidgetLoadError({ title }: WidgetLoadErrorProps) {
  return (
    <div
      className="rounded-lg border border-border bg-muted/10 p-4"
      role="alert"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted">
        Refresh the page and try again. If the problem continues, contact
        support.
      </p>
    </div>
  );
}
