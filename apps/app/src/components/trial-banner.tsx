import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import { StatusBanner } from "./ui/status-banner";

interface TrialBannerProps {
  days: number | null;
}

export function TrialBanner({ days }: TrialBannerProps) {
  if (days === null) {
    return null;
  }

  if (days >= 10) {
    return (
      <StatusBanner
        tone="success"
        action={{ to: "/subscribe", label: "Choose a plan" }}
      >
        Your {TRIAL_DURATION_DAYS}-day free trial is active. {days} days
        remaining.
      </StatusBanner>
    );
  }

  if (days >= 3) {
    return (
      <StatusBanner
        tone="warning"
        action={{ to: "/subscribe", label: "Choose a plan" }}
      >
        Your free trial ends in {days} days. Don&apos;t lose your planning data.
      </StatusBanner>
    );
  }

  const urgentText =
    days === 0
      ? "Your trial ends today."
      : days === 1
        ? "Your trial ends tomorrow."
        : `Your trial ends in ${days} days.`;

  return (
    <StatusBanner
      tone="destructive"
      action={{ to: "/subscribe", label: "Subscribe now" }}
    >
      {urgentText}
    </StatusBanner>
  );
}
