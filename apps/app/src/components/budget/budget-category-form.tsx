import { useEffect, useState } from "react";
import type {
  BudgetCategory,
  CreateBudgetCategoryInput,
} from "@kaiplan/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { centsToDollars, dollarsToCents } from "../../lib/format-money";
import { HelpFieldLabel } from "../guidance/help-field-label";

interface BudgetCategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateBudgetCategoryInput) => void;
  initialValues?: Partial<BudgetCategory>;
  isSubmitting?: boolean;
}

export function BudgetCategoryForm({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  isSubmitting = false,
}: BudgetCategoryFormProps) {
  const [name, setName] = useState("");
  const [estimated, setEstimated] = useState("");
  const [nameError, setNameError] = useState("");

  const isEdit = !!initialValues?.name;

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? "");
      setEstimated(
        initialValues?.estimatedCents != null
          ? centsToDollars(initialValues.estimatedCents)
          : "",
      );
      setNameError("");
    }
  }, [open, initialValues?.name, initialValues?.estimatedCents]);

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
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "Add category"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the category name and budget."
              : "Create a new budget category."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Photography"
              aria-invalid={nameError ? true : undefined}
            />
            {nameError && (
              <p className="text-xs text-destructive" role="alert">
                {nameError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <HelpFieldLabel
              htmlFor="category-estimated"
              help="A rough spending target for this whole category."
              hint="Start with your best guess; you can adjust it later."
            >
              Estimated budget ($)
            </HelpFieldLabel>
            <Input
              id="category-estimated"
              type="number"
              min="0"
              step="0.01"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
