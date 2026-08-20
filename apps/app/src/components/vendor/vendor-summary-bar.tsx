import type { VendorSummary } from "@kaiplan/shared";
import { formatMoney } from "../../lib/format-money";
import { MetricStrip, type MetricItem } from "../ui/metric-strip";

interface VendorSummaryBarProps {
  summary: VendorSummary;
}

export function VendorSummaryBar({ summary }: VendorSummaryBarProps) {
  const stats: MetricItem[] = [
    { label: "Tracked vendors", value: summary.totalVendors.toString() },
    { label: "Pending quotes", value: summary.pendingQuotes.toString() },
    { label: "Signed contracts", value: summary.signedContracts.toString() },
    { label: "Paid", value: formatMoney(summary.totalPaidCents) },
    {
      label: "Outstanding",
      value: formatMoney(summary.totalOutstandingCents),
      tone: "accent",
    },
  ];

  return <MetricStrip items={stats} columns={5} />;
}
