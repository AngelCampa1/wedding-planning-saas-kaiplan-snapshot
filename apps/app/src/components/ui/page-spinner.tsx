import { cn } from "../../lib/utils";

interface PageSpinnerProps {
  /** When true, uses min-h-screen instead of h-screen (for scrollable pages). */
  minHeight?: boolean;
}

export function PageSpinner({ minHeight = false }: PageSpinnerProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-surface",
        minHeight ? "min-h-screen" : "h-screen",
      )}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}
