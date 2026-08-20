import type { Env } from "../lib/env";

export type PublicFormProtectionConfig = {
  honeypotField: string;
  requireTurnstile: boolean;
  turnstileField: string;
};

type PublicFormProtectionEnv = Partial<
  Pick<
    Env,
    | "PUBLIC_RSVP_HONEYPOT_FIELD"
    | "PUBLIC_RSVP_TURNSTILE_FIELD"
    | "PUBLIC_RSVP_REQUIRE_TURNSTILE"
  >
>;

const reservedPublicRsvpHoneypotFieldNames = new Set([
  "guests",
  "honeypot",
  "turnstileToken",
]);

const reservedPublicRsvpTurnstileFieldNames = new Set(["guests", "honeypot"]);

function assertPublicRsvpFieldNameIsAllowed(
  fieldName: string,
  reservedNames: Set<string>,
) {
  if (fieldName.length === 0) {
    throw new Error(
      "PUBLIC_RSVP_HONEYPOT_FIELD and PUBLIC_RSVP_TURNSTILE_FIELD must not be empty.",
    );
  }

  if (reservedNames.has(fieldName)) {
    throw new Error(
      "PUBLIC_RSVP_HONEYPOT_FIELD and PUBLIC_RSVP_TURNSTILE_FIELD must not use reserved RSVP payload keys.",
    );
  }
}

export function getPublicFormProtectionConfig(
  env?: PublicFormProtectionEnv,
): PublicFormProtectionConfig {
  const honeypotField =
    env?.PUBLIC_RSVP_HONEYPOT_FIELD?.trim() ?? "website";
  const turnstileField =
    env?.PUBLIC_RSVP_TURNSTILE_FIELD?.trim() ?? "turnstileToken";

  assertPublicRsvpFieldNameIsAllowed(
    honeypotField,
    reservedPublicRsvpHoneypotFieldNames,
  );
  assertPublicRsvpFieldNameIsAllowed(
    turnstileField,
    reservedPublicRsvpTurnstileFieldNames,
  );

  if (honeypotField === turnstileField) {
    throw new Error(
      "PUBLIC_RSVP_HONEYPOT_FIELD and PUBLIC_RSVP_TURNSTILE_FIELD must be different.",
    );
  }

  return {
    honeypotField,
    turnstileField,
    requireTurnstile: env?.PUBLIC_RSVP_REQUIRE_TURNSTILE?.trim() !== "false",
  };
}

export function validatePublicFormSubmission(
  body: Record<string, unknown>,
  config: PublicFormProtectionConfig,
) {
  const honeypot = body[config.honeypotField];
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return {
      ok: false as const,
      error: "Spam check failed.",
    };
  }

  if (config.requireTurnstile) {
    const token = body[config.turnstileField];
    if (typeof token !== "string" || token.trim().length === 0) {
      return {
        ok: false as const,
        error: "Turnstile verification required.",
      };
    }
  }

  return { ok: true as const };
}

type TurnstileEnv = Partial<Pick<Env, "TURNSTILE_SECRET_KEY">>;

export async function verifyTurnstileToken(token: string, env?: TurnstileEnv) {
  const secret = env?.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    return {
      ok: false as const,
      error: "Turnstile verification is not configured.",
      status: 500 as const,
    };
  }

  const body = new URLSearchParams({
    secret,
    response: token.trim(),
  });
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  if (!response.ok) {
    return {
      ok: false as const,
      error: "Turnstile verification failed.",
      status: 400 as const,
    };
  }

  const payload = (await response.json()) as { success?: boolean };
  if (!payload.success) {
    return {
      ok: false as const,
      error: "Turnstile verification failed.",
      status: 400 as const,
    };
  }

  return { ok: true as const };
}
