import type {
  ContentItem,
  BuyerStage,
  FilterDef,
  SortOption,
} from "@kaiplan/marketing";

export const BUYER_STAGE_FILTER: FilterDef = {
  id: "buyerStage",
  label: "Stage",
  options: [
    { value: "tofu", label: "Awareness" },
    { value: "mofu", label: "Consideration" },
    { value: "bofu", label: "Decision" },
  ],
};

export const DATE_SORT_OPTIONS: SortOption[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "az", label: "A-Z" },
];

export function filterByStage(
  items: ContentItem[],
  stage: BuyerStage,
): ContentItem[] {
  return items.filter((item) => item.buyerStage === stage);
}

export function filterByTag(items: ContentItem[], tag: string): ContentItem[] {
  return items.filter((item) => {
    const tags = item.metadata?.["tags"];
    if (!tags) return false;
    return tags.split(",").includes(tag);
  });
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalPages,
  };
}

