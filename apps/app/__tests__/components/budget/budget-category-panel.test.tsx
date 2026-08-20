import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BudgetCategoryPanel } from "../../../src/components/budget/budget-category-panel";
import type { BudgetCategoryWithTotals, BudgetItem } from "@kaiplan/shared";

vi.mock("../../../src/hooks/use-budget", () => ({
  useBudgetItems: vi.fn(),
  useCreateItem: vi.fn(),
  useUpdateItem: vi.fn(),
  useDeleteItem: vi.fn(),
  useUpdateCategory: vi.fn(),
  useDeleteCategory: vi.fn(),
}));

import {
  useBudgetItems,
  useCreateItem,
  useUpdateItem,
  useDeleteItem,
  useUpdateCategory,
  useDeleteCategory,
} from "../../../src/hooks/use-budget";

const mockUseBudgetItems = vi.mocked(useBudgetItems);
const mockUseCreateItem = vi.mocked(useCreateItem);
const mockUseUpdateItem = vi.mocked(useUpdateItem);
const mockUseDeleteItem = vi.mocked(useDeleteItem);
const mockUseUpdateCategory = vi.mocked(useUpdateCategory);
const mockUseDeleteCategory = vi.mocked(useDeleteCategory);

function makeCategory(
  overrides: Partial<BudgetCategoryWithTotals> = {},
): BudgetCategoryWithTotals {
  return {
    id: "cat-1",
    weddingId: "w-1",
    name: "Photography",
    estimatedCents: 500000,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    totalItemEstimatedCents: 400000,
    totalQuotedCents: 250000,
    totalPaidCents: 100000,
    itemCount: 2,
    ...overrides,
  };
}

function makeItem(overrides: Partial<BudgetItem> = {}): BudgetItem {
  return {
    id: "item-1",
    categoryId: "cat-1",
    name: "Photographer deposit",
    estimatedCents: 200000,
    quotedCents: 180000,
    paidCents: 90000,
    notes: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeMutationReturn(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    data: undefined,
    error: null,
    reset: vi.fn(),
    variables: undefined,
    status: "idle" as const,
    failureCount: 0,
    failureReason: null,
    context: undefined,
    submittedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCreateItem.mockReturnValue(
    makeMutationReturn() as ReturnType<typeof useCreateItem>,
  );
  mockUseUpdateItem.mockReturnValue(
    makeMutationReturn() as ReturnType<typeof useUpdateItem>,
  );
  mockUseDeleteItem.mockReturnValue(
    makeMutationReturn() as ReturnType<typeof useDeleteItem>,
  );
  mockUseUpdateCategory.mockReturnValue(
    makeMutationReturn() as ReturnType<typeof useUpdateCategory>,
  );
  mockUseDeleteCategory.mockReturnValue(
    makeMutationReturn() as ReturnType<typeof useDeleteCategory>,
  );
});

describe("BudgetCategoryPanel", () => {
  it("renders category name", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("Photography")).toBeInTheDocument();
  });

  it("hides mutation controls when mutation is disabled", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
        canMutate={false}
      />,
    );

    expect(screen.queryByTestId("rename-category-button")).toBeNull();
    expect(screen.queryByTestId("delete-category-button")).toBeNull();
    expect(screen.queryByTestId("add-item-button")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /actions for/i }),
    ).not.toBeInTheDocument();
  });

  it("renders items in table", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem(), makeItem({ id: "item-2", name: "Engagement shoot" })],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("Photographer deposit")).toBeInTheDocument();
    expect(screen.getByText("Engagement shoot")).toBeInTheDocument();
    expect(screen.getByTestId("items-table")).toBeInTheDocument();
  });

  it("shows empty state when no items", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByTestId("empty-items")).toHaveTextContent("No items yet");
  });

  it("shows an error state when category items fail to load", () => {
    mockUseBudgetItems.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(
      screen.getByText("We couldn't load the items in this category."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("empty-items")).not.toBeInTheDocument();
  });

  it("keeps existing items visible during a background refetch failure", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("Photographer deposit")).toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't load the items in this category."),
    ).not.toBeInTheDocument();
  });

  it("closes a pending delete dialog when the panel switches to a different category", async () => {
    const user = userEvent.setup();
    mockUseBudgetItems.mockImplementation(
      (_weddingId, categoryId) =>
        ({
          data:
            categoryId === "cat-2"
              ? [
                  makeItem({
                    id: "item-2",
                    categoryId: "cat-2",
                    name: "Florist deposit",
                  }),
                ]
              : [makeItem()],
          isLoading: false,
        }) as ReturnType<typeof useBudgetItems>,
    );

    const { rerender } = render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Actions for Photographer deposit" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(
      screen.getByRole("heading", { name: "Delete Photographer deposit?" }),
    ).toBeInTheDocument();

    rerender(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory({
          id: "cat-2",
          name: "Florals",
        })}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: "Delete Photographer deposit?",
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows add item button", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByTestId("add-item-button")).toBeInTheDocument();
  });

  it("returns null when category is null", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    const { container } = render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={null}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows quoted and paid stats", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory({
          totalQuotedCents: 250000,
          totalPaidCents: 100000,
        })}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
  });

  it("shows add item form when add button is clicked", async () => {
    const user = userEvent.setup();
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByTestId("add-item-button"));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("submits new item via create mutation and closes on success", async () => {
    const user = userEvent.setup();
    const mutateFn = vi.fn(
      (_data: unknown, options?: { onSuccess?: () => void }) => {
        options?.onSuccess?.();
      },
    );
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);
    mockUseCreateItem.mockReturnValue(
      makeMutationReturn({ mutate: mutateFn }) as ReturnType<
        typeof useCreateItem
      >,
    );

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByTestId("add-item-button"));
    await user.type(screen.getByLabelText("Name"), "New item");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mutateFn).toHaveBeenCalledOnce();
    expect(mutateFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: "New item" }),
    );
    // Form should close after success
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("hides add form when cancel is clicked", async () => {
    const user = userEvent.setup();
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByTestId("add-item-button"));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("renders item amounts in table rows", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("$2,000.00")).toBeInTheDocument(); // estimated
    expect(screen.getByText("$1,800.00")).toBeInTheDocument(); // quoted
    expect(screen.getByText("$900.00")).toBeInTheDocument(); // paid
  });

  it("shows actions menu for items", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(
      screen.getByLabelText("Actions for Photographer deposit"),
    ).toBeInTheDocument();
  });

  it("shows edit form when edit menu item is clicked", async () => {
    const user = userEvent.setup();
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByLabelText("Actions for Photographer deposit"));
    await user.click(screen.getByText("Edit"));

    expect(screen.getByLabelText("Name")).toHaveValue("Photographer deposit");
  });

  it("prompts before deleting a budget item", async () => {
    const user = userEvent.setup();
    const deleteMutate = vi.fn();
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);
    mockUseDeleteItem.mockReturnValue(
      makeMutationReturn({ mutate: deleteMutate }) as ReturnType<
        typeof useDeleteItem
      >,
    );

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByLabelText("Actions for Photographer deposit"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByText("Delete Photographer deposit?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This will permanently remove this item from the budget category.",
      ),
    ).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete item" }));
    expect(deleteMutate).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("closes the delete item dialog when cancel is clicked", async () => {
    const user = userEvent.setup();
    const deleteMutate = vi.fn();
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);
    mockUseDeleteItem.mockReturnValue(
      makeMutationReturn({ mutate: deleteMutate }) as ReturnType<
        typeof useDeleteItem
      >,
    );

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByLabelText("Actions for Photographer deposit"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByText("Delete Photographer deposit?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("Delete Photographer deposit?"),
    ).not.toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("keeps the delete item dialog open until deletion succeeds", async () => {
    const user = userEvent.setup();
    const deleteMutate = vi.fn(
      (_itemId: string, options?: { onSuccess?: () => void }) => {
        expect(options?.onSuccess).toBeTypeOf("function");
      },
    );
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);
    mockUseDeleteItem.mockReturnValue(
      makeMutationReturn({
        mutate: deleteMutate,
        isPending: true,
      }) as ReturnType<typeof useDeleteItem>,
    );

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByLabelText("Actions for Photographer deposit"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete item" }));

    expect(deleteMutate).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
    expect(
      screen.getByText("Delete Photographer deposit?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete item" })).toBeDisabled();

    const [, deleteOptions] = deleteMutate.mock.calls[0] as [
      string,
      { onSuccess: () => void },
    ];
    deleteOptions.onSuccess();

    await waitFor(() =>
      expect(
        screen.queryByText("Delete Photographer deposit?"),
      ).not.toBeInTheDocument(),
    );
  });

  it("submits edit form with update mutation and closes on success", async () => {
    const user = userEvent.setup();
    const updateMutate = vi.fn(
      (_data: unknown, options?: { onSuccess?: () => void }) => {
        options?.onSuccess?.();
      },
    );
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);
    mockUseUpdateItem.mockReturnValue(
      makeMutationReturn({ mutate: updateMutate }) as ReturnType<
        typeof useUpdateItem
      >,
    );

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    // Open edit form
    await user.click(screen.getByLabelText("Actions for Photographer deposit"));
    await user.click(screen.getByText("Edit"));

    // Clear the name and type a new one
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutate).toHaveBeenCalledOnce();
    expect(updateMutate.mock.calls[0][0].itemId).toBe("item-1");
    expect(updateMutate.mock.calls[0][0].data.name).toBe("Updated name");
    // Form should close after success
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("closes edit form when cancel is clicked", async () => {
    const user = userEvent.setup();
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByLabelText("Actions for Photographer deposit"));
    await user.click(screen.getByText("Edit"));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("calls refetch when Retry items button is clicked", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockUseBudgetItems.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as ReturnType<typeof useBudgetItems>);
    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /retry items/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("re-enables the delete button when delete item fails", async () => {
    const user = userEvent.setup();
    const deleteMutate = vi.fn(
      (
        _itemId: string,
        options?: { onSuccess?: () => void; onError?: () => void },
      ) => {
        options?.onError?.();
      },
    );
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);
    mockUseDeleteItem.mockReturnValue(
      makeMutationReturn({ mutate: deleteMutate }) as ReturnType<
        typeof useDeleteItem
      >,
    );
    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await user.click(screen.getByLabelText("Actions for Photographer deposit"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete item" }));
    expect(deleteMutate).toHaveBeenCalledOnce();
    expect(
      screen.getByText("Delete Photographer deposit?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete item" }),
    ).not.toBeDisabled();
  });

  it("closes the delete item dialog when Escape is pressed", async () => {
    const user = userEvent.setup();
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByLabelText("Actions for Photographer deposit"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByText("Delete Photographer deposit?"),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByText("Delete Photographer deposit?"),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows budget amount in description", () => {
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory({ estimatedCents: 500000 })}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("Budget: $5,000.00")).toBeInTheDocument();
  });

  it("opens the edit-category form and calls updateCategory.mutate on submit", async () => {
    const user = userEvent.setup();
    const updateMutate = vi.fn((_args, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    mockUseUpdateCategory.mockReturnValue(
      makeMutationReturn({ mutate: updateMutate }) as ReturnType<
        typeof useUpdateCategory
      >,
    );
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory({ name: "Photography", estimatedCents: 500000 })}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByTestId("rename-category-button"));
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: "cat-1",
        data: expect.objectContaining({ name: "Renamed" }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("opens the delete-category dialog and calls deleteCategory.mutate on confirm", async () => {
    const user = userEvent.setup();
    const deleteMutate = vi.fn(
      (_id: string, opts: { onSuccess: () => void; onError: () => void }) => {
        opts.onSuccess();
      },
    );
    const onOpenChange = vi.fn();
    mockUseDeleteCategory.mockReturnValue(
      makeMutationReturn({ mutate: deleteMutate }) as ReturnType<
        typeof useDeleteCategory
      >,
    );
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory({ name: "Obsolete" })}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByTestId("delete-category-button"));
    expect(screen.getByText("Delete Obsolete?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete category" }));

    expect(deleteMutate).toHaveBeenCalledWith(
      "cat-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("re-enables the delete button when deleteCategory mutation errors", async () => {
    const user = userEvent.setup();
    const deleteMutate = vi.fn(
      (_id: string, opts: { onSuccess: () => void; onError: () => void }) => {
        opts.onError();
      },
    );
    mockUseDeleteCategory.mockReturnValue(
      makeMutationReturn({ mutate: deleteMutate }) as ReturnType<
        typeof useDeleteCategory
      >,
    );
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory({ name: "Errorful" })}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByTestId("delete-category-button"));
    await user.click(screen.getByRole("button", { name: "Delete category" }));
    expect(deleteMutate).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Delete category" }),
    ).not.toBeDisabled();
  });

  it("cancels the delete-category dialog without calling the mutation", async () => {
    const user = userEvent.setup();
    const deleteMutate = vi.fn();
    mockUseDeleteCategory.mockReturnValue(
      makeMutationReturn({ mutate: deleteMutate }) as ReturnType<
        typeof useDeleteCategory
      >,
    );
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory({ name: "Keepme" })}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByTestId("delete-category-button"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("closes the delete-category dialog via Escape key (onOpenChange false path)", async () => {
    const user = userEvent.setup();
    mockUseDeleteCategory.mockReturnValue(
      makeMutationReturn({ mutate: vi.fn() }) as ReturnType<
        typeof useDeleteCategory
      >,
    );
    mockUseBudgetItems.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory({ name: "EscapeTest" })}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByTestId("delete-category-button"));
    expect(screen.getByText("Delete EscapeTest?")).toBeInTheDocument();

    // Pressing Escape triggers Radix onOpenChange(false), which exercises the if (!open) branch
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Delete EscapeTest?")).not.toBeInTheDocument();
  });

  it("closes the delete-item dialog via Escape key (onOpenChange false path)", async () => {
    const user = userEvent.setup();
    mockUseDeleteItem.mockReturnValue(
      makeMutationReturn({ mutate: vi.fn() }) as ReturnType<
        typeof useDeleteItem
      >,
    );
    mockUseBudgetItems.mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as ReturnType<typeof useBudgetItems>);

    render(
      <BudgetCategoryPanel
        weddingId="w-1"
        category={makeCategory()}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for/i }));
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));
    expect(
      screen.getByText(/delete photographer deposit\?/i),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByText(/delete photographer deposit\?/i),
    ).not.toBeInTheDocument();
  });
});
