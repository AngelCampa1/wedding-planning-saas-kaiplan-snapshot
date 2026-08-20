import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorDetailPanel } from "../../../src/components/vendor/vendor-detail-panel";

vi.mock("../../../src/hooks/use-vendors", () => ({
  useVendorDetail: vi.fn(),
  useUpdateVendor: vi.fn(),
  useDeleteVendor: vi.fn(),
  useCreateVendorQuote: vi.fn(),
  useDeleteVendorQuote: vi.fn(),
  useCreateVendorPayment: vi.fn(),
  useDeleteVendorPayment: vi.fn(),
}));

vi.mock("../../../src/hooks/use-budget", () => ({
  useBudgetItems: vi.fn(),
}));

import {
  useVendorDetail,
  useUpdateVendor,
  useDeleteVendor,
  useCreateVendorQuote,
  useDeleteVendorQuote,
  useCreateVendorPayment,
  useDeleteVendorPayment,
} from "../../../src/hooks/use-vendors";
import { useBudgetItems } from "../../../src/hooks/use-budget";

const mutateUpdateVendor = vi.fn();
const mutateDeleteVendor = vi.fn();
const mutateCreateQuote = vi.fn();
const mutateDeleteQuote = vi.fn();
const mutateCreatePayment = vi.fn();
const mutateDeletePayment = vi.fn();

const vendor = {
  id: "vendor-1",
  weddingId: "wedding-1",
  categoryId: "cat-1",
  primaryContactName: "Sofia Ramos",
  companyName: "Golden Hour Photo",
  email: "hello@example.com",
  phone: "555-1234",
  contractStatus: "signed" as const,
  contractUrl: "https://example.com/contract",
  contractSentAt: "2026-04-01",
  contractSignedAt: "2026-04-05",
  notes: "Bring film backup",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  categoryName: "Photography",
  quotes: [
    {
      id: "quote-1",
      vendorId: "vendor-1",
      amountCents: 250000,
      quotedAt: "2026-03-20",
      status: "accepted" as const,
      budgetItemId: "item-1",
      notes: null,
      createdAt: "2026-03-20T00:00:00Z",
      updatedAt: "2026-03-20T00:00:00Z",
      payments: [
        {
          id: "payment-1",
          quoteId: "quote-1",
          paymentType: "deposit" as const,
          amountCents: 50000,
          paidAt: "2026-04-06",
          notes: null,
          createdAt: "2026-04-06T00:00:00Z",
          updatedAt: "2026-04-06T00:00:00Z",
        },
      ],
    },
    {
      id: "quote-2",
      vendorId: "vendor-1",
      amountCents: 275000,
      quotedAt: "2026-03-25",
      status: "pending" as const,
      budgetItemId: null,
      notes: null,
      createdAt: "2026-03-25T00:00:00Z",
      updatedAt: "2026-03-25T00:00:00Z",
      payments: [],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useVendorDetail).mockImplementation(
    (_weddingId, vendorId) =>
      ({
        data:
          vendorId === "vendor-2"
            ? {
                ...vendor,
                id: "vendor-2",
                companyName: "Moonlight Florals",
                primaryContactName: "Nora Bloom",
                quotes: [],
              }
            : vendor,
      }) as ReturnType<typeof useVendorDetail>,
  );
  vi.mocked(useUpdateVendor).mockReturnValue({
    mutate: mutateUpdateVendor,
  } as ReturnType<typeof useUpdateVendor>);
  vi.mocked(useDeleteVendor).mockReturnValue({
    mutate: mutateDeleteVendor,
  } as ReturnType<typeof useDeleteVendor>);
  vi.mocked(useCreateVendorQuote).mockReturnValue({
    mutate: mutateCreateQuote,
  } as ReturnType<typeof useCreateVendorQuote>);
  vi.mocked(useDeleteVendorQuote).mockReturnValue({
    mutate: mutateDeleteQuote,
  } as ReturnType<typeof useDeleteVendorQuote>);
  vi.mocked(useCreateVendorPayment).mockReturnValue({
    mutate: mutateCreatePayment,
  } as ReturnType<typeof useCreateVendorPayment>);
  vi.mocked(useDeleteVendorPayment).mockReturnValue({
    mutate: mutateDeletePayment,
  } as ReturnType<typeof useDeleteVendorPayment>);
  vi.mocked(useBudgetItems).mockReturnValue({
    data: [
      {
        id: "item-1",
        categoryId: "cat-1",
        name: "Photography package",
        estimatedCents: 250000,
        quotedCents: 250000,
        paidCents: 50000,
        notes: null,
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  } as ReturnType<typeof useBudgetItems>);
});

describe("VendorDetailPanel", () => {
  it("renders an empty prompt when the vendor detail is unavailable", () => {
    vi.mocked(useVendorDetail).mockReturnValue({
      data: undefined,
    } as ReturnType<typeof useVendorDetail>);

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    expect(screen.getByText("Select a vendor")).toBeInTheDocument();
    expect(
      screen.getByText("Choose a vendor from the list to see details."),
    ).toBeInTheDocument();
  });

  it("renders loading and error states for vendor details", async () => {
    const user = userEvent.setup();
    const refetchVendor = vi.fn();

    vi.mocked(useVendorDetail).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useVendorDetail>);

    const { rerender } = render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    expect(screen.getByText("Loading vendor details")).toBeInTheDocument();
    expect(screen.getByText("Accepted total")).toBeInTheDocument();

    vi.mocked(useVendorDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchVendor,
    } as ReturnType<typeof useVendorDetail>);

    rerender(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    expect(screen.getByText("Couldn't load this vendor")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Retry vendor details" }),
    );
    expect(refetchVendor).toHaveBeenCalledOnce();
  });

  it("renders vendor details and requires confirmation before deleting a vendor or quote", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={onOpenChange}
        categories={[]}
      />,
    );

    expect(screen.getByText("Golden Hour Photo")).toBeInTheDocument();
    expect(screen.getByText("Sofia Ramos / Photography")).toBeInTheDocument();
    expect(screen.getAllByText("$2,500.00")).toHaveLength(2);
    expect(screen.getAllByText("$500.00")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Open contract" })).toHaveAttribute(
      "href",
      "https://example.com/contract",
    );

    // The contract status is a 3-state select; vendor.contractStatus is "signed"
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Contract status" }),
      "sent",
    );
    expect(mutateUpdateVendor).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      data: { contractStatus: "sent" },
    });

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(
      screen.getByRole("heading", { name: "Remove this quote?" }),
    ).toBeInTheDocument();
    expect(mutateDeleteQuote).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove quote" }));
    expect(mutateDeleteQuote).toHaveBeenCalledWith(
      "quote-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    const [, quoteOptions] = mutateDeleteQuote.mock.calls[0] as [
      string,
      { onSuccess: () => void },
    ];
    quoteOptions.onSuccess();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Remove this quote?" }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(
      screen.getByRole("heading", { name: "Delete Golden Hour Photo?" }),
    ).toBeInTheDocument();
    expect(mutateDeleteVendor).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete vendor" }));
    expect(mutateDeleteVendor).toHaveBeenCalled();

    const deleteCall = mutateDeleteVendor.mock.calls[0];
    expect(deleteCall[0]).toBe("vendor-1");
    expect(deleteCall[1]).toEqual(
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );

    deleteCall[1].onSuccess();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders vendor details read-only when mutation is disabled", () => {
    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
        canMutate={false}
      />,
    );

    expect(screen.getByText("Golden Hour Photo")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-vendor-button")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^delete$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add quote/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add payment/i })).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Contract status" }),
    ).toBeDisabled();
  });

  it("submits new quotes and payments", async () => {
    const user = userEvent.setup();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    await user.type(screen.getByLabelText("Quote amount ($)"), "2500");
    await user.type(screen.getByLabelText("Quoted at"), "2026-04-07");
    await user.selectOptions(screen.getByLabelText("Status"), "accepted");
    await user.selectOptions(screen.getByLabelText("Budget item"), "item-1");
    await user.click(screen.getByRole("button", { name: "Add quote" }));

    expect(mutateCreateQuote).toHaveBeenCalledWith({
      amountCents: 250000,
      quotedAt: "2026-04-07",
      status: "accepted",
      budgetItemId: "item-1",
    });

    await user.selectOptions(screen.getByLabelText("Payment type"), "final");
    await user.type(screen.getByLabelText("Amount ($)"), "500");
    await user.type(screen.getByLabelText("Paid at"), "2026-04-08");
    await user.click(screen.getByRole("button", { name: "Add payment" }));

    expect(mutateCreatePayment).toHaveBeenCalledWith({
      paymentType: "final",
      amountCents: 50000,
      paidAt: "2026-04-08",
    });

    await user.click(screen.getAllByRole("button", { name: /^Delete$/ })[1]);
    expect(
      screen.getByRole("heading", { name: "Delete this payment?" }),
    ).toBeInTheDocument();
    expect(mutateDeletePayment).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete payment" }));
    expect(mutateDeletePayment).toHaveBeenCalledWith(
      "payment-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("shows validation feedback instead of submitting invalid quote money", async () => {
    const user = userEvent.setup();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    await user.type(screen.getByLabelText("Quote amount ($)"), "0");
    await user.type(screen.getByLabelText("Quoted at"), "2026-04-07");
    await user.click(screen.getByRole("button", { name: "Add quote" }));

    expect(mutateCreateQuote).not.toHaveBeenCalled();
    expect(
      screen.getByText("Enter a quote amount greater than $0.00."),
    ).toBeInTheDocument();
  });

  it("shows validation feedback instead of submitting invalid payment money", async () => {
    const user = userEvent.setup();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    await user.type(screen.getByLabelText("Amount ($)"), "0");
    await user.type(screen.getByLabelText("Paid at"), "2026-04-08");
    await user.click(screen.getByRole("button", { name: "Add payment" }));

    expect(mutateCreatePayment).not.toHaveBeenCalled();
    expect(
      screen.getByText("Enter a payment amount greater than $0.00."),
    ).toBeInTheDocument();
  });

  it("disables Add quote button when quoteDate is empty", async () => {
    const user = userEvent.setup();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    const addQuoteButton = screen.getByRole("button", { name: "Add quote" });

    // Initially disabled — both fields empty
    expect(addQuoteButton).toBeDisabled();

    // Only amount filled — still disabled
    await user.type(screen.getByLabelText("Quote amount ($)"), "1000");
    expect(addQuoteButton).toBeDisabled();

    // Both filled — enabled
    await user.type(screen.getByLabelText("Quoted at"), "2026-05-01");
    expect(addQuoteButton).not.toBeDisabled();
  });

  it("disables Add quote button when quoteAmount is empty", async () => {
    const user = userEvent.setup();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    const addQuoteButton = screen.getByRole("button", { name: "Add quote" });

    // Only date filled — still disabled
    await user.type(screen.getByLabelText("Quoted at"), "2026-05-01");
    expect(addQuoteButton).toBeDisabled();
  });

  it("lets the user back out of destructive vendor actions", async () => {
    const user = userEvent.setup();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(
      screen.getByRole("heading", { name: "Remove this quote?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mutateDeleteQuote).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: /^Delete$/ })[1]);
    expect(
      screen.getByRole("heading", { name: "Delete this payment?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mutateDeletePayment).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(
      screen.getByRole("heading", { name: "Delete Golden Hour Photo?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mutateDeleteVendor).not.toHaveBeenCalled();
  });

  it("closes a pending delete dialog when the panel switches to a different vendor", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(
      screen.getByRole("heading", { name: "Remove this quote?" }),
    ).toBeInTheDocument();

    rerender(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-2"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Remove this quote?" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps quote and payment delete dialogs open until deletion succeeds", async () => {
    const user = userEvent.setup();
    const deleteQuoteMutate = vi.fn(
      (_quoteId: string, options?: { onSuccess?: () => void }) => {
        expect(options?.onSuccess).toBeTypeOf("function");
      },
    );
    const deletePaymentMutate = vi.fn(
      (_paymentId: string, options?: { onSuccess?: () => void }) => {
        expect(options?.onSuccess).toBeTypeOf("function");
      },
    );

    vi.mocked(useDeleteVendorQuote).mockReturnValue({
      mutate: deleteQuoteMutate,
      isPending: true,
    } as ReturnType<typeof useDeleteVendorQuote>);
    vi.mocked(useDeleteVendorPayment).mockReturnValue({
      mutate: deletePaymentMutate,
      isPending: true,
    } as ReturnType<typeof useDeleteVendorPayment>);

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await user.click(screen.getByRole("button", { name: "Remove quote" }));

    expect(deleteQuoteMutate).toHaveBeenCalledWith(
      "quote-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Remove this quote?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove quote" })).toBeDisabled();

    const [, quoteOptions] = deleteQuoteMutate.mock.calls[0] as [
      string,
      { onSuccess: () => void },
    ];
    quoteOptions.onSuccess();

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Remove this quote?" }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getAllByRole("button", { name: /^Delete$/ })[1]);
    await user.click(screen.getByRole("button", { name: "Delete payment" }));

    expect(deletePaymentMutate).toHaveBeenCalledWith(
      "payment-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Delete this payment?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete payment" }),
    ).toBeDisabled();

    const [, paymentOptions] = deletePaymentMutate.mock.calls[0] as [
      string,
      { onSuccess: () => void },
    ];
    paymentOptions.onSuccess();

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Delete this payment?" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("re-enables the delete vendor button when vendor deletion fails", async () => {
    const user = userEvent.setup();
    const deleteVendorMutate = vi.fn(
      (
        _vendorId: string,
        options?: { onSuccess?: () => void; onError?: () => void },
      ) => {
        options?.onError?.();
      },
    );
    vi.mocked(useDeleteVendor).mockReturnValue({
      mutate: deleteVendorMutate,
      isPending: false,
    } as ReturnType<typeof useDeleteVendor>);
    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await user.click(screen.getByRole("button", { name: "Delete vendor" }));
    expect(deleteVendorMutate).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Delete Golden Hour Photo?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete vendor" }),
    ).not.toBeDisabled();
  });

  it("re-enables the remove quote button when quote deletion fails", async () => {
    const user = userEvent.setup();
    const deleteQuoteMutate = vi.fn(
      (
        _quoteId: string,
        options?: { onSuccess?: () => void; onError?: () => void },
      ) => {
        options?.onError?.();
      },
    );
    vi.mocked(useDeleteVendorQuote).mockReturnValue({
      mutate: deleteQuoteMutate,
      isPending: false,
    } as ReturnType<typeof useDeleteVendorQuote>);
    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await user.click(screen.getByRole("button", { name: "Remove quote" }));
    expect(deleteQuoteMutate).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Remove this quote?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove quote" }),
    ).not.toBeDisabled();
  });

  it("re-enables the delete payment button when payment deletion fails", async () => {
    const user = userEvent.setup();
    const deletePaymentMutate = vi.fn(
      (
        _paymentId: string,
        options?: { onSuccess?: () => void; onError?: () => void },
      ) => {
        options?.onError?.();
      },
    );
    vi.mocked(useDeleteVendorPayment).mockReturnValue({
      mutate: deletePaymentMutate,
      isPending: false,
    } as ReturnType<typeof useDeleteVendorPayment>);
    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: /^Delete$/ })[1]);
    await user.click(screen.getByRole("button", { name: "Delete payment" }));
    expect(deletePaymentMutate).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Delete this payment?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete payment" }),
    ).not.toBeDisabled();
  });

  it("closes the delete dialog when Escape is pressed", async () => {
    const user = userEvent.setup();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(
      screen.getByRole("heading", { name: "Remove this quote?" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Remove this quote?" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("renders fallback vendor states without an accepted quote", async () => {
    const user = userEvent.setup();

    vi.mocked(useVendorDetail).mockReturnValue({
      data: {
        ...vendor,
        primaryContactName: "Noelia Hart",
        companyName: "North Star Music",
        email: null,
        phone: null,
        contractStatus: "sent",
        contractUrl: null,
        quotes: [
          {
            ...vendor.quotes[1],
            budgetItemId: null,
            payments: [],
          },
        ],
      },
    } as ReturnType<typeof useVendorDetail>);

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId={null}
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    expect(screen.getByText("Noelia Hart / Photography")).toBeInTheDocument();
    expect(screen.getByText("No email / No phone")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open contract" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Accepted total").nextElementSibling,
    ).toHaveTextContent("-");
    expect(screen.getByText("Paid").nextElementSibling).toHaveTextContent("-");
    expect(
      screen.queryByRole("heading", { name: "Payments" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Linked budget item:/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Delete$/ })).toHaveLength(1);

    // The 3-state select; vendor contractStatus is "sent" for this mock
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Contract status" }),
      "signed",
    );
    expect(mutateUpdateVendor).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      data: { contractStatus: "signed" },
    });

    await user.type(screen.getByLabelText("Quote amount ($)"), "800");
    await user.type(screen.getByLabelText("Quoted at"), "2026-04-09");
    await user.click(screen.getByRole("button", { name: "Add quote" }));

    expect(mutateCreateQuote).toHaveBeenCalledWith({
      amountCents: 80000,
      quotedAt: "2026-04-09",
      status: "pending",
      budgetItemId: null,
    });
  });

  it("allows contract status to be set to any of none/sent/signed", async () => {
    const user = userEvent.setup();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open
        onOpenChange={() => {}}
        categories={[]}
      />,
    );

    const contractSelect = screen.getByRole("combobox", {
      name: "Contract status",
    });

    // Revert to none from signed
    await user.selectOptions(contractSelect, "none");
    expect(mutateUpdateVendor).toHaveBeenLastCalledWith({
      vendorId: "vendor-1",
      data: { contractStatus: "none" },
    });

    await user.selectOptions(contractSelect, "sent");
    expect(mutateUpdateVendor).toHaveBeenLastCalledWith({
      vendorId: "vendor-1",
      data: { contractStatus: "sent" },
    });

    await user.selectOptions(contractSelect, "signed");
    expect(mutateUpdateVendor).toHaveBeenLastCalledWith({
      vendorId: "vendor-1",
      data: { contractStatus: "signed" },
    });
  });

  it("opens the edit-vendor form and submits patches via updateVendor", async () => {
    const user = userEvent.setup();

    render(
      <VendorDetailPanel
        weddingId="wedding-1"
        vendorId="vendor-1"
        open={true}
        onOpenChange={() => {}}
        categories={[
          {
            id: "cat-1",
            weddingId: "wedding-1",
            name: "Photography",
            estimatedCents: 500000,
            sortOrder: 0,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ]}
      />,
    );

    await user.click(screen.getByTestId("edit-vendor-button"));

    const companyField = await screen.findByLabelText("Company");
    await user.clear(companyField);
    await user.type(companyField, "Golden Hour Studio");
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(mutateUpdateVendor).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: "vendor-1",
        data: expect.objectContaining({ companyName: "Golden Hour Studio" }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
