import { type ComponentProps, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type MetricTone = "neutral" | "primary" | "accent" | "success" | "warning";

const toneClasses: Record<MetricTone, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
};

export interface MetricItem {
  label: string;
  value: ReactNode;
  tone?: MetricTone;
}

interface MetricStripProps extends ComponentProps<"div"> {
  items: MetricItem[];
  columns?: "auto" | 4 | 5;
}

export function MetricStrip({
  items,
  columns = "auto",
  className,
  ...props
}: MetricStripProps) {
  const columnClass =
    columns === 4
      ? "sm:grid-cols-4"
      : columns === 5
        ? "sm:grid-cols-5"
        : "sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]";

  return (
    <div
      className={cn("grid grid-cols-2 gap-3", columnClass, className)}
      data-slot="metric-strip"
      {...props}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-card border border-border bg-card px-4 py-3 shadow-card"
        >
          <p className="truncate text-xs font-medium text-muted-foreground">
            {item.label}
          </p>
          {/*
            Currency values must never break mid-token — `break-words` split
            "$32,920.00" across two lines in the 5-column layout. Truncate
            instead, and step the size up only once there is room for it.
          */}
          <p
            className={cn(
              "mt-2 truncate font-heading text-xl leading-tight tabular-nums",
              toneClasses[item.tone ?? "neutral"],
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
