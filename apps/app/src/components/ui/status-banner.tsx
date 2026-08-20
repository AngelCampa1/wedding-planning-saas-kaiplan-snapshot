import { Link, type LinkProps } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

type StatusBannerTone = "success" | "warning" | "destructive" | "info";

const toneClasses: Record<StatusBannerTone, string> = {
  success: "border-success/20 bg-success-soft text-success-soft-foreground",
  warning: "border-warning/20 bg-warning-soft text-warning-soft-foreground",
  destructive: "border-destructive/20 bg-destructive/8 text-destructive",
  info: "border-info/20 bg-info-soft text-info-soft-foreground",
};

interface StatusBannerProps {
  tone?: StatusBannerTone;
  children: ReactNode;
  action?: {
    label: string;
    to: LinkProps["to"];
  };
  className?: string;
}

export function StatusBanner({
  tone = "info",
  children,
  action,
  className,
}: StatusBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-2 border-b px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between",
        toneClasses[tone],
        className,
      )}
    >
      <div className="min-w-0 leading-6">{children}</div>
      {action ? (
        <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
          <Link to={action.to}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
