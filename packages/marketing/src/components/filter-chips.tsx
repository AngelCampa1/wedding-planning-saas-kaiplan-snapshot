import { useState, useCallback, useEffect, useRef } from "react";
import { clsx } from "clsx";
import type { FilterDef, SortOption, ContentItem } from "../types";

interface FilterChipsProps {
  filters?: FilterDef[];
  sortOptions?: SortOption[];
  defaultSort?: string;
  onFilterChange?: (activeFilters: Record<string, string>) => void;
  onSortChange?: (sort: string) => void;
  items: ContentItem[];
  onItemsFiltered?: (filtered: ContentItem[]) => void;
}

export function FilterChips({
  filters = [],
  sortOptions,
  defaultSort,
  onFilterChange,
  onSortChange,
  items,
  onItemsFiltered,
}: FilterChipsProps) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(
    {},
  );
  const [activeSort, setActiveSort] = useState(
    defaultSort ?? sortOptions?.[0]?.value ?? "",
  );

  const getFilteredItems = useCallback(
    (currentFilters: Record<string, string>) =>
      items.filter((item) =>
        Object.entries(currentFilters).every(([key, value]) => {
          if (key === "buyerStage") return item.buyerStage === value;
          if (key === "featured") return String(item.featured) === value;
          return item.metadata?.[key] === value;
        }),
      ),
    [items],
  );

  const handleFilterClick = useCallback(
    (filterId: string, value: string) => {
      setActiveFilters((prev) => {
        const next = { ...prev };
        if (next[filterId] === value) {
          delete next[filterId];
        } else {
          next[filterId] = value;
        }
        onFilterChange?.(next);
        onItemsFiltered?.(getFilteredItems(next));
        return next;
      });
    },
    [onFilterChange, onItemsFiltered, getFilteredItems],
  );

  const clearFilters = useCallback(() => {
    setActiveFilters({});
    onFilterChange?.({});
    onItemsFiltered?.(items);
  }, [onFilterChange, onItemsFiltered, items]);

  // Call onItemsFiltered on mount and whenever `items` changes so the caller
  // stays in sync when the parent passes a new array. Two refs prevent
  // re-firing when only the callback or filter identities change (e.g. inline
  // arrow functions), while `items` in the dep array triggers a re-sync on
  // actual data changes. Parents should memoize the items array to avoid
  // unnecessary re-renders.
  const renderItemsRef = useRef(onItemsFiltered);
  renderItemsRef.current = onItemsFiltered;
  const activeFiltersRef = useRef(activeFilters);
  activeFiltersRef.current = activeFilters;
  useEffect(() => {
    renderItemsRef.current?.(getFilteredItems(activeFiltersRef.current));
  }, [items, getFilteredItems]);

  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  const filteredCount = getFilteredItems(activeFilters).length;

  return (
    <div
      role="toolbar"
      aria-label="Filters"
      className="flex flex-wrap items-center mb-6"
      style={{ gap: "var(--component-gap-sm)" }}
    >
      {filters.map((filter) => (
        <div
          key={filter.id}
          role="group"
          aria-label={filter.label}
          className="flex items-center"
          style={{ gap: "var(--component-gap-sm)" }}
        >
          <span
            className="font-medium uppercase tracking-wider text-[var(--color-neutral-500)]"
            style={{ fontSize: "var(--text-caption)" }}
          >
            {filter.label}:
          </span>
          {filter.options.map((option) => {
            const isActive = activeFilters[filter.id] === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleFilterClick(filter.id, option.value)}
                className={clsx(
                  "inline-flex min-h-11 items-center transition-colors px-3 py-1 font-medium rounded-full border",
                  isActive
                    ? "bg-[var(--color-brand-primary)] text-[var(--surface-primary)] border-[var(--color-brand-primary)]"
                    : "bg-[var(--surface-primary)] text-[var(--color-brand-text)] border-[var(--color-neutral-200)]",
                )}
                style={{ fontSize: "var(--text-caption)" }}
                aria-pressed={isActive}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ))}

      {sortOptions && sortOptions.length > 1 && (
        <div className="flex items-center gap-1.5 ml-auto">
          <label
            htmlFor="content-sort"
            className="font-medium uppercase tracking-wider text-[var(--color-neutral-500)]"
            style={{ fontSize: "var(--text-caption)" }}
          >
            Sort results:
          </label>
          <select
            id="content-sort"
            value={activeSort}
            onChange={(e) => {
              setActiveSort(e.target.value);
              onSortChange?.(e.target.value);
            }}
            className="border border-[var(--color-neutral-200)] rounded px-2 py-1 text-base text-[var(--color-brand-text)] bg-[var(--surface-primary)] min-h-11 sm:text-[length:var(--text-caption)]"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {hasActiveFilters && (
        <div className="flex items-center gap-2">
          <span
            className="text-[var(--color-neutral-500)]"
            style={{ fontSize: "var(--text-caption)" }}
          >
            {filteredCount} of {items.length}
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="transition-colors underline text-[var(--color-brand-primary)] hover:opacity-75"
            style={{ fontSize: "var(--text-caption)" }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
