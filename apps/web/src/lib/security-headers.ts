export type RouteHeaderPolicy = "default" | "wedding" | "api";

export const MARKETING_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://us-assets.i.posthog.com",
  "connect-src 'self' https://my.kaiplan.app https://*.kaiplan.app https://cal.com https://fonts.googleapis.com https://fonts.gstatic.com https://us.i.posthog.com https://us-assets.i.posthog.com https://app.posthog.com",
  "frame-src 'self' https://challenges.cloudflare.com",
  "form-action 'self' https://my.kaiplan.app",
  "upgrade-insecure-requests",
].join("; ");

export const WEDDING_PAGE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Cloudflare Turnstile is required for the RSVP widget.
  // The Turnstile callback (kaiplanTurnstileCallback) is defined in the
  // bundled public-rsvp module, so 'unsafe-inline' is not needed here.
  // Per-page CSP in [slug].astro adds 'unsafe-inline' dynamically for dev/e2e.
  "script-src 'self' https://challenges.cloudflare.com",
  "connect-src 'self' https://*.kaiplan.app https://challenges.cloudflare.com",
  "frame-src https://www.youtube.com https://player.vimeo.com https://challenges.cloudflare.com",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

export function getRouteHeaderPolicy(pathname: string): RouteHeaderPolicy {
  if (pathname.startsWith("/w/")) {
    return "wedding";
  }
  if (pathname.startsWith("/api/")) {
    return "api";
  }
  return "default";
}

function createMutableResponse(response: Response): Response {
  return new Response(response.body, response);
}

function applyBaseSecurityHeaders(response: Response): void {
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

export function applySecurityHeaders(
  response: Response,
  policy: RouteHeaderPolicy,
): Response {
  const mutableResponse = createMutableResponse(response);
  applyBaseSecurityHeaders(mutableResponse);

  if (policy === "default") {
    mutableResponse.headers.set("Content-Security-Policy", MARKETING_CSP);
    mutableResponse.headers.set("X-Frame-Options", "DENY");
    mutableResponse.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    mutableResponse.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    mutableResponse.headers.set(
      "Permissions-Policy",
      "camera=(), geolocation=(), microphone=()",
    );
  } else if (policy === "wedding") {
    if (!mutableResponse.headers.get("Content-Security-Policy")) {
      mutableResponse.headers.set("Content-Security-Policy", WEDDING_PAGE_CSP);
    }
    mutableResponse.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    mutableResponse.headers.set("X-Frame-Options", "DENY");
    mutableResponse.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    mutableResponse.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    mutableResponse.headers.set(
      "Permissions-Policy",
      "camera=(), geolocation=(), microphone=()",
    );
  } else if (policy === "api") {
    mutableResponse.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  // api policy: no CSP or X-Frame-Options; API responses keep base headers.

  return mutableResponse;
}
