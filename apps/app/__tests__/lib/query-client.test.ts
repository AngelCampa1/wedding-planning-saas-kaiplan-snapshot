import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Query } from "@tanstack/react-query";

// We need to reset module state between tests so the handling401 flag and
// global401Deps are fresh for each test.
// ApiError is also imported dynamically so its class identity matches the fresh
// module's runtime after vi.resetModules() clears the module cache.
const importModules = async (captureQueryError = vi.fn()) => {
  vi.doMock("../../src/lib/sentry", () => ({
    captureQueryError,
  }));

  const [qc, api] = await Promise.all([
    import("../../src/lib/query-client"),
    import("../../src/lib/api"),
  ]);
  return { ...qc, ApiError: api.ApiError };
};

describe("registerGlobal401Handler / handle401 idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reports query errors through Sentry filtering", async () => {
    const captureQueryError = vi.fn();
    vi.doMock("../../src/lib/sentry", () => ({
      captureQueryError,
    }));

    const { queryClient } = await importModules(captureQueryError);
    const err = new Error("query exploded");

    queryClient.getQueryCache().config.onError?.(err, {} as unknown as Query);

    expect(captureQueryError).toHaveBeenCalledWith(err);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not call signOut when error is not an ApiError", async () => {
    const { registerGlobal401Handler, queryClient } = await importModules();

    const signOut = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn();

    registerGlobal401Handler({ signOut, navigate, clear });

    // Trigger a generic error through the query cache
    queryClient.getQueryCache().config.onError?.(
      new Error("generic"),

      {} as unknown as Query,
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(signOut).not.toHaveBeenCalled();
  });

  it("does not call signOut when error is ApiError but status is not 401", async () => {
    const { registerGlobal401Handler, queryClient, ApiError } =
      await importModules();

    const signOut = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn();

    registerGlobal401Handler({ signOut, navigate, clear });

    queryClient.getQueryCache().config.onError?.(
      new ApiError(403, "Forbidden"),

      {} as unknown as Query,
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(signOut).not.toHaveBeenCalled();
  });

  it("calls signOut, clear, and navigate exactly once on a 401 error", async () => {
    const { registerGlobal401Handler, queryClient, ApiError } =
      await importModules();

    let resolveSignOut!: () => void;
    const signOut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        }),
    );
    const navigate = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn();

    registerGlobal401Handler({ signOut, navigate, clear });

    queryClient.getQueryCache().config.onError?.(
      new ApiError(401, "Unauthorized"),

      {} as unknown as Query,
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(signOut).toHaveBeenCalledTimes(1);

    resolveSignOut();
    await new Promise((r) => setTimeout(r, 0));

    expect(clear).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ to: "/login" });
  });

  it("fires signOut only once when two simultaneous 401 errors arrive", async () => {
    const { registerGlobal401Handler, queryClient, ApiError } =
      await importModules();

    let resolveSignOut!: () => void;
    const signOut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        }),
    );
    let resolveNavigate!: () => void;
    const navigate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNavigate = resolve;
        }),
    );
    const clear = vi.fn();

    registerGlobal401Handler({ signOut, navigate, clear });

    const cache = queryClient.getQueryCache();

    // Fire two 401 errors at the same time
    cache.config.onError?.(
      new ApiError(401, "Unauthorized"),

      {} as unknown as Query,
    );
    cache.config.onError?.(
      new ApiError(401, "Unauthorized"),

      {} as unknown as Query,
    );

    await new Promise((r) => setTimeout(r, 0));

    // Only ONE signOut call despite two simultaneous 401 errors
    expect(signOut).toHaveBeenCalledTimes(1);

    // Resolve the chain so the flag resets for cleanup
    resolveSignOut();
    await new Promise((r) => setTimeout(r, 0));
    resolveNavigate();
    await new Promise((r) => setTimeout(r, 0));
  });

  it("allows a second 401 to trigger signOut after the first completes", async () => {
    const { registerGlobal401Handler, queryClient, ApiError } =
      await importModules();

    let resolveSignOut!: () => void;
    const signOut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        }),
    );
    let resolveNavigate!: () => void;
    const navigate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNavigate = resolve;
        }),
    );
    const clear = vi.fn();

    registerGlobal401Handler({ signOut, navigate, clear });

    const cache = queryClient.getQueryCache();

    // First 401
    cache.config.onError?.(
      new ApiError(401, "Unauthorized"),

      {} as unknown as Query,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(signOut).toHaveBeenCalledTimes(1);

    // Complete the full sign-out flow (signOut → clear → navigate → reset flag)
    resolveSignOut();
    await new Promise((r) => setTimeout(r, 0));
    resolveNavigate();
    await new Promise((r) => setTimeout(r, 0));

    // Now fire a second 401 — flag should be reset, so it fires again
    let resolveSignOut2!: () => void;
    signOut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut2 = resolve;
        }),
    );
    let resolveNavigate2!: () => void;
    navigate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveNavigate2 = resolve;
        }),
    );

    cache.config.onError?.(
      new ApiError(401, "Unauthorized"),

      {} as unknown as Query,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(signOut).toHaveBeenCalledTimes(2);

    resolveSignOut2();
    await new Promise((r) => setTimeout(r, 0));
    resolveNavigate2();
    await new Promise((r) => setTimeout(r, 0));
  });

  it("resets handling401 flag even if navigate throws", async () => {
    const { registerGlobal401Handler, queryClient, ApiError } =
      await importModules();

    const signOut = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockRejectedValue(new Error("navigate failed"));
    const clear = vi.fn();

    registerGlobal401Handler({ signOut, navigate, clear });

    queryClient
      .getQueryCache()
      .config.onError?.(
        new ApiError(401, "Unauthorized"),
        {} as unknown as Query,
      );

    // Wait for the async chain to complete (signOut → finally → navigate throws → finally → reset)
    await new Promise((r) => setTimeout(r, 20));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);

    // Flag should be reset — a second 401 should fire sign-out again
    signOut.mockResolvedValue(undefined);
    navigate.mockResolvedValue(undefined);

    queryClient
      .getQueryCache()
      .config.onError?.(
        new ApiError(401, "Unauthorized"),
        {} as unknown as Query,
      );

    await new Promise((r) => setTimeout(r, 20));
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("resets handling401 flag even if signOut rejects", async () => {
    const { registerGlobal401Handler, queryClient, ApiError } =
      await importModules();

    const signOut = vi.fn().mockRejectedValue(new Error("signOut failed"));
    const navigate = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn();

    registerGlobal401Handler({ signOut, navigate, clear });

    queryClient
      .getQueryCache()
      .config.onError?.(
        new ApiError(401, "Unauthorized"),
        {} as unknown as Query,
      );

    await new Promise((r) => setTimeout(r, 20));

    expect(signOut).toHaveBeenCalledTimes(1);
    // Even though signOut rejected, navigate should still be called and flag reset
    expect(navigate).toHaveBeenCalledTimes(1);

    // Flag should be reset
    signOut.mockResolvedValue(undefined);
    queryClient
      .getQueryCache()
      .config.onError?.(
        new ApiError(401, "Unauthorized"),
        {} as unknown as Query,
      );
    await new Promise((r) => setTimeout(r, 20));
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("does not call signOut when global deps are not registered", async () => {
    // No registerGlobal401Handler call — deps remain null
    const { queryClient, ApiError } = await importModules();

    queryClient.getQueryCache().config.onError?.(
      new ApiError(401, "Unauthorized"),

      {} as unknown as Query,
    );

    await new Promise((r) => setTimeout(r, 0));
    // No assertion needed — just ensure no throw
  });

  it("MutationCache also goes through handle401 idempotency", async () => {
    const { registerGlobal401Handler, queryClient, ApiError } =
      await importModules();

    let resolveSignOut!: () => void;
    const signOut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        }),
    );
    let resolveNavigate!: () => void;
    const navigate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNavigate = resolve;
        }),
    );
    const clear = vi.fn();

    registerGlobal401Handler({ signOut, navigate, clear });

    const mutCache = queryClient.getMutationCache();

    // Fire one from queryCache and one from mutationCache simultaneously
    queryClient.getQueryCache().config.onError?.(
      new ApiError(401, "Unauthorized"),

      {} as unknown as Query,
    );
    mutCache.config.onError?.(
      new ApiError(401, "Unauthorized"),

      {} as unknown as Query,
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(signOut).toHaveBeenCalledTimes(1);

    resolveSignOut();
    await new Promise((r) => setTimeout(r, 0));
    resolveNavigate();
    await new Promise((r) => setTimeout(r, 0));
  });
});
