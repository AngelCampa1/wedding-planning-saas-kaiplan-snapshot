import { createMiddleware } from "hono/factory";
import type { Env } from "../lib/env";
import { buildAuthenticatedMutationOrigins } from "../lib/runtime";

/**
 * CSRF / Origin-verification middleware (audit finding #27).
 *
 * Better Auth's `SameSite=Lax` cookie blocks most cross-site POSTs, but a
 * same-site (or sub-domain) XSS can still forge requests from the user's
 * browser with their cookies attached. As defense in depth, we explicitly
 * verify `Origin` (or `Referer` when `Origin` is absent) on every
 * authenticated state-changing request and reject anything that isn't on
 * the allowlist.
 *
 * Rules:
 * - GET/HEAD/OPTIONS: always pass through (not state-changing).
 * - Public unauthenticated endpoints (RSVP, public websites, webhooks) are
 *   exempt — they are either token-scoped or called by machines that don't
 *   set an Origin header (e.g. Stripe webhooks).
 * - Origin enforcement only applies when the request carries a Better Auth
 *   session cookie. Unauthenticated mutations (signup, password reset, etc.)
 *   cannot forge a session that doesn't exist, and server-to-server / test
 *   callers typically don't set an Origin header.
 * - Authenticated mutations must carry an `Origin` or `Referer` header whose
 *   origin matches the authenticated app allowlist (APP_URL).
 */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Better Auth default session cookie names. The `__Secure-` prefix is used
// when the cookie is issued over HTTPS (production); the bare form is used
// in local dev over plain HTTP.
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

/**
 * Parse a raw `Cookie` header into a Set of exact cookie names.
 *
 * RFC 6265 §4.2.1: the header is a semicolon-separated list of `name=value`
 * pairs. We only need the names to check for presence.
 */
function parseCookieNames(cookieHeader: string): Set<string> {
  const names = new Set<string>();
  for (const pair of cookieHeader.split(";")) {
    const eqIdx = pair.indexOf("=");
    const name = eqIdx === -1 ? pair.trim() : pair.slice(0, eqIdx).trim();
    if (name) {
      names.add(name);
    }
  }
  return names;
}

function hasAuthCookie(cookieHeader: string): boolean {
  if (!cookieHeader) return false;
  const names = parseCookieNames(cookieHeader);
  return SESSION_COOKIE_NAMES.some((name) => names.has(name));
}

// Path prefixes that bypass CSRF verification. Each prefix intentionally ends
// with "/" so only paths under that subtree match.
const BYPASS_PATH_PREFIXES = [
  "/api/public/",
  "/api/webhooks/",
] as const;

const BYPASS_EXACT_PATHS = [
  // Stripe webhook is currently mounted at /api/billing/webhook. Stripe
  // signs the request body with STRIPE_WEBHOOK_SECRET and does not send
  // an Origin header.
  "/api/billing/webhook",
] as const;

function isBypassPath(pathname: string): boolean {
  return (
    BYPASS_EXACT_PATHS.some((path) => pathname === path) ||
    BYPASS_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function extractOrigin(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  try {
    const url = new URL(headerValue.trim());
    return url.origin;
  } catch {
    return null;
  }
}

export function csrfMiddleware() {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    if (!MUTATING_METHODS.has(c.req.method)) {
      return next();
    }

    const pathname = new URL(c.req.url).pathname;
    if (isBypassPath(pathname)) {
      return next();
    }

    // CSRF is only meaningful when there's a session to forge. An
    // unauthenticated request (signup, password reset, server-to-server,
    // Playwright API calls without cookies) cannot impersonate a user
    // because there is no session cookie attached.
    const cookieHeader = c.req.header("Cookie") ?? "";
    if (!hasAuthCookie(cookieHeader)) {
      return next();
    }

    const originHeader = c.req.header("Origin");
    const refererHeader = c.req.header("Referer");

    const sourceOrigin =
      originHeader === undefined
        ? extractOrigin(refererHeader)
        : extractOrigin(originHeader);

    if (!sourceOrigin) {
      return c.json({ error: "Origin required." }, 403);
    }

    const allowedOrigins = buildAuthenticatedMutationOrigins(c.env);
    if (!allowedOrigins.includes(sourceOrigin)) {
      return c.json({ error: "Origin required." }, 403);
    }

    return next();
  });
}
