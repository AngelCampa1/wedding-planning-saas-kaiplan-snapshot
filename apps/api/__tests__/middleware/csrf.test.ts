import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { csrfMiddleware } from "../../src/middleware/csrf";

type TestEnv = {
  Bindings: {
    APP_URL: string;
    PUBLIC_WEB_URL?: string;
  };
};

// Auth cookie headers — CSRF only enforces when one of these is present.
const AUTH_COOKIE = "better-auth.session_token=abc123";
const SECURE_AUTH_COOKIE = "__Secure-better-auth.session_token=abc123";

function makeApp() {
  const app = new Hono<TestEnv>();
  app.use("*", csrfMiddleware());
  app.get("/any", (c) => c.json({ ok: true }));
  app.post("/api/any", (c) => c.json({ ok: true }));
  app.put("/api/any", (c) => c.json({ ok: true }));
  app.patch("/api/any", (c) => c.json({ ok: true }));
  app.delete("/api/any", (c) => c.json({ ok: true }));
  app.post("/api/public/rsvp/token-abc", (c) => c.json({ ok: true }));
  app.post("/api/public/websites/foo", (c) => c.json({ ok: true }));
  app.post("/api/wedding-website/rsvp/xyz", (c) => c.json({ ok: true }));
  app.post("/api/webhooks/stripe", (c) => c.json({ ok: true }));
  app.post("/api/billing/webhook", (c) => c.json({ ok: true }));
  app.post("/api/billing/webhook-extra", (c) => c.json({ ok: true }));
  return app;
}

const BASE_ENV = {
  APP_URL: "https://my.kaiplan.app",
  PUBLIC_WEB_URL: "https://kaiplan.app",
};

describe("csrfMiddleware", () => {
  it("rejects authenticated POST with no Origin or Referer header with 403", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: { Cookie: AUTH_COOKIE },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/origin/i);
  });

  it("allows unauthenticated POST with no Origin header (no session to forge)", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", { method: "POST" }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("allows unauthenticated POST with a non-auth cookie (e.g. analytics)", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: { Cookie: "ph_session=xyz; other=1" },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("enforces CSRF when __Secure- prefixed session cookie is present", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: { Cookie: SECURE_AUTH_COOKIE },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("rejects authenticated POST with a disallowed Origin with 403", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Origin: "https://evil.example.com",
          Cookie: AUTH_COOKIE,
        },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("allows authenticated POST with an allowed Origin (APP_URL)", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Origin: "https://my.kaiplan.app",
          Cookie: AUTH_COOKIE,
        },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("rejects authenticated POST from PUBLIC_WEB_URL", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Origin: "https://kaiplan.app",
          Cookie: AUTH_COOKIE,
        },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("still bypasses public routes for PUBLIC_WEB_URL", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/public/rsvp/token-abc", {
        method: "POST",
        headers: {
          Origin: "https://kaiplan.app",
          Cookie: AUTH_COOKIE,
        },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("falls back to Referer when Origin is absent (authenticated)", async () => {
    const app = makeApp();
    const ok = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Referer: "https://my.kaiplan.app/dashboard",
          Cookie: AUTH_COOKIE,
        },
      }),
      BASE_ENV as never,
    );
    expect(ok.status).toBe(200);

    const bad = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Referer: "https://evil.example.com/steal",
          Cookie: AUTH_COOKIE,
        },
      }),
      BASE_ENV as never,
    );
    expect(bad.status).toBe(403);
  });

  it("rejects malformed Origin even when Referer is allowed", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Origin: "not a url",
          Referer: "https://my.kaiplan.app/dashboard",
          Cookie: AUTH_COOKIE,
        },
      }),
      BASE_ENV as never,
    );

    expect(res.status).toBe(403);
  });

  it("lets GET requests through without Origin verification", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/any", { method: "GET" }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("bypasses CSRF for /api/public/rsvp/* paths", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/public/rsvp/token-abc", {
        method: "POST",
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("bypasses CSRF for /api/public/websites/* paths", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/public/websites/foo", {
        method: "POST",
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("does not bypass CSRF for legacy /api/wedding-website/rsvp/* paths", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/wedding-website/rsvp/xyz", {
        method: "POST",
        headers: { Cookie: AUTH_COOKIE },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("bypasses CSRF for /api/webhooks/* paths (Stripe)", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("bypasses CSRF for /api/billing/webhook (Stripe)", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("does not bypass CSRF for billing webhook path siblings", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/billing/webhook-extra", {
        method: "POST",
        headers: { Cookie: AUTH_COOKIE },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("validates authenticated PUT requests", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "PUT",
        headers: { Cookie: AUTH_COOKIE },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("validates authenticated PATCH requests", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "PATCH",
        headers: { Cookie: AUTH_COOKIE },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("validates authenticated DELETE requests", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "DELETE",
        headers: { Cookie: AUTH_COOKIE },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("lets unauthenticated PUT/PATCH/DELETE pass through", async () => {
    const app = makeApp();
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      const res = await app.fetch(
        new Request("http://localhost/api/any", { method }),
        BASE_ENV as never,
      );
      expect(res.status).toBe(200);
    }
  });

  it("rejects unparseable Referer URL for authenticated request", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Referer: "not a url",
          Cookie: AUTH_COOKIE,
        },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("does NOT treat a cookie whose name contains the session token name as an auth cookie (substring bypass)", async () => {
    // A cookie named `x-better-auth.session_token` contains the target name as
    // a substring — the old `includes()` check would falsely match it. The
    // fixed parser must only match on the exact cookie name.
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Cookie: "x-better-auth.session_token=malicious",
        },
      }),
      BASE_ENV as never,
    );
    // No real auth cookie present — should pass through without CSRF enforcement.
    expect(res.status).toBe(200);
  });

  it("does NOT treat a cookie named better-auth.session_token-extra as an auth cookie (suffix bypass)", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Cookie: "better-auth.session_token-extra=malicious",
        },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(200);
  });

  it("detects the exact cookie name better-auth.session_token (no prefix/suffix)", async () => {
    const app = makeApp();
    // Auth cookie present but no Origin — should be rejected with 403.
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Cookie: "better-auth.session_token=valid-token",
        },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("detects exact __Secure-better-auth.session_token cookie name", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Cookie: "__Secure-better-auth.session_token=valid-token",
        },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("handles multiple cookies and still does exact-name matching", async () => {
    const app = makeApp();
    // Mix of other cookies plus the real session token — should enforce CSRF.
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: {
          Cookie: "analytics=abc; better-auth.session_token=real; other=xyz",
        },
      }),
      BASE_ENV as never,
    );
    expect(res.status).toBe(403);
  });

  it("treats a value-less (flag) cookie that exactly matches a session name as an auth cookie", async () => {
    // RFC 6265 allows cookies without a value: `Cookie: better-auth.session_token`
    // No `=` sign — parseCookieNames must still extract the name correctly.
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        // Flag-style cookie — name only, no `=value` part.
        headers: { Cookie: "better-auth.session_token" },
      }),
      BASE_ENV as never,
    );
    // Auth cookie detected → CSRF enforced → 403 (no Origin).
    expect(res.status).toBe(403);
  });

  it("ignores empty cookie name segments (e.g. double semicolons)", async () => {
    // A cookie header like `; ; other=1` has empty name segments after split.
    // parseCookieNames must skip them and not crash.
    const app = makeApp();
    const res = await app.fetch(
      new Request("http://localhost/api/any", {
        method: "POST",
        headers: { Cookie: ";; other=value ;;" },
      }),
      BASE_ENV as never,
    );
    // No auth cookie present — should pass through without CSRF enforcement.
    expect(res.status).toBe(200);
  });
});
