import { useEffect, useState } from "react";
import type { BudgetCategory, VendorDetail } from "@kaiplan/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { HelpFieldLabel } from "../guidance/help-field-label";

interface VendorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
  categories: BudgetCategory[];
  initialValues?: Partial<VendorDetail> | null;
  isSubmitting?: boolean;
}

export function VendorForm({
  open,
  onOpenChange,
  onSubmit,
  categories,
  initialValues,
  isSubmitting = false,
}: VendorFormProps) {
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [contractStatus, setContractStatus] = useState("none");
  const [contractUrl, setContractUrl] = useState("");
  const [contractSentAt, setContractSentAt] = useState("");
  const [contractSignedAt, setContractSignedAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setPrimaryContactName(initialValues?.primaryContactName ?? "");
    setCompanyName(initialValues?.companyName ?? "");
    setEmail(initialValues?.email ?? "");
    setPhone(initialValues?.phone ?? "");
    setCategoryId(initialValues?.categoryId ?? categories[0]?.id ?? "");
    setContractStatus(initialValues?.contractStatus ?? "none");
    setContractUrl(initialValues?.contractUrl ?? "");
    setContractSentAt((initialValues?.contractSentAt ?? "").slice(0, 10));
    setContractSignedAt((initialValues?.contractSignedAt ?? "").slice(0, 10));
    setNotes(initialValues?.notes ?? "");
  }, [open, initialValues, categories]);

  const isEdit = !!initialValues?.id;
  const hasCategories = categories.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit vendor" : "Add vendor"}</DialogTitle>
          <DialogDescription>
            Manage vendor contacts, contract status, and linked category.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!hasCategories) {
              return;
            }
            onSubmit({
              primaryContactName,
              companyName,
              email: email || null,
              phone: phone || null,
              categoryId,
              contractStatus,
              contractUrl: contractUrl || null,
              contractSentAt: contractSentAt || null,
              contractSignedAt: contractSignedAt || null,
              notes: notes || null,
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-contact">Primary contact</Label>
            <Input
              id="vendor-contact"
              value={primaryContactName}
              onChange={(event) => setPrimaryContactName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-company">Company</Label>
            <Input
              id="vendor-company"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-email">Email</Label>
            <Input
              id="vendor-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-phone">Phone</Label>
            <Input
              id="vendor-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <HelpFieldLabel
              htmlFor="vendor-category"
              help="Linking a vendor to a budget category keeps quotes and payments in the right place."
              hint="Create the category first if this list is empty."
            >
              Budget category
            </HelpFieldLabel>
            <select
              id="vendor-category"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={categoryId}
              disabled={!hasCategories}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {hasCategories ? (
                categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))
              ) : (
                <option value="">Create a budget category first</option>
              )}
            </select>
            {!hasCategories ? (
              <p className="text-xs text-muted">
                <a href="/budget" className="underline hover:text-foreground">
                  Create a budget category
                </a>{" "}
                first to save this vendor.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <HelpFieldLabel
              htmlFor="vendor-contract-status"
              help="Use this to remember whether a contract is missing, sent, or signed."
              hint="This is only a tracker; it does not send or sign contracts."
            >
              Contract status
            </HelpFieldLabel>
            <select
              id="vendor-contract-status"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={contractStatus}
              onChange={(event) => setContractStatus(event.target.value)}
            >
              <option value="none">None</option>
              <option value="sent">Sent</option>
              <option value="signed">Signed</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <HelpFieldLabel
              htmlFor="vendor-contract-url"
              help="Paste a link to the contract or shared document if you have one."
              hint="Leave it blank if the contract is only in email or on paper."
            >
              Contract URL
            </HelpFieldLabel>
            <Input
              id="vendor-contract-url"
              value={contractUrl}
              onChange={(event) => setContractUrl(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-contract-sent">Contract sent</Label>
            <Input
              id="vendor-contract-sent"
              type="date"
              value={contractSentAt}
              onChange={(event) => setContractSentAt(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-contract-signed">Contract signed</Label>
            <Input
              id="vendor-contract-signed"
              type="date"
              value={contractSignedAt}
              onChange={(event) => setContractSignedAt(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="vendor-notes">Notes</Label>
            <textarea
              id="vendor-notes"
              className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !hasCategories}>
              {isSubmitting ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
