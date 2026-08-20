import { useEffect, useState } from "react";
import type { BudgetCategoryWithTotals, BudgetItem } from "@kaiplan/shared";
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
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../ui/sheet";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { formatMoney } from "../../lib/format-money";
import {
  useBudgetItems,
  useCreateItem,
  useUpdateItem,
  useDeleteItem,
  useUpdateCategory,
  useDeleteCategory,
} from "../../hooks/use-budget";
import { BudgetItemForm } from "./budget-item-form";
import { BudgetCategoryForm } from "./budget-category-form";

interface BudgetCategoryPanelProps {
  weddingId: string;
  category: BudgetCategoryWithTotals | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canMutate?: boolean;
}

type FormMode =
  | { type: "closed" }
  | { type: "add" }
  | { type: "edit"; item: BudgetItem };

export function BudgetCategoryPanel({
  weddingId,
  category,
  open,
  onOpenChange,
  canMutate = true,
}: BudgetCategoryPanelProps) {
  const [formMode, setFormMode] = useState<FormMode>({ type: "closed" });
  const [deleteTarget, setDeleteTarget] = useState<BudgetItem | null>(null);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [deleteCategoryOpen, setDeleteCategoryOpen] = useState(false);
  const [isDeleteCategoryPending, setIsDeleteCategoryPending] = useState(false);
  const updateCategory = useUpdateCategory(weddingId);
  const deleteCategory = useDeleteCategory(weddingId);

  const categoryId = category?.id ?? null;
  const {
    data: items,
    isError,
    refetch,
  } = useBudgetItems(weddingId, categoryId);
  const resolvedItems = items ?? [];

  const createItem = useCreateItem(weddingId, categoryId ?? "");
  const updateItem = useUpdateItem(weddingId, categoryId ?? "");
  const deleteItem = useDeleteItem(weddingId, categoryId ?? "");

  useEffect(() => {
    setDeleteTarget(null);
    setIsDeletePending(false);
  }, [categoryId, open]);

  if (!category) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading">{category.name}</SheetTitle>
          <SheetDescription>
            Budget: {formatMoney(category.estimatedCents)}
          </SheetDescription>
          {canMutate ? (
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditCategoryOpen(true)}
                data-testid="rename-category-button"
              >
                <Pencil className="h-4 w-4" />
                Rename
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteCategoryOpen(true)}
                data-testid="delete-category-button"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex gap-4 px-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted">Quoted</span>
            <span className="text-sm font-semibold text-foreground">
              {formatMoney(category.totalQuotedCents)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted">Paid</span>
            <span className="text-sm font-semibold text-foreground">
              {formatMoney(category.totalPaidCents)}
            </span>
          </div>
        </div>

        <div className="flex-1 px-4">
          {isError && !items ? (
            <div className="flex flex-col items-start gap-3 py-8">
              <p className="text-sm font-medium text-foreground">
                We couldn't load the items in this category.
              </p>
              <p className="text-sm text-muted">
                Please refresh and try again.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                Retry items
              </Button>
            </div>
          ) : resolvedItems.length === 0 && formMode.type === "closed" ? (
            <p
              className="py-8 text-center text-sm text-muted"
              data-testid="empty-items"
            >
              No items yet
            </p>
          ) : (
            <table className="w-full text-sm" data-testid="items-table">
              <thead>
                <tr className="border-b text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Est.</th>
                  <th className="pb-2 font-medium">Quoted</th>
                  <th className="pb-2 font-medium">Paid</th>
                  <th className="pb-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {resolvedItems.map((item) =>
                  canMutate &&
                  formMode.type === "edit" &&
                  formMode.item.id === item.id ? (
                    <tr key={item.id}>
                      <td colSpan={5} className="py-3">
                        <BudgetItemForm
                          key={item.id}
                          initialValues={item}
                          onSubmit={(data) => {
                            updateItem.mutate(
                              { itemId: item.id, data },
                              {
                                onSuccess: () =>
                                  setFormMode({ type: "closed" }),
                              },
                            );
                          }}
                          onCancel={() => setFormMode({ type: "closed" })}
                          isSubmitting={updateItem.isPending}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium text-foreground">
                        {item.name}
                      </td>
                      <td className="py-2 pr-2 text-muted">
                        {formatMoney(item.estimatedCents)}
                      </td>
                      <td className="py-2 pr-2 text-muted">
                        {formatMoney(item.quotedCents)}
                      </td>
                      <td className="py-2 pr-2 text-muted">
                        {formatMoney(item.paidCents)}
                      </td>
                      <td className="py-2">
                        {canMutate ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Actions for ${item.name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() =>
                                  setFormMode({ type: "edit", item })
                                }
                              >
                                <Pencil className="h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setDeleteTarget(item)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}

          {canMutate && formMode.type === "add" && (
            <div className="mt-4">
              <BudgetItemForm
                onSubmit={(data) => {
                  createItem.mutate(data, {
                    onSuccess: () => setFormMode({ type: "closed" }),
                  });
                }}
                onCancel={() => setFormMode({ type: "closed" })}
                isSubmitting={createItem.isPending}
              />
            </div>
          )}
        </div>

        {canMutate && formMode.type === "closed" && (
          <div className="px-4 pb-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setFormMode({ type: "add" })}
              data-testid="add-item-button"
            >
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          </div>
        )}

        <Dialog
          open={deleteTarget !== null}
          onOpenChange={() => {
            setDeleteTarget(null);
            setIsDeletePending(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete item?"}
              </DialogTitle>
              <DialogDescription>
                This will permanently remove this item from the budget category.
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
                  deleteItem.mutate(deleteTarget!.id, {
                    onSuccess: () => {
                      setDeleteTarget(null);
                      setIsDeletePending(false);
                    },
                    onError: () => setIsDeletePending(false),
                  });
                }}
              >
                Delete item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {canMutate ? (
          <BudgetCategoryForm
            open={editCategoryOpen}
            onOpenChange={setEditCategoryOpen}
            initialValues={category}
            onSubmit={(data) => {
              updateCategory.mutate(
                { categoryId: category.id, data },
                { onSuccess: () => setEditCategoryOpen(false) },
              );
            }}
            isSubmitting={updateCategory.isPending}
          />
        ) : null}

        <Dialog
          open={deleteCategoryOpen}
          onOpenChange={() => {
            setDeleteCategoryOpen(false);
            setIsDeleteCategoryPending(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{`Delete ${category.name}?`}</DialogTitle>
              <DialogDescription>
                This permanently removes the category and all of its budget
                items.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteCategoryOpen(false)}
                disabled={isDeleteCategoryPending || !canMutate}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleteCategoryPending || !canMutate}
                onClick={() => {
                  setIsDeleteCategoryPending(true);
                  deleteCategory.mutate(category.id, {
                    onSuccess: () => {
                      setDeleteCategoryOpen(false);
                      setIsDeleteCategoryPending(false);
                      onOpenChange(false);
                    },
                    onError: () => setIsDeleteCategoryPending(false),
                  });
                }}
              >
                Delete category
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
