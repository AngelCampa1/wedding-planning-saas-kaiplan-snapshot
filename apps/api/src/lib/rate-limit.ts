import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { Env } from "./env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitState {
  count: number;
  windowStart: number;
}

interface RateLimitRequest {
  key: string;
  limit: number;
  window: number;
}

export interface RateLimitOptions {
  limit: number;
  window: number;
  keyFn: (c: Context) => string;
}

// ---------------------------------------------------------------------------
// RateLimiter Durable Object
// ---------------------------------------------------------------------------

/**
 * Durable Object that tracks request counts per key within a sliding window.
 *
 * Request body (POST /check):
 *   { key: string, limit: number, window: number (seconds) }
 *
 * Response body:
 *   { allowed: boolean, remaining: number, resetAt: number (unix ms) }
 */
export class RateLimiter {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", Allow: "POST" },
      });
    }

    const body = (await request.json()) as RateLimitRequest;
    const { key, limit, window } = body;

    const nowMs = Date.now();
    const windowMs = window * 1000;

    const stored = await this.state.storage.get<RateLimitState>(key);

    let windowStart: number;
    let count: number;

    if (!stored || nowMs - stored.windowStart >= windowMs) {
      // New window
      windowStart = nowMs;
      count = 0;
    } else {
      windowStart = stored.windowStart;
      count = stored.count;
    }

    const allowed = count < limit;

    if (allowed) {
      count += 1;
      await this.state.storage.put<RateLimitState>(key, { count, windowStart });
    }

    const resetAt = windowStart + windowMs;
    const remaining = Math.max(0, limit - count);

    const result: RateLimitResult = { allowed, remaining, resetAt };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ---------------------------------------------------------------------------
// Hono middleware factory
// ---------------------------------------------------------------------------

/**
 * Returns a Hono middleware that rate-limits requests using a Durable Object.
 *
 * If the `RATE_LIMITER` binding is not available (e.g. E2E / local test mode),
 * the middleware is a no-op and passes through all requests.
 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    // Guard: skip rate limiting when the DO binding is unavailable (E2E mode).
    if (!c.env.RATE_LIMITER) {
      return next();
    }

    const key = options.keyFn(c);
    const id = c.env.RATE_LIMITER.idFromName(key);
    const stub = c.env.RATE_LIMITER.get(id);

    const res = await stub.fetch(
      new Request("https://rate-limiter.internal/check", {
        method: "POST",
        body: JSON.stringify({
          key,
          limit: options.limit,
          window: options.window,
        }),
      }),
    );

    const result = (await res.json()) as RateLimitResult;

    if (!result.allowed) {
      const nowMs = Date.now();
      const retryAfterSeconds = Math.ceil((result.resetAt - nowMs) / 1000);
      return c.json(
        { error: "Rate limit exceeded. Please try again later." },
        429,
        { "Retry-After": String(Math.max(1, retryAfterSeconds)) },
      );
    }

    return next();
  });
}

// ---------------------------------------------------------------------------
// Convenience key extractor for auth endpoints
// ---------------------------------------------------------------------------

/**
 * Extracts an IP-based rate-limit key from the request context, preferring
 * the `CF-Connecting-IP` Cloudflare header.
 *
 * M10: `X-Forwarded-For` is NOT used as a fallback because it is client-
 * controlled and can be spoofed to bypass rate limits. When
 * `CF-Connecting-IP` is absent (non-Cloudflare traffic / local dev),
 * unknown-origin requests share a single `"unknown"` bucket — conservative
 * and correct.
 */
export function ipKeyFn(c: Context): string {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  return `ip:${ip}`;
}
