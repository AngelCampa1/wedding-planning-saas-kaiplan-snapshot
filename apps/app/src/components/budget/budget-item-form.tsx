import { useState } from "react";
import type { BudgetItem, CreateBudgetItemInput } from "@kaiplan/shared";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { centsToDollars, dollarsToCents } from "../../lib/format-money";
import { HelpFieldLabel } from "../guidance/help-field-label";

interface BudgetItemFormProps {
  initialValues?: Partial<BudgetItem>;
  onSubmit: (data: CreateBudgetItemInput) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function BudgetItemForm({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: BudgetItemFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [estimated, setEstimated] = useState(
    initialValues?.estimatedCents != null
      ? centsToDollars(initialValues.estimatedCents)
      : "",
  );
  const [quoted, setQuoted] = useState(
    initialValues?.quotedCents != null
      ? centsToDollars(initialValues.quotedCents)
      : "",
  );
  const [paid, setPaid] = useState(
    initialValues?.paidCents != null
      ? centsToDollars(initialValues.paidCents)
      : "",
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [nameError, setNameError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Name is required");
      return;
    }
    setNameError("");
    onSubmit({
      name: trimmedName,
      estimatedCents: dollarsToCents(estimated),
      quotedCents: dollarsToCents(quoted),
      paidCents: dollarsToCents(paid),
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-name">Name</Label>
        <Input
          id="item-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Photographer deposit"
          aria-invalid={nameError ? true : undefined}
        />
        {nameError && (
          <p className="text-xs text-destructive" role="alert">
            {nameError}
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <HelpFieldLabel
            htmlFor="item-estimated"
            help="What you think this item may cost before you have a real quote."
            hint="It is okay to leave this as 0 until you know more."
          >
            Estimated ($)
          </HelpFieldLabel>
          <Input
            id="item-estimated"
            type="number"
            min="0"
            step="0.01"
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <HelpFieldLabel
            htmlFor="item-quoted"
            help="The amount a vendor actually quoted you for this item."
            hint="Use this for real numbers from emails, proposals, or contracts."
          >
            Quoted ($)
          </HelpFieldLabel>
          <Input
            id="item-quoted"
            type="number"
            min="0"
            step="0.01"
            value={quoted}
            onChange={(e) => setQuoted(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <HelpFieldLabel
            htmlFor="item-paid"
            help="Money already paid, such as deposits or installment payments."
            hint="This helps Kaiplan show what is still remaining."
          >
            Paid ($)
          </HelpFieldLabel>
          <Input
            id="item-paid"
            type="number"
            min="0"
            step="0.01"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-notes">Notes</Label>
        <textarea
          id="item-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          className="h-20 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
