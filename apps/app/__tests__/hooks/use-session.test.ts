import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSession } from "../../src/hooks/use-session";
import * as authClientModule from "../../src/lib/auth-client";

vi.mock("../../src/lib/auth-client", () => ({
  authClient: {
    useSession: vi.fn(() => ({
      data: { user: { id: "u1", email: "a@b.com" } },
    })),
  },
}));

describe("useSession", () => {
  it("delegates to authClient.useSession and returns its value", () => {
    const { result } = renderHook(() => useSession());
    expect(authClientModule.authClient.useSession).toHaveBeenCalled();
    expect(result.current).toEqual({
      data: { user: { id: "u1", email: "a@b.com" } },
    });
  });
});
