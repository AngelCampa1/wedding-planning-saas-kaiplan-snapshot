import { describe, expect, it, vi } from "vitest";

vi.mock("astro:middleware", () => ({
  defineMiddleware: (handler: unknown) => handler,
}));

import { onRequest } from "./middleware";
import { MARKETING_CSP, WEDDING_PAGE_CSP } from "./lib/security-headers";

describe("onRequest middleware", () => {
  it("applies full security headers to regular marketing routes", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/compare/"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    expect(result.headers.get("Content-Security-Policy")).toBe(MARKETING_CSP);
    expect(result.headers.get("X-Frame-Options")).toBe("DENY");
    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(result.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
    expect(result.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("omits upgrade-insecure-requests on local HTTP preview routes", async () => {
    const result = await onRequest(
      {
        url: new URL("http://127.0.0.1:3031/"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    expect(result.headers.get("Content-Security-Policy")).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(result.headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'",
    );
  });

  it("leaves local API responses without a CSP", async () => {
    const result = await onRequest(
      {
        url: new URL("http://127.0.0.1:3031/api/marketing/signup"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    expect(result.headers.get("Content-Security-Policy")).toBeNull();
    expect(result.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("applies relaxed CSP to /w/* routes but keeps HSTS, XFO, and nosniff", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/w/mia-and-noah"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    expect(result.headers.get("Content-Security-Policy")).toBe(
      WEDDING_PAGE_CSP,
    );
    expect(result.headers.get("X-Frame-Options")).toBe("DENY");
    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(result.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
    expect(result.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("applies noindex robots headers to /w/* routes while preserving wedding CSP", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/w/mia-and-noah?token=secret"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    expect(result.headers.get("Content-Security-Policy")).toBe(
      WEDDING_PAGE_CSP,
    );
    expect(result.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("applies the full WEDDING_PAGE_CSP to /w/* routes when page sets no inline CSP", async () => {
    // Verify the full CSP (not a weaker inline override) is applied to wedding pages.
    // The slug.astro must not set its own Content-Security-Policy header so the
    // middleware's WEDDING_PAGE_CSP always wins.
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/w/anna-and-lee"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    const csp = result.headers.get("Content-Security-Policy");
    expect(csp).toBe(WEDDING_PAGE_CSP);
    // Verify the full CSP includes directives that the old weaker inline CSP was missing
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("preserves a route-defined CSP on /w/* routes", async () => {
    const routeCsp = "default-src 'self'; script-src 'self'";
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/w/anna-and-lee"),
      } as never,
      async () =>
        new Response("ok", {
          headers: { "Content-Security-Policy": routeCsp },
        }),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    expect(result.headers.get("Content-Security-Policy")).toBe(routeCsp);
  });

  it("applies no CSP to /api/* routes but keeps HSTS and nosniff", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/api/marketing/signup"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    expect(result.headers.get("Content-Security-Policy")).toBeNull();
    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(result.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
    expect(result.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
  });

  it("clones immutable responses before applying marketing security headers", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/compare/"),
      } as never,
      async () => Response.redirect("https://kaiplan.app/pricing/", 302),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("https://kaiplan.app/pricing/");
    expect(result.headers.get("Content-Security-Policy")).toBe(MARKETING_CSP);
    expect(result.headers.get("X-Frame-Options")).toBe("DENY");
    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(result.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
  });

  it("applies full security headers to the root route", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }

    expect(result.headers.get("Content-Security-Policy")).toBe(MARKETING_CSP);
  });

  it("301 redirects non-trailing-slash marketing URLs to trailing-slash", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/compare"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(301);
    expect(result.headers.get("Location")).toBe("https://kaiplan.app/compare/");
  });
  it("301 redirects apex HTTP URLs to HTTPS and trailing slash in one hop", async () => {
    const result = await onRequest(
      {
        url: new URL("http://kaiplan.app/compare?utm_source=test"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(301);
    expect(result.headers.get("Location")).toBe(
      "https://kaiplan.app/compare/?utm_source=test",
    );
  });

  it("301 redirects www URLs to canonical apex trailing-slash URLs", async () => {
    const result = await onRequest(
      {
        url: new URL("https://www.kaiplan.app/features?ref=nav"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(301);
    expect(result.headers.get("Location")).toBe(
      "https://kaiplan.app/features/?ref=nav",
    );
  });

  it("301 redirects pricing markdown artifact URLs to the canonical pricing page", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/pricing.md?utm_source=test"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(301);
    expect(result.headers.get("Location")).toBe(
      "https://kaiplan.app/pricing/?utm_source=test",
    );
  });

  it("does not redirect /api/* routes even without trailing slash", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/api/marketing/signup"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(200);
  });

  it("does not redirect paths with file extensions", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/sitemap-index.xml"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(200);
  });

  it("serves the web manifest at both slash variants before Astro routing", async () => {
    for (const path of ["/site.webmanifest", "/site.webmanifest/"]) {
      const next = vi.fn(
        async () => new Response("not found", { status: 404 }),
      );
      const result = await onRequest(
        {
          url: new URL(`https://kaiplan.app${path}`),
        } as never,
        next,
      );

      expect(result).toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        throw new TypeError("Expected a Response from the middleware");
      }

      const manifest = await result.json();
      expect(next).not.toHaveBeenCalled();
      expect(result.status).toBe(200);
      expect(result.headers.get("content-type")).toContain(
        "application/manifest+json",
      );
      expect(result.headers.get("Content-Security-Policy")).toBe(MARKETING_CSP);
      expect(manifest.short_name).toBe("Kaiplan");
    }
  });

  it("keeps canonical redirects ahead of the web manifest handler", async () => {
    const result = await onRequest(
      {
        url: new URL("https://www.kaiplan.app/site.webmanifest"),
      } as never,
      async () => new Response("not found", { status: 404 }),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(301);
    expect(result.headers.get("Location")).toBe(
      "https://kaiplan.app/site.webmanifest",
    );
  });

  it("redirects /blog/post-v2.0 (dot in segment, not an extension) to /blog/post-v2.0/", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/blog/post-v2.0"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(301);
    expect(result.headers.get("Location")).toBe(
      "https://kaiplan.app/blog/post-v2.0/",
    );
  });

  it("does not redirect /favicon.ico", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/favicon.ico"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(200);
  });

  it("does not redirect /path/file.json", async () => {
    const result = await onRequest(
      {
        url: new URL("https://kaiplan.app/path/file.json"),
      } as never,
      async () => new Response("ok"),
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      throw new TypeError("Expected a Response from the middleware");
    }
    expect(result.status).toBe(200);
  });
});

it("blocks direct public lead magnet PDF requests", async () => {
  const result = await onRequest(
    {
      url: new URL("https://kaiplan.app/lead-magnets/budget-template.pdf"),
    } as never,
    async () => new Response("pdf"),
  );

  expect(result).toBeInstanceOf(Response);
  if (!(result instanceof Response)) {
    throw new TypeError("Expected a Response from the middleware");
  }
  expect(result.status).toBe(404);
  expect(result.headers.get("Content-Type")).toBe("text/plain");
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(result.headers.get("X-Robots-Tag")).toBe("noindex");
});
