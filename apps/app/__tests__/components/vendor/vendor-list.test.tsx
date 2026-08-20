import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorList } from "../../../src/components/vendor/vendor-list";

describe("VendorList", () => {
  it("renders vendors and notifies when a row is selected", async () => {
    const onSelectVendor = vi.fn();
    const user = userEvent.setup();

    render(
      <VendorList
        vendors={[
          {
            id: "vendor-1",
            weddingId: "wedding-1",
            categoryId: "cat-1",
            primaryContactName: "Sofia Ramos",
            companyName: "Golden Hour Photo",
            email: null,
            phone: null,
            contractStatus: "sent",
            contractUrl: null,
            contractSentAt: null,
            contractSignedAt: null,
            notes: null,
            sortOrder: 0,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            categoryName: "Photography",
            activeQuoteId: "quote-1",
            activeQuoteAmountCents: 250000,
            totalPaidCents: 50000,
            outstandingCents: 200000,
            quoteCount: 2,
          },
        ]}
        onSelectVendor={onSelectVendor}
      />,
    );

    expect(screen.getByText("Golden Hour Photo")).toBeInTheDocument();
    expect(screen.getByText("Photography")).toBeInTheDocument();
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    expect(screen.getByText("$2,000.00")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /golden hour photo/i }),
    );
    expect(onSelectVendor).toHaveBeenCalledWith("vendor-1");
  });

  it("shows fallback row data, contract variants, and empty state", () => {
    const { rerender } = render(
      <VendorList
        vendors={[
          {
            id: "vendor-1",
            weddingId: "wedding-1",
            categoryId: "cat-1",
            primaryContactName: "Sofia Ramos",
            companyName: "Golden Hour Photo",
            email: null,
            phone: null,
            contractStatus: "none",
            contractUrl: null,
            contractSentAt: null,
            contractSignedAt: null,
            notes: null,
            sortOrder: 0,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            categoryName: "Photography",
            activeQuoteId: null,
            activeQuoteAmountCents: null,
            totalPaidCents: 0,
            outstandingCents: 0,
            quoteCount: 0,
          },
          {
            id: "vendor-2",
            weddingId: "wedding-1",
            categoryId: "cat-2",
            primaryContactName: "",
            companyName: "Moonlight Florals",
            email: null,
            phone: null,
            contractStatus: "signed",
            contractUrl: null,
            contractSentAt: null,
            contractSignedAt: null,
            notes: null,
            sortOrder: 1,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            categoryName: "Florals",
            activeQuoteId: null,
            activeQuoteAmountCents: null,
            totalPaidCents: 0,
            outstandingCents: 0,
            quoteCount: 0,
          },
        ]}
        onSelectVendor={() => {}}
      />,
    );

    expect(screen.getAllByText("-")).toHaveLength(2);
    expect(screen.getByText("No contact yet")).toBeInTheDocument();
    expect(screen.getByText("signed")).toBeInTheDocument();

    rerender(<VendorList vendors={[]} onSelectVendor={() => {}} />);
    expect(screen.getByText("No vendors yet.")).toBeInTheDocument();
  });
});
