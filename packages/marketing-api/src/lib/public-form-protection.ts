import type { ApiEnv } from "../app";

export const HONEYPOT_FIELD = "company_website";
export const TURNSTILE_FIELD = "turnstileToken";

type TurnstileEnv = Pick<ApiEnv, "TURNSTILE_SECRET_KEY" | "ENVIRONMENT">;

const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

let warnedMissingSecret = false;

/** Test-only: reset the one-time missing-secret warning flag. */
export function __resetTurnstileWarning(): void {
  warnedMissingSecret = false;
}

export function isHoneypotTripped(body: Record<string, unknown>): boolean {
  const value = body[HONEYPOT_FIELD];
  return typeof value === "string" && value.trim().length > 0;
}

export function shouldEnforceTurnstile(env: TurnstileEnv): boolean {
  if (env.TURNSTILE_SECRET_KEY?.trim()) {
    return true;
  }
  return !["development", "test"].includes(env.ENVIRONMENT ?? "");
}

export async function verifyTurnstile(
  token: string | undefined,
  env: TurnstileEnv,
): Promise<{ ok: boolean }> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.error(
        "[public-form-protection] Turnstile enforcement is required but TURNSTILE_SECRET_KEY is not configured; failing closed.",
      );
    }
    return { ok: false };
  }

  const trimmedToken = typeof token === "string" ? token.trim() : "";
  if (trimmedToken.length === 0) {
    return { ok: false };
  }

  const requestBody = new URLSearchParams({
    secret,
    response: trimmedToken,
  });

  let response: Response;
  try {
    response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: requestBody.toString(),
    });
  } catch {
    return { ok: false };
  }

  if (!response.ok) {
    return { ok: false };
  }

  let payload: { success?: boolean };
  try {
    payload = (await response.json()) as { success?: boolean };
  } catch {
    return { ok: false };
  }

  return payload.success === true ? { ok: true } : { ok: false };
}

export async function guardPublicForm(
  body: Record<string, unknown>,
  env: TurnstileEnv,
): Promise<
  { outcome: "ok" } | { outcome: "honeypot" } | { outcome: "reject" }
> {
  if (isHoneypotTripped(body)) {
    return { outcome: "honeypot" };
  }

  if (shouldEnforceTurnstile(env)) {
    const rawToken = body[TURNSTILE_FIELD];
    const token = typeof rawToken === "string" ? rawToken : undefined;
    const { ok } = await verifyTurnstile(token, env);
    if (!ok) {
      return { outcome: "reject" };
    }
  }

  return { outcome: "ok" };
}
