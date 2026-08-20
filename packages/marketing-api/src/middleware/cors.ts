import { createMiddleware } from "hono/factory";

export function cors(allowedOrigin: string) {
  return createMiddleware(async (c, next) => {
    c.header("Access-Control-Allow-Origin", allowedOrigin);
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Expose-Headers", "X-Kaiplan-Error-Id");
    // Vary: Origin tells HTTP caches that the response varies by the Origin
    // request header — prevents a cached CORS-allowed response from being
    // served to a different origin that should be denied.
    c.header("Vary", "Origin");

    // Handle OPTIONS preflight before origin check — browsers need to read
    // the preflight response to enforce CORS client-side.
    if (c.req.method === "OPTIONS") {
      const origin = c.req.header("Origin");
      if (origin && origin !== allowedOrigin) {
        c.header("Access-Control-Allow-Origin", "");
      }
      return c.body(null, 204);
    }

    const origin = c.req.header("Origin");
    if (origin && origin !== allowedOrigin) {
      // Override CORS headers on forbidden responses so we don't leak
      // the allowed origin to cross-origin attackers.
      c.header("Access-Control-Allow-Origin", "");
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  });
}
