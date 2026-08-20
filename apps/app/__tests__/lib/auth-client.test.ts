import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAuthBaseUrl } from "../../src/lib/auth-base-url";
import {
  acceptPendingInvite,
  consumeStoredInviteToken,
  storeInviteToken,
} from "../../src/lib/auth-client";
import { queryClient } from "../../src/lib/query-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveAuthBaseUrl", () => {
  it("uses the configured API origin when provided", () => {
    expect(resolveAuthBaseUrl("http://localhost:8787")).toBe(
      "http://localhost:8787/api/auth",
    );
  });

  it("falls back to the browser origin for local development", () => {
    expect(resolveAuthBaseUrl(undefined, "http://localhost:3000")).toBe(
      "http://localhost:3000/api/auth",
    );
  });

  it("returns a relative fallback when no browser origin is available", () => {
    expect(resolveAuthBaseUrl(undefined, undefined)).toBe("/api/auth");
  });
});

describe("acceptPendingInvite", () => {
  it("posts to the invite endpoint and refreshes weddings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const refetchSpy = vi
      .spyOn(queryClient, "refetchQueries")
      .mockResolvedValue([]);

    await acceptPendingInvite("invite-token-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/weddings/accept-invite"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ inviteToken: "invite-token-1" }),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["weddings"] });
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: ["weddings"],
      type: "active",
    });
  });

  it.each([401, 403])(
    "treats %s responses as a deferred invite acceptance",
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "unauthorized" }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const invalidateSpy = vi
        .spyOn(queryClient, "invalidateQueries")
        .mockResolvedValue();
      const refetchSpy = vi
        .spyOn(queryClient, "refetchQueries")
        .mockResolvedValue([]);
      invalidateSpy.mockClear();
      refetchSpy.mockClear();

      await expect(acceptPendingInvite()).resolves.toBeUndefined();

      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(refetchSpy).not.toHaveBeenCalled();
    },
  );

  it("keeps non-auth invite acceptance failures fatal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "server_error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(acceptPendingInvite()).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
    });
  });

  it("stores invite tokens until the authenticated shell consumes them", () => {
    storeInviteToken("invite-token-1");

    expect(consumeStoredInviteToken()).toBe("invite-token-1");
    expect(consumeStoredInviteToken()).toBeUndefined();
  });

  it("ignores empty invite tokens", () => {
    const setItemSpy = vi.spyOn(window.sessionStorage, "setItem");

    storeInviteToken(undefined);

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(consumeStoredInviteToken()).toBeUndefined();
  });

  it("does not access sessionStorage outside the browser", () => {
    vi.stubGlobal("window", undefined);

    expect(() => storeInviteToken("invite-token-1")).not.toThrow();
    expect(consumeStoredInviteToken()).toBeUndefined();
  });
});
