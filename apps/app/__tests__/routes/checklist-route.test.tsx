import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React, { cloneElement, isValidElement } from "react";

const routeContext = {
  auth: {
    user: {
      name: "Angel Campa",
      email: "angel@example.com",
    },
  },
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useRouteContext: () => routeContext,
  }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../src/components/top-bar", () => ({
  TopBar: () => <div>Top bar</div>,
}));

vi.mock("../../src/components/ui/accordion", () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="accordion">{children}</div>
  ),
  AccordionItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AccordionTrigger: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  AccordionContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("../../src/components/ui/checkbox", () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id: string;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
}));

vi.mock("../../src/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("../../src/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    onClick,
    disabled,
    ...props
  }: {
    asChild?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    asChild && isValidElement(children) ? (
      cloneElement(children, { onClick, ...props })
    ) : (
      <button onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
}));

vi.mock("../../src/lib/wedding-context", () => ({
  useActiveWedding: vi.fn(),
}));

vi.mock("../../src/hooks/use-weddings", () => ({
  useWeddings: vi.fn(),
}));

vi.mock("../../src/hooks/use-checklist", () => ({
  useChecklist: vi.fn(),
  useUpdateChecklistTask: vi.fn(),
  useSeedChecklist: vi.fn(),
  useCreateChecklistTask: vi.fn(),
}));

import { useActiveWedding } from "../../src/lib/wedding-context";
import { useWeddings } from "../../src/hooks/use-weddings";
import {
  useChecklist,
  useUpdateChecklistTask,
  useSeedChecklist,
  useCreateChecklistTask,
} from "../../src/hooks/use-checklist";

const mockedUseActiveWedding = vi.mocked(useActiveWedding);
const mockedUseWeddings = vi.mocked(useWeddings);
const mockedUseChecklist = vi.mocked(useChecklist);
const mockedUseUpdateChecklistTask = vi.mocked(useUpdateChecklistTask);
const mockedUseSeedChecklist = vi.mocked(useSeedChecklist);
const mockedUseCreateChecklistTask = vi.mocked(useCreateChecklistTask);

const stubMutate = vi.fn();

function setupMocks(overrides: {
  activeWeddingId?: string | null;
  weddings?: Array<{ id: string; name: string; role: string }>;
  weddingsLoading?: boolean;
  data?: object | null;
  isLoading?: boolean;
  error?: unknown;
  refetch?: () => void;
}) {
  const {
    activeWeddingId = "wedding-1",
    weddings = [],
    weddingsLoading = false,
    data,
    isLoading = false,
    error,
    refetch = vi.fn(),
  } = overrides;
  mockedUseActiveWedding.mockReturnValue({
    activeWeddingId,
    setActiveWeddingId: vi.fn(),
  });
  mockedUseWeddings.mockReturnValue({
    data: weddings,
    isLoading: weddingsLoading,
  } as unknown as ReturnType<typeof useWeddings>);
  mockedUseChecklist.mockReturnValue({
    data: data as ReturnType<typeof useChecklist>["data"],
    isLoading,
    isError: Boolean(error),
    isSuccess: !isLoading,
    error,
    refetch,
  } as ReturnType<typeof useChecklist>);
  mockedUseUpdateChecklistTask.mockReturnValue({
    mutate: stubMutate,
  } as unknown as ReturnType<typeof useUpdateChecklistTask>);
  mockedUseSeedChecklist.mockReturnValue({
    mutate: stubMutate,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useSeedChecklist>);
  mockedUseCreateChecklistTask.mockReturnValue({
    mutate: stubMutate,
  } as unknown as ReturnType<typeof useCreateChecklistTask>);
}

describe("ChecklistPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Checklist heading", async () => {
    setupMocks({
      data: { tasks: [], totalCount: 0, completedCount: 0 },
    });

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);
    expect(screen.getByText("Checklist")).toBeInTheDocument();
  });

  it("shows loading spinner when isLoading is true", async () => {
    setupMocks({ isLoading: true, data: null });

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    const { container } = render(<ChecklistPage />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows a create-wedding state instead of an empty checklist when no wedding exists", async () => {
    setupMocks({
      activeWeddingId: null,
      weddings: [],
      data: { tasks: [], totalCount: 0, completedCount: 0 },
    });

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);

    expect(screen.getByText("Create a wedding first")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create wedding" }),
    ).toHaveAttribute("href", "/onboarding");
    expect(screen.queryByText("0 / 0 tasks complete")).not.toBeInTheDocument();
    expect(stubMutate).not.toHaveBeenCalled();
  });

  it("shows a retryable error instead of an empty editable checklist when tasks fail to load", async () => {
    const refetch = vi.fn();
    setupMocks({
      data: null,
      error: new Error("checklist is down"),
      refetch,
    });

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);

    expect(screen.getByText("Checklist did not load")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("checklist is down")).not.toBeInTheDocument();
    expect(screen.queryByText("0 / 0 tasks complete")).not.toBeInTheDocument();
    expect(screen.queryByTestId("accordion")).not.toBeInTheDocument();
    expect(screen.queryByText("+ Add task")).not.toBeInTheDocument();
    expect(stubMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry checklist" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not seed cached empty checklist data during a load error", async () => {
    setupMocks({
      data: { tasks: [], totalCount: 0, completedCount: 0 },
      error: new Error("background refetch failed"),
    });

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);

    expect(screen.getByText("Checklist did not load")).toBeInTheDocument();
    expect(stubMutate).not.toHaveBeenCalled();
  });

  it("shows progress bar with 0/0 when no tasks", async () => {
    setupMocks({
      data: { tasks: [], totalCount: 0, completedCount: 0 },
    });

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);
    expect(screen.getByText("0 / 0 tasks complete")).toBeInTheDocument();
  });

  it("shows progress when tasks exist", async () => {
    const task = {
      id: "task-1",
      weddingId: "wedding-1",
      bucket: "3_to_6mo",
      title: "Book venue",
      notes: null,
      dueOffsetDays: null,
      completedAt: null,
      sortOrder: 0,
      createdBy: "user-1",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    setupMocks({
      data: { tasks: [task], totalCount: 1, completedCount: 0 },
    });

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);
    expect(screen.getByText("0 / 1 tasks complete")).toBeInTheDocument();
  });

  it("renders bucket labels for accordion sections", async () => {
    setupMocks({
      data: { tasks: [], totalCount: 0, completedCount: 0 },
    });

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);
    expect(screen.getByText("12+ Months Out")).toBeInTheDocument();
    expect(screen.getByText("Day Of")).toBeInTheDocument();
  });

  it("calls seed mutation once when totalCount is 0", async () => {
    const seedMutate = vi.fn();
    mockedUseSeedChecklist.mockReturnValue({
      mutate: seedMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSeedChecklist>);

    setupMocks({
      data: { tasks: [], totalCount: 0, completedCount: 0 },
    });
    mockedUseSeedChecklist.mockReturnValue({
      mutate: seedMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSeedChecklist>);

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);

    expect(seedMutate).toHaveBeenCalledTimes(1);
  });

  it("does not call seed mutation again after it has been called once (no infinite loop)", async () => {
    const seedMutate = vi.fn();
    mockedUseSeedChecklist.mockReturnValue({
      mutate: seedMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSeedChecklist>);

    setupMocks({
      data: { tasks: [], totalCount: 0, completedCount: 0 },
    });
    mockedUseSeedChecklist.mockReturnValue({
      mutate: seedMutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSeedChecklist>);

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    const { rerender } = render(<ChecklistPage />);

    // Re-render with totalCount still 0 (simulating refetch after error)
    rerender(<ChecklistPage />);
    rerender(<ChecklistPage />);

    // Should only have been called once, not on each re-render
    expect(seedMutate).toHaveBeenCalledTimes(1);
  });

  it("does not seed when mutation is already pending", async () => {
    const seedMutate = vi.fn();

    setupMocks({
      data: { tasks: [], totalCount: 0, completedCount: 0 },
    });
    mockedUseSeedChecklist.mockReturnValue({
      mutate: seedMutate,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useSeedChecklist>);

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);

    expect(seedMutate).not.toHaveBeenCalled();
  });

  it("does not seed when mutation is in error state", async () => {
    const seedMutate = vi.fn();

    setupMocks({
      data: { tasks: [], totalCount: 0, completedCount: 0 },
    });
    mockedUseSeedChecklist.mockReturnValue({
      mutate: seedMutate,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useSeedChecklist>);

    const { ChecklistPage } =
      await import("../../src/routes/_authenticated/checklist");
    render(<ChecklistPage />);

    expect(seedMutate).not.toHaveBeenCalled();
  });
});
