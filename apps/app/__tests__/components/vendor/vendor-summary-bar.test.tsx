import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VendorSummaryBar } from "../../../src/components/vendor/vendor-summary-bar";

describe("VendorSummaryBar", () => {
  it("renders all summary metrics", () => {
    render(
      <VendorSummaryBar
        summary={{
          totalVendors: 3,
          pendingQuotes: 1,
          signedContracts: 2,
          totalPaidCents: 175000,
          totalOutstandingCents: 95000,
        }}
      />,
    );

    expect(screen.getByText("Tracked vendors")).toBeInTheDocument();
    expect(screen.getByText("Pending quotes")).toBeInTheDocument();
    expect(screen.getByText("Signed contracts")).toBeInTheDocument();
    expect(screen.getByText("$1,750.00")).toBeInTheDocument();
    expect(screen.getByText("$950.00")).toBeInTheDocument();
  });
});
