import type { VendorListItem } from "@kaiplan/shared";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "../../lib/format-money";
import { Badge } from "../ui/badge";

interface VendorListProps {
  vendors: VendorListItem[];
  onSelectVendor: (vendorId: string) => void;
}

function contractVariant(status: VendorListItem["contractStatus"]) {
  if (status === "signed") return "success";
  if (status === "sent") return "warning";
  return "neutral";
}

export function VendorList({ vendors, onSelectVendor }: VendorListProps) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
      <div className="md:overflow-x-auto">
        <div className="hidden min-w-[760px] grid-cols-[minmax(14rem,1.5fr)_minmax(9rem,1fr)_minmax(7rem,0.8fr)_minmax(9rem,1fr)_minmax(9rem,1fr)] gap-3 border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground md:grid">
          <span>Vendor</span>
          <span>Category</span>
          <span>Contract</span>
          <span>Accepted quote</span>
          <span>Outstanding</span>
        </div>
        <div className="divide-y divide-border">
          {vendors.map((vendor) => (
            <button
              key={vendor.id}
              type="button"
              onClick={() => onSelectVendor(vendor.id)}
              className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-primary/5 md:min-w-[760px] md:grid-cols-[minmax(14rem,1.5fr)_minmax(9rem,1fr)_minmax(7rem,0.8fr)_minmax(9rem,1fr)_minmax(9rem,1fr)]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {vendor.companyName}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {vendor.primaryContactName || "No contact yet"}
                </p>
              </div>
              <span className="min-w-0 text-sm text-foreground">
                <span className="mr-2 font-medium text-muted-foreground md:hidden">
                  Category
                </span>
                <span className="truncate">{vendor.categoryName}</span>
              </span>
              <span>
                <span className="mr-2 text-sm font-medium text-muted-foreground md:hidden">
                  Contract
                </span>
                <Badge
                  variant={contractVariant(vendor.contractStatus)}
                  className="capitalize"
                >
                  {vendor.contractStatus}
                </Badge>
              </span>
              <span className="text-sm text-foreground">
                <span className="mr-2 font-medium text-muted-foreground md:hidden">
                  Accepted
                </span>
                {vendor.activeQuoteAmountCents != null
                  ? formatMoney(vendor.activeQuoteAmountCents)
                  : "-"}
              </span>
              <span className="flex items-center justify-between gap-3 text-sm text-foreground">
                <span>
                  <span className="mr-2 font-medium text-muted-foreground md:hidden">
                    Outstanding
                  </span>
                  {formatMoney(vendor.outstandingCents)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground md:hidden" />
              </span>
            </button>
          ))}
        </div>
      </div>
      {vendors.length === 0 && (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          No vendors yet.
        </div>
      )}
    </div>
  );
}
