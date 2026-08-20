import { useEffect, useMemo, useState } from "react";
import type {
  BudgetCategory,
  VendorPaymentType,
  VendorQuoteStatus,
} from "@kaiplan/shared";
import { formatMoney, dollarsToCents } from "../../lib/format-money";
import {
  useVendorDetail,
  useUpdateVendor,
  useDeleteVendor,
  useCreateVendorQuote,
  useDeleteVendorQuote,
  useCreateVendorPayment,
  useDeleteVendorPayment,
} from "../../hooks/use-vendors";
import { useBudgetItems } from "../../hooks/use-budget";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { VendorForm } from "./vendor-form";

interface VendorDetailPanelProps {
  weddingId: string;
  vendorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: BudgetCategory[];
  canMutate?: boolean;
}

type DeleteTarget =
  | { type: "vendor"; vendorId: string; vendorName: string }
  | { type: "quote"; quoteId: string }
  | { type: "payment"; paymentId: string };

export function VendorDetailPanel({
  weddingId,
  vendorId,
  open,
  onOpenChange,
  categories,
  canMutate = true,
}: VendorDetailPanelProps) {
  const {
    data: vendor,
    isLoading: vendorLoading,
    isError: vendorError,
    refetch: refetchVendor,
  } = useVendorDetail(weddingId, vendorId);
  const updateVendor = useUpdateVendor(weddingId);
  const deleteVendor = useDeleteVendor(weddingId);
  const createQuote = useCreateVendorQuote(weddingId, vendorId ?? "");
  const deleteQuote = useDeleteVendorQuote(weddingId, vendorId ?? "");
  const acceptedQuote = useMemo(
    () => vendor?.quotes.find((quote) => quote.status === "accepted") ?? null,
    [vendor],
  );
  const createPayment = useCreateVendorPayment(
    weddingId,
    vendorId ?? "",
    acceptedQuote?.id ?? "",
  );
  const deletePayment = useDeleteVendorPayment(
    weddingId,
    vendorId ?? "",
    acceptedQuote?.id ?? "",
  );
  const { data: budgetItems = [] } = useBudgetItems(
    weddingId,
    vendor?.categoryId ?? null,
  );

  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteAmountError, setQuoteAmountError] = useState<string | null>(null);
  const [quoteDate, setQuoteDate] = useState("");
  const [quoteStatus, setQuoteStatus] = useState<VendorQuoteStatus>("pending");
  const [quoteBudgetItemId, setQuoteBudgetItemId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAmountError, setPaymentAmountError] = useState<string | null>(
    null,
  );
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentType, setPaymentType] = useState<VendorPaymentType>("deposit");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setDeleteTarget(null);
    setIsDeletePending(false);
  }, [open, vendorId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-6 overflow-y-auto sm:max-w-2xl">
        {vendorLoading && (
          <>
            <SheetHeader>
              <SheetTitle className="font-heading">
                Loading vendor details
              </SheetTitle>
              <SheetDescription>
                Fetching quotes, contract status, and payments.
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 sm:grid-cols-4">
              {["Contract", "Quotes", "Accepted total", "Paid"].map((label) => (
                <div
                  key={label}
                  className="rounded-card border border-border bg-card p-3"
                >
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <div className="mt-2 h-5 w-16 rounded-control bg-muted" />
                </div>
              ))}
            </div>
          </>
        )}

        {vendorError && !vendorLoading && (
          <>
            <SheetHeader>
              <SheetTitle className="font-heading">
                Couldn&apos;t load this vendor
              </SheetTitle>
              <SheetDescription>
                The vendor list is still available. Retry to load quotes,
                contract status, and payments.
              </SheetDescription>
            </SheetHeader>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => {
                void refetchVendor();
              }}
            >
              Retry vendor details
            </Button>
          </>
        )}

        {!vendor && !vendorLoading && !vendorError ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-heading">Select a vendor</SheetTitle>
              <SheetDescription>
                Choose a vendor from the list to see details.
              </SheetDescription>
            </SheetHeader>
          </>
        ) : null}

        {vendor && (
          <>
            <SheetHeader>
              <SheetTitle className="font-heading">
                {vendor.companyName}
              </SheetTitle>
              <SheetDescription>
                {vendor.primaryContactName} / {vendor.categoryName}
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard
                label="Contract"
                value={vendor.contractStatus}
                capitalize
              />
              <StatCard
                label="Quotes"
                value={vendor.quotes.length.toString()}
              />
              <StatCard
                label="Accepted total"
                value={
                  acceptedQuote ? formatMoney(acceptedQuote.amountCents) : "-"
                }
              />
              <StatCard
                label="Paid"
                value={
                  acceptedQuote
                    ? formatMoney(
                        acceptedQuote.payments.reduce(
                          (sum, payment) => sum + payment.amountCents,
                          0,
                        ),
                      )
                    : "-"
                }
              />
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Contact</h3>
                  <p className="text-sm text-muted">
                    {vendor.email ?? "No email"} / {vendor.phone ?? "No phone"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {canMutate ? (
                    <Button
                      variant="outline"
                      onClick={() => setEditOpen(true)}
                      data-testid="edit-vendor-button"
                    >
                      Edit
                    </Button>
                  ) : null}
                  <Select
                    aria-label="Contract status"
                    value={vendor.contractStatus}
                    disabled={!canMutate}
                    onChange={(e) =>
                      updateVendor.mutate({
                        vendorId: vendor.id,
                        data: {
                          contractStatus: e.target.value as
                            | "none"
                            | "sent"
                            | "signed",
                        },
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="sent">Sent</option>
                    <option value="signed">Signed</option>
                  </Select>
                  {canMutate ? (
                    <Button
                      variant="destructive"
                      onClick={() =>
                        setDeleteTarget({
                          type: "vendor",
                          vendorId: vendor.id,
                          vendorName: vendor.companyName,
                        })
                      }
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
              {vendor.contractUrl && (
                <a
                  href={vendor.contractUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
                >
                  Open contract
                </a>
              )}
            </div>

            <div className="rounded-xl border border-border p-4">
              <h3 className="font-semibold text-foreground">Quotes</h3>
              <div className="mt-4 space-y-4">
                {vendor.quotes.map((quote) => (
                  <div
                    key={quote.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {formatMoney(quote.amountCents)}
                        </p>
                        <p className="text-sm capitalize text-muted">
                          {quote.status} / {quote.quotedAt}
                        </p>
                        {quote.budgetItemId && (
                          <p className="text-xs text-muted">
                            Linked budget item:{" "}
                            {budgetItems.find(
                              (i) => i.id === quote.budgetItemId,
                            )?.name ?? quote.budgetItemId}
                          </p>
                        )}
                      </div>
                      {canMutate ? (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setDeleteTarget({
                              type: "quote",
                              quoteId: quote.id,
                            })
                          }
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    {quote.payments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {quote.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between rounded-md bg-muted/10 px-3 py-2 text-sm"
                          >
                            <span className="capitalize">
                              {payment.paymentType} / {payment.paidAt}
                            </span>
                            <div className="flex items-center gap-3">
                              <span>{formatMoney(payment.amountCents)}</span>
                              {canMutate && acceptedQuote?.id === quote.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setDeleteTarget({
                                      type: "payment",
                                      paymentId: payment.id,
                                    })
                                  }
                                >
                                  Delete
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canMutate ? (
                <form
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const amountCents = getPositiveMoneyCents(quoteAmount);
                    if (amountCents === null) {
                      setQuoteAmountError(
                        "Enter a quote amount greater than $0.00.",
                      );
                      return;
                    }
                    createQuote.mutate({
                      amountCents,
                      quotedAt: quoteDate,
                      status: quoteStatus,
                      budgetItemId: quoteBudgetItemId || null,
                    });
                    setQuoteAmount("");
                    setQuoteDate("");
                    setQuoteStatus("pending");
                    setQuoteBudgetItemId("");
                  }}
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="quote-amount">Quote amount ($)</Label>
                    <Input
                      id="quote-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={quoteAmount}
                      aria-invalid={quoteAmountError ? true : undefined}
                      aria-describedby={
                        quoteAmountError ? "quote-amount-error" : undefined
                      }
                      onChange={(event) => {
                        setQuoteAmount(event.target.value);
                        setQuoteAmountError(null);
                      }}
                    />
                    {quoteAmountError && (
                      <p
                        id="quote-amount-error"
                        className="text-sm text-destructive"
                      >
                        {quoteAmountError}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="quote-date">Quoted at</Label>
                    <Input
                      id="quote-date"
                      type="date"
                      value={quoteDate}
                      onChange={(event) => setQuoteDate(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="quote-status">Status</Label>
                    <Select
                      id="quote-status"
                      className="h-10"
                      value={quoteStatus}
                      onChange={(event) =>
                        setQuoteStatus(event.target.value as VendorQuoteStatus)
                      }
                    >
                      <option value="pending">Pending</option>
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="quote-budget-item">Budget item</Label>
                    <Select
                      id="quote-budget-item"
                      className="h-10"
                      value={quoteBudgetItemId}
                      onChange={(event) =>
                        setQuoteBudgetItemId(event.target.value)
                      }
                    >
                      <option value="">No link</option>
                      {budgetItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={!quoteAmount || !quoteDate}>
                      Add quote
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>

            {canMutate && acceptedQuote && (
              <div className="rounded-xl border border-border p-4">
                <h3 className="font-semibold text-foreground">Payments</h3>
                <form
                  className="mt-4 grid gap-3 sm:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const amountCents = getPositiveMoneyCents(paymentAmount);
                    if (amountCents === null) {
                      setPaymentAmountError(
                        "Enter a payment amount greater than $0.00.",
                      );
                      return;
                    }
                    createPayment.mutate({
                      paymentType,
                      amountCents,
                      paidAt: paymentDate,
                    });
                    setPaymentType("deposit");
                    setPaymentAmount("");
                    setPaymentDate("");
                  }}
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="payment-type">Payment type</Label>
                    <Select
                      id="payment-type"
                      className="h-10"
                      value={paymentType}
                      onChange={(event) =>
                        setPaymentType(event.target.value as VendorPaymentType)
                      }
                    >
                      <option value="deposit">Deposit</option>
                      <option value="installment">Installment</option>
                      <option value="final">Final</option>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="payment-amount">Amount ($)</Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      aria-invalid={paymentAmountError ? true : undefined}
                      aria-describedby={
                        paymentAmountError ? "payment-amount-error" : undefined
                      }
                      onChange={(event) => {
                        setPaymentAmount(event.target.value);
                        setPaymentAmountError(null);
                      }}
                    />
                    {paymentAmountError && (
                      <p
                        id="payment-amount-error"
                        className="text-sm text-destructive"
                      >
                        {paymentAmountError}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="payment-date">Paid at</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button
                      type="submit"
                      disabled={!paymentAmount || !paymentDate}
                    >
                      Add payment
                    </Button>
                  </div>
                </form>
              </div>
            )}
            <Dialog
              open={deleteTarget !== null}
              onOpenChange={(open) => {
                if (!open) {
                  setDeleteTarget(null);
                  setIsDeletePending(false);
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {deleteTarget?.type === "vendor"
                      ? `Delete ${deleteTarget.vendorName}?`
                      : deleteTarget?.type === "quote"
                        ? "Remove this quote?"
                        : "Delete this payment?"}
                  </DialogTitle>
                  <DialogDescription>
                    {deleteTarget?.type === "vendor"
                      ? "This permanently removes the vendor, quotes, and related payments from this wedding."
                      : deleteTarget?.type === "quote"
                        ? "This permanently removes the quote and any payments attached to it."
                        : "This permanently removes the recorded payment from the accepted quote."}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteTarget(null)}
                    disabled={isDeletePending || !canMutate}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isDeletePending || !canMutate}
                    onClick={() => {
                      setIsDeletePending(true);

                      if (deleteTarget!.type === "vendor") {
                        deleteVendor.mutate(deleteTarget!.vendorId, {
                          onSuccess: () => {
                            setDeleteTarget(null);
                            setIsDeletePending(false);
                            onOpenChange(false);
                          },
                          onError: () => setIsDeletePending(false),
                        });
                        return;
                      }

                      if (deleteTarget!.type === "quote") {
                        deleteQuote.mutate(deleteTarget!.quoteId, {
                          onSuccess: () => {
                            setDeleteTarget(null);
                            setIsDeletePending(false);
                          },
                          onError: () => setIsDeletePending(false),
                        });
                        return;
                      }

                      deletePayment.mutate(deleteTarget!.paymentId, {
                        onSuccess: () => {
                          setDeleteTarget(null);
                          setIsDeletePending(false);
                        },
                        onError: () => setIsDeletePending(false),
                      });
                    }}
                  >
                    {deleteTarget?.type === "vendor"
                      ? "Delete vendor"
                      : deleteTarget?.type === "quote"
                        ? "Remove quote"
                        : "Delete payment"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {canMutate ? (
              <VendorForm
                open={editOpen}
                onOpenChange={setEditOpen}
                categories={categories}
                initialValues={vendor}
                onSubmit={(data) => {
                  updateVendor.mutate(
                    { vendorId: vendor.id, data },
                    { onSuccess: () => setEditOpen(false) },
                  );
                }}
                isSubmitting={updateVendor.isPending}
              />
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function getPositiveMoneyCents(value: string) {
  if (!value.trim()) {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const cents = dollarsToCents(value);
  return cents > 0 && Number.isFinite(cents) ? cents : null;
}

function StatCard({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold text-foreground ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
