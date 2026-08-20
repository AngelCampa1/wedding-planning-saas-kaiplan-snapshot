import { describe, expect, it, vi } from "vitest";
import type { Mutation, Query } from "@tanstack/react-query";

const sentryMocks = vi.hoisted(() => ({
  captureQueryError: vi.fn(),
}));

vi.mock("../../src/lib/sentry", () => ({
  captureQueryError: sentryMocks.captureQueryError,
}));

import { ApiError } from "../../src/lib/api";
import {
  queryClient,
  registerGlobal401Handler,
} from "../../src/lib/query-client";

describe("queryClient static coverage", () => {
  it("runs query and mutation errors through the global 401 handler", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn();

    registerGlobal401Handler({ signOut, navigate, clear });

    queryClient
      .getQueryCache()
      .config.onError?.(new ApiError(500, "Server"), {} as Query);
    expect(sentryMocks.captureQueryError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
    );
    expect(signOut).not.toHaveBeenCalled();

    queryClient
      .getMutationCache()
      .config.onError?.(
        new ApiError(401, "Unauthorized"),
        undefined,
        undefined,
        {} as Mutation<unknown, unknown, unknown, unknown>,
      );

    await vi.waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith({ to: "/login" });
    });
  });
});
