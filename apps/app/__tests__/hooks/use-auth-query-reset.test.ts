import { renderHook, act } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "../../src/lib/query-client";
import { useAuthQueryReset } from "../../src/hooks/use-auth-query-reset";

describe("useAuthQueryReset", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not clear the query cache on first mount", () => {
    const clearSpy = vi.spyOn(queryClient, "clear");

    renderHook(({ userId }) => useAuthQueryReset(userId), {
      initialProps: { userId: "user-1" as string | null },
    });

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("clears the query cache synchronously when the authenticated user changes", () => {
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockReturnValue(Promise.resolve());
    const clearSpy = vi.spyOn(queryClient, "clear");
    const { rerender } = renderHook(({ userId }) => useAuthQueryReset(userId), {
      initialProps: { userId: "user-1" as string | null },
    });

    rerender({ userId: "user-2" });

    // Assert both were called synchronously within the same effect tick — no awaiting.
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("clears the query cache synchronously when the user signs out", () => {
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockReturnValue(Promise.resolve());
    const clearSpy = vi.spyOn(queryClient, "clear");
    const { rerender } = renderHook(({ userId }) => useAuthQueryReset(userId), {
      initialProps: { userId: "user-1" as string | null },
    });

    rerender({ userId: null });

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("does not clear the query cache on remount with same userId (StrictMode double-invoke)", () => {
    const clearSpy = vi.spyOn(queryClient, "clear");
    vi.spyOn(queryClient, "cancelQueries").mockReturnValue(Promise.resolve());

    // React 18 StrictMode double-invokes effects. Since useRef creates a fresh
    // ref on each mount, both invocations have previousUserId.current === undefined.
    // This verifies that the first-mount guard (undefined check) prevents cache clearing
    // during StrictMode's double-mount. The same-user guard is tested separately
    // in the "does not clear the query cache when the same user rerenders" test.
    renderHook(({ userId }) => useAuthQueryReset(userId), {
      initialProps: { userId: "user-1" as string | null },
      wrapper: StrictMode,
    });

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("does not clear the query cache when the same user rerenders", async () => {
    const clearSpy = vi.spyOn(queryClient, "clear");
    vi.spyOn(queryClient, "cancelQueries").mockReturnValue(Promise.resolve());
    const { rerender } = renderHook(({ userId }) => useAuthQueryReset(userId), {
      initialProps: { userId: "user-1" as string | null },
    });
    // Change to a different user first to ensure previousUserId.current is set
    await act(async () => {
      rerender({ userId: "user-2" });
    });
    clearSpy.mockClear();
    // Now rerender with user-2 again — same user, should NOT clear
    await act(async () => {
      rerender({ userId: "user-2" });
    });
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
