import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useChecklist,
  useCreateChecklistTask,
  useUpdateChecklistTask,
  useDeleteChecklistTask,
  useSeedChecklist,
} from "../../src/hooks/use-checklist";

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
    },
  };
}

const CHECKLIST_RESPONSE = {
  tasks: [
    {
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
    },
  ],
  totalCount: 1,
  completedCount: 0,
};

describe("useChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches checklist for a wedding", async () => {
    mockedApiFetch.mockResolvedValue(CHECKLIST_RESPONSE);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useChecklist("wedding-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(CHECKLIST_RESPONSE);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/checklist",
    );
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue(CHECKLIST_RESPONSE);
    const { wrapper } = createWrapper();
    renderHook(() => useChecklist(null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("useCreateChecklistTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with POST and invalidates checklist query on success", async () => {
    const newTask = { id: "task-new", title: "New task", bucket: "6_to_9mo" };
    mockedApiFetch.mockResolvedValue(newTask);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateChecklistTask("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ title: "New task", bucket: "6_to_9mo" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/checklist",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["checklist", "wedding-1"],
    });
  });
});

describe("useUpdateChecklistTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with PATCH and invalidates checklist query on success", async () => {
    const updatedTask = {
      id: "task-1",
      title: "Updated task",
      bucket: "3_to_6mo",
    };
    mockedApiFetch.mockResolvedValue(updatedTask);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateChecklistTask("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        taskId: "task-1",
        data: { title: "Updated task" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/checklist/task-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["checklist", "wedding-1"],
    });
  });

  it("marks task as completed with completedAt", async () => {
    mockedApiFetch.mockResolvedValue({
      id: "task-1",
      completedAt: "2024-06-01T10:00:00.000Z",
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateChecklistTask("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        taskId: "task-1",
        data: { completedAt: "2024-06-01T10:00:00.000Z" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/checklist/task-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ completedAt: "2024-06-01T10:00:00.000Z" }),
      }),
    );
  });
});

describe("useDeleteChecklistTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with DELETE and invalidates checklist query on success", async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteChecklistTask("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate("task-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/checklist/task-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["checklist", "wedding-1"],
    });
  });
});

describe("useSeedChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls POST /seed and invalidates checklist query on success", async () => {
    mockedApiFetch.mockResolvedValue({ seeded: true, count: 60 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSeedChecklist("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/checklist/seed",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["checklist", "wedding-1"],
    });
  });

  it("returns seeded:false when already seeded (idempotent)", async () => {
    mockedApiFetch.mockResolvedValue({ seeded: false, count: 60 });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSeedChecklist("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ seeded: false, count: 60 });
  });
});
