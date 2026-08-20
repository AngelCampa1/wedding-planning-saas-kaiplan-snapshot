import type { BudgetCategoryWithTotals } from "@kaiplan/shared";
import { Plus } from "lucide-react";
import { BudgetCategoryCard } from "./budget-category-card";

interface BudgetCategoryGridProps {
  categories: BudgetCategoryWithTotals[];
  onSelectCategory: (id: string) => void;
  onAddCategory: () => void;
  canMutate?: boolean;
}

export function BudgetCategoryGrid({
  categories,
  onSelectCategory,
  onAddCategory,
  canMutate = true,
}: BudgetCategoryGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {categories.map((category) => (
        <BudgetCategoryCard
          key={category.id}
          category={category}
          onClick={() => onSelectCategory(category.id)}
        />
      ))}
      {canMutate ? (
        <button
          type="button"
          onClick={onAddCategory}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background p-5 text-muted transition-colors hover:border-primary/40 hover:text-primary"
          data-testid="add-category-card"
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm font-medium">Add category</span>
        </button>
      ) : null}
    </div>
  );
}
