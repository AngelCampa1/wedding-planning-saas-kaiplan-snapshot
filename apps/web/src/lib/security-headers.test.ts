import { describe, expect, it } from "vitest";
import {
  MARKETING_CSP,
  WEDDING_PAGE_CSP,
  applySecurityHeaders,
  getRouteHeaderPolicy,
} from "./security-headers";

describe("getRouteHeaderPolicy", () => {
  it("returns 'default' for regular marketing routes", () => {
    expect(getRouteHeaderPolicy("/")).toBe("default");
    expect(getRouteHeaderPolicy("/pricing")).toBe("default");
    expect(getRouteHeaderPolicy("/compare")).toBe("default");
    expect(getRouteHeaderPolicy("/guides/how-to-plan-a-wedding")).toBe(
      "default",
    );
  });

  it("returns 'wedding' for /w/* routes", () => {
    expect(getRouteHeaderPolicy("/w/mia-and-noah")).toBe("wedding");
    expect(getRouteHeaderPolicy("/w/")).toBe("wedding");
  });

  it("returns 'api' for /api/* routes", () => {
    expect(getRouteHeaderPolicy("/api/marketing/signup")).toBe("api");
    expect(getRouteHeaderPolicy("/api/")).toBe("api");
  });
});

describe("MARKETING_CSP", () => {
  it("includes PostHog and Cloudflare Insights in script-src", () => {
    expect(MARKETING_CSP).toContain("https://us-assets.i.posthog.com");
    expect(MARKETING_CSP).toContain("https://static.cloudflareinsights.com");
  });

  it("includes PostHog in connect-src", () => {
    expect(MARKETING_CSP).toContain("https://us.i.posthog.com");
    expect(MARKETING_CSP).toContain("https://us-assets.i.posthog.com");
    expect(MARKETING_CSP).toContain("https://app.posthog.com");
  });

  it("does not allow the Ventora feedback widget", () => {
    expect(MARKETING_CSP).not.toContain("widgets.ventoralabs.com");
  });

  it("allows the Cloudflare Turnstile script for the marketing forms", () => {
    const scriptSrcDirective = MARKETING_CSP.split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrcDirective).toContain("https://challenges.cloudflare.com");
  });

  it("allows the Cloudflare Turnstile iframe via frame-src", () => {
    const frameSrcDirective = MARKETING_CSP.split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("frame-src"));
    expect(frameSrcDirective).toContain("https://challenges.cloudflare.com");
  });

  it("sets frame-ancestors to none", () => {
    expect(MARKETING_CSP).toContain("frame-ancestors 'none'");
  });

  it("does not allow unsafe-eval by default", () => {
    expect(MARKETING_CSP).not.toContain("'unsafe-eval'");
  });
});

describe("WEDDING_PAGE_CSP", () => {
  it("allows YouTube iframes via frame-src", () => {
    expect(WEDDING_PAGE_CSP).toContain("frame-src https://www.youtube.com");
  });

  it("does not restrict frame-ancestors to none (allows embedding wedding pages)", () => {
    expect(WEDDING_PAGE_CSP).not.toContain("frame-ancestors 'none'");
  });

  it("does not contain 'unsafe-inline' in script-src  -  the Turnstile callback is defined in the bundled public-rsvp module, not inline", () => {
    // The kaiplanTurnstileCallback is defined in public-rsvp.ts (bundled),
    // so 'unsafe-inline' is not needed at the constant level.
    // Per-page dev/e2e environments add it dynamically when needed.
    const scriptSrcDirective = WEDDING_PAGE_CSP.split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrcDirective).toBeDefined();
    expect(scriptSrcDirective).not.toContain("'unsafe-inline'");
  });

  it("includes Cloudflare Turnstile in script-src for RSVP widget", () => {
    expect(WEDDING_PAGE_CSP).toContain("https://challenges.cloudflare.com");
    const scriptSrcDirective = WEDDING_PAGE_CSP.split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrcDirective).toContain("https://challenges.cloudflare.com");
  });

  it("includes Cloudflare Turnstile in frame-src", () => {
    const frameSrcDirective = WEDDING_PAGE_CSP.split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("frame-src"));
    expect(frameSrcDirective).toContain("https://challenges.cloudflare.com");
  });

  it("includes the kaiplan API wildcard in connect-src", () => {
    const connectSrcDirective = WEDDING_PAGE_CSP.split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("connect-src"));
    expect(connectSrcDirective).toContain("https://*.kaiplan.app");
  });

  it("includes base-uri 'self' to prevent base tag injection", () => {
    expect(WEDDING_PAGE_CSP).toContain("base-uri 'self'");
  });

  it("includes object-src 'none' to block plugin content", () => {
    expect(WEDDING_PAGE_CSP).toContain("object-src 'none'");
  });
});

describe("applySecurityHeaders  -  default policy", () => {
  it("sets X-Frame-Options: DENY", () => {
    const response = applySecurityHeaders(new Response("ok"), "default");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options: nosniff", () => {
    const response = applySecurityHeaders(new Response("ok"), "default");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets Strict-Transport-Security with preload", () => {
    const response = applySecurityHeaders(new Response("ok"), "default");
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
  });

  it("sets Referrer-Policy", () => {
    const response = applySecurityHeaders(new Response("ok"), "default");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("sets the marketing CSP", () => {
    const response = applySecurityHeaders(new Response("ok"), "default");
    expect(response.headers.get("Content-Security-Policy")).toBe(MARKETING_CSP);
  });

  it("sets Cross-Origin-Opener-Policy", () => {
    const response = applySecurityHeaders(new Response("ok"), "default");
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin",
    );
  });

  it("sets Permissions-Policy", () => {
    const response = applySecurityHeaders(new Response("ok"), "default");
    expect(response.headers.get("Permissions-Policy")).toBe(
      "camera=(), geolocation=(), microphone=()",
    );
  });
});

describe("applySecurityHeaders  -  wedding policy", () => {
  it("still sets X-Frame-Options: DENY", () => {
    const response = applySecurityHeaders(new Response("ok"), "wedding");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("still sets X-Content-Type-Options: nosniff", () => {
    const response = applySecurityHeaders(new Response("ok"), "wedding");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("still sets Strict-Transport-Security with preload", () => {
    const response = applySecurityHeaders(new Response("ok"), "wedding");
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
  });

  it("still sets Referrer-Policy", () => {
    const response = applySecurityHeaders(new Response("ok"), "wedding");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("sets the fallback wedding CSP when response has no pre-existing CSP", () => {
    const response = applySecurityHeaders(new Response("ok"), "wedding");
    expect(response.headers.get("Content-Security-Policy")).toBe(
      WEDDING_PAGE_CSP,
    );
    expect(response.headers.get("Content-Security-Policy")).not.toBe(
      MARKETING_CSP,
    );
  });

  it("preserves a pre-existing CSP set by the page (dynamic CSP wins)", () => {
    const dynamicCsp =
      "default-src 'self'; connect-src 'self' https://api.kaiplan.app; script-src 'self' https://challenges.cloudflare.com";
    const preBuilt = new Response("ok", {
      headers: { "Content-Security-Policy": dynamicCsp },
    });
    const response = applySecurityHeaders(preBuilt, "wedding");
    expect(response.headers.get("Content-Security-Policy")).toBe(dynamicCsp);
  });
});

describe("applySecurityHeaders  -  api policy", () => {
  it("applies API crawler protection from the route policy resolver", () => {
    const policy = getRouteHeaderPolicy("/api/marketing/signup");
    const response = applySecurityHeaders(new Response("ok"), policy);

    expect(policy).toBe("api");
    expect(response.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("still sets X-Content-Type-Options: nosniff", () => {
    const response = applySecurityHeaders(new Response("ok"), "api");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("still sets Strict-Transport-Security with preload", () => {
    const response = applySecurityHeaders(new Response("ok"), "api");
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
  });

  it("does not set a Content-Security-Policy", () => {
    const response = applySecurityHeaders(new Response("ok"), "api");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("keeps API responses out of search indexes", () => {
    const response = applySecurityHeaders(new Response("ok"), "api");
    expect(response.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("keeps only base headers for unknown policies", () => {
    const response = applySecurityHeaders(
      new Response("ok"),
      "unknown" as never,
    );

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
});
