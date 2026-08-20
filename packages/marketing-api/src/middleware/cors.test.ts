import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { cors } from "./cors";

function createApp(origin: string) {
  const app = new Hono();
  app.use("*", cors(origin));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("cors middleware", () => {
  it("returns 403 for wrong Origin header without leaking allowed origin", async () => {
    const app = createApp("https://allowed.com");
    const res = await app.request("/test", {
      headers: { Origin: "https://evil.com" },
    });
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Forbidden");
    // The 403 response must not expose the allowed origin to attackers
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("");
  });

  it("passes through with correct Origin header and sets CORS headers", async () => {
    const app = createApp("https://allowed.com");
    const res = await app.request("/test", {
      headers: { Origin: "https://allowed.com" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://allowed.com",
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization",
    );
    expect(res.headers.get("Access-Control-Expose-Headers")).toBe(
      "X-Kaiplan-Error-Id",
    );
  });

  it("passes through with no Origin header", async () => {
    const app = createApp("https://allowed.com");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const app = createApp("https://allowed.com");
    const res = await app.request("/test", {
      method: "OPTIONS",
      headers: { Origin: "https://allowed.com" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://allowed.com",
    );
  });

  // Bug #1: OPTIONS preflight must be handled BEFORE the origin check.
  // When the origin check runs first and the request is OPTIONS from any origin,
  // a 403 is returned before CORS headers are ever set — browsers can't read
  // the preflight response and block the actual request entirely.
  // BUG 2: When Access-Control-Allow-Origin depends on the Origin request header,
  // the response must include Vary: Origin so HTTP caches don't serve the wrong
  // CORS headers to a different origin.
  it("sets Vary: Origin on all responses", async () => {
    const app = createApp("https://allowed.com");

    // Non-OPTIONS request with matching origin
    const resNormal = await app.request("/test", {
      headers: { Origin: "https://allowed.com" },
    });
    expect(resNormal.headers.get("Vary")).toBe("Origin");

    // Non-OPTIONS request with no origin
    const resNoOrigin = await app.request("/test");
    expect(resNoOrigin.headers.get("Vary")).toBe("Origin");

    // OPTIONS preflight
    const resPreflight = await app.request("/test", {
      method: "OPTIONS",
      headers: { Origin: "https://allowed.com" },
    });
    expect(resPreflight.headers.get("Vary")).toBe("Origin");
  });

  it("returns 204 for OPTIONS preflight from a cross-origin without leaking allowed origin", async () => {
    const app = createApp("https://allowed.com");
    const res = await app.request("/test", {
      method: "OPTIONS",
      headers: { Origin: "https://other.com" },
    });
    expect(res.status).toBe(204);
    // Cross-origin preflight must not leak the allowed origin
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("");
  });
});
