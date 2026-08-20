import type { GuestSummary } from "@kaiplan/shared";
import { MetricStrip, type MetricItem } from "../ui/metric-strip";

interface GuestSummaryBarProps {
  summary: GuestSummary;
}

export function GuestSummaryBar({ summary }: GuestSummaryBarProps) {
  const pending = summary.byRsvp.pending + summary.byRsvp.invited;
  const items: MetricItem[] = [
    { label: "Total Guests", value: summary.totalGuests },
    { label: "Confirmed", value: summary.byRsvp.accepted, tone: "primary" },
    { label: "Pending", value: pending, tone: "accent" },
    { label: "Declined", value: summary.byRsvp.declined },
  ];

  return (
    <MetricStrip items={items} columns={4} data-testid="guest-summary-bar" />
  );
}
