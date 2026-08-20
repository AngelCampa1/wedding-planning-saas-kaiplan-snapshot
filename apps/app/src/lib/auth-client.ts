import { createAuthClient } from "better-auth/react";
import { ApiError, apiFetch } from "./api";
import { resolveAuthBaseUrl } from "./auth-base-url";
import { queryClient } from "./query-client";

export const authBaseUrl = resolveAuthBaseUrl(
  import.meta.env.VITE_API_URL,
  /* c8 ignore next */
  typeof window === "undefined" ? undefined : window.location.origin,
);

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
});

const INVITE_TOKEN_STORAGE_KEY = "kaiplan.memberInviteToken";

export function storeInviteToken(inviteToken: string | undefined) {
  if (!inviteToken || typeof window === "undefined") return;
  window.sessionStorage.setItem(INVITE_TOKEN_STORAGE_KEY, inviteToken);
}

export function consumeStoredInviteToken() {
  if (typeof window === "undefined") return undefined;
  const token = window.sessionStorage.getItem(INVITE_TOKEN_STORAGE_KEY);
  if (token) {
    window.sessionStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
  }
  return token ?? undefined;
}

export async function acceptPendingInvite(inviteToken?: string) {
  try {
    await apiFetch("/api/weddings/accept-invite", {
      method: "POST",
      body: JSON.stringify(inviteToken ? { inviteToken } : {}),
    });
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      return;
    }
    throw error;
  }
  await queryClient.invalidateQueries({ queryKey: ["weddings"] });
  await queryClient.refetchQueries({ queryKey: ["weddings"], type: "active" });
}
