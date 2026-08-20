import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import {
  RateLimiter,
  createRateLimitMiddleware,
  ipKeyFn,
  type RateLimitResult,
} from "../../src/lib/rate-limit";

// ---------------------------------------------------------------------------
// Minimal DurableObjectStorage stub
// ---------------------------------------------------------------------------
class MemStorage {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

// Minimal DurableObjectState stub
function makeState(): DurableObjectState {
  const storage = new MemStorage() as unknown as DurableObjectStorage;
  return { storage } as unknown as DurableObjectState;
}

// ---------------------------------------------------------------------------
// RateLimiter Durable Object tests
// ---------------------------------------------------------------------------
describe("RateLimiter", () => {
  let state: DurableObjectState;
  let limiter: RateLimiter;

  beforeEach(() => {
    state = makeState();
    limiter = new RateLimiter(state);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("allows first request (under limit)", async () => {
    const req = new Request("https://example.com/check", {
      method: "POST",
      body: JSON.stringify({ key: "ip:1.2.3.4", limit: 10, window: 60 }),
    });
    const res = await limiter.fetch(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitResult;
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(9);
    expect(typeof body.resetAt).toBe("number");
  });

  it("tracks request count correctly (at limit)", async () => {
    const limit = 3;
    for (let i = 0; i < limit; i++) {
      const req = new Request("https://example.com/check", {
        method: "POST",
        body: JSON.stringify({ key: "ip:1.2.3.4", limit, window: 60 }),
      });
      const res = await limiter.fetch(req);
      const body = (await res.json()) as RateLimitResult;
      expect(body.allowed).toBe(true);
      expect(body.remaining).toBe(limit - 1 - i);
    }
  });

  it("blocks request over limit (returns allowed: false)", async () => {
    const limit = 2;
    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      const req = new Request("https://example.com/check", {
        method: "POST",
        body: JSON.stringify({ key: "ip:1.2.3.4", limit, window: 60 }),
      });
      await limiter.fetch(req);
    }
    // Next request should be blocked
    const req = new Request("https://example.com/check", {
      method: "POST",
      body: JSON.stringify({ key: "ip:1.2.3.4", limit, window: 60 }),
    });
    const res = await limiter.fetch(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as RateLimitResult;
    expect(body.allowed).toBe(false);
    expect(body.remaining).toBe(0);
  });

  it("resets count after window expires", async () => {
    const limit = 2;
    const window = 60;

    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      const req = new Request("https://example.com/check", {
        method: "POST",
        body: JSON.stringify({ key: "ip:1.2.3.4", limit, window }),
      });
      await limiter.fetch(req);
    }

    // Advance time past the window
    vi.advanceTimersByTime((window + 1) * 1000);

    // Should be allowed again
    const req = new Request("https://example.com/check", {
      method: "POST",
      body: JSON.stringify({ key: "ip:1.2.3.4", limit, window }),
    });
    const res = await limiter.fetch(req);
    const body = (await res.json()) as RateLimitResult;
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(limit - 1);
  });

  it("returns 405 for non-POST methods", async () => {
    const req = new Request("https://example.com/check", { method: "GET" });
    const res = await limiter.fetch(req);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("resets window and allows request when window has exactly expired", async () => {
    const limit = 1;
    const window = 30;
    // Exhaust the limit
    await limiter.fetch(
      new Request("https://example.com/check", {
        method: "POST",
        body: JSON.stringify({ key: "ip:reset-test", limit, window }),
      }),
    );

    // Advance exactly past the window
    vi.advanceTimersByTime(window * 1000 + 1);

    // Should be allowed again with fresh count
    const req = new Request("https://example.com/check", {
      method: "POST",
      body: JSON.stringify({ key: "ip:reset-test", limit, window }),
    });
    const res = await limiter.fetch(req);
    const body = (await res.json()) as RateLimitResult;
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(0); // limit - 1
  });

  it("does not increment count when request is blocked", async () => {
    const limit = 1;
    const window = 60;

    // Exhaust
    await limiter.fetch(
      new Request("https://example.com/check", {
        method: "POST",
        body: JSON.stringify({ key: "ip:no-inc", limit, window }),
      }),
    );

    // Two blocked attempts
    for (let i = 0; i < 2; i++) {
      const res = await limiter.fetch(
        new Request("https://example.com/check", {
          method: "POST",
          body: JSON.stringify({ key: "ip:no-inc", limit, window }),
        }),
      );
      const body = (await res.json()) as RateLimitResult;
      expect(body.allowed).toBe(false);
      expect(body.remaining).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// createRateLimitMiddleware tests
// ---------------------------------------------------------------------------
describe("createRateLimitMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  type TestEnv = {
    Bindings: {
      RATE_LIMITER?: DurableObjectNamespace;
      E2E_MODE?: string;
      ENVIRONMENT?: string;
    };
  };

  // Builds a minimal DurableObjectNamespace stub backed by a single in-memory RateLimiter
  function makeNamespace(): DurableObjectNamespace {
    const state = makeState();
    const doInstance = new RateLimiter(state);

    const stub = {
      fetch: (req: Request) => doInstance.fetch(req),
    } as unknown as DurableObjectStub;

    return {
      idFromName: (_name: string) =>
        ({ toString: () => _name }) as DurableObjectId,
      get: (_id: DurableObjectId) => stub,
      newUniqueId: () => ({ toString: () => "unique" }) as DurableObjectId,
      jurisdiction: () => ({}) as DurableObjectNamespace,
    } as unknown as DurableObjectNamespace;
  }

  function makeApp() {
    const app = new Hono<TestEnv>();

    app.use(
      "/protected",
      createRateLimitMiddleware({
        limit: 2,
        window: 60,
        keyFn: (c) => {
          const ip =
            c.req.header("CF-Connecting-IP") ??
            c.req.header("X-Forwarded-For") ??
            "unknown";
          return `ip:${ip}`;
        },
      }),
    );

    app.post("/protected", (c) => c.json({ ok: true }));

    return app;
  }

  it("allows requests under the limit", async () => {
    const ns = makeNamespace();
    const app = makeApp();
    const env = { RATE_LIMITER: ns };

    const res = await app.fetch(
      new Request("http://localhost/protected", {
        method: "POST",
        headers: { "CF-Connecting-IP": "1.2.3.4" },
      }),
      env as never,
    );
    expect(res.status).toBe(200);
  });

  it("returns 429 when limit is exceeded", async () => {
    const ns = makeNamespace();
    const app = makeApp();
    const env = { RATE_LIMITER: ns };

    // Exhaust limit (2 requests)
    for (let i = 0; i < 2; i++) {
      await app.fetch(
        new Request("http://localhost/protected", {
          method: "POST",
          headers: { "CF-Connecting-IP": "1.2.3.4" },
        }),
        env as never,
      );
    }

    // Third request should be blocked
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        method: "POST",
        headers: { "CF-Connecting-IP": "1.2.3.4" },
      }),
      env as never,
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/rate limit/i);
  });

  it("includes Retry-After header in 429 response", async () => {
    const ns = makeNamespace();
    const app = makeApp();
    const env = { RATE_LIMITER: ns };

    for (let i = 0; i < 2; i++) {
      await app.fetch(
        new Request("http://localhost/protected", {
          method: "POST",
          headers: { "CF-Connecting-IP": "5.6.7.8" },
        }),
        env as never,
      );
    }

    const res = await app.fetch(
      new Request("http://localhost/protected", {
        method: "POST",
        headers: { "CF-Connecting-IP": "5.6.7.8" },
      }),
      env as never,
    );

    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("skips rate limiting when RATE_LIMITER binding is undefined (E2E/test mode)", async () => {
    const app = makeApp();
    const env = {}; // no RATE_LIMITER

    // Even exceeding the limit should pass because the binding is missing
    for (let i = 0; i < 5; i++) {
      const res = await app.fetch(
        new Request("http://localhost/protected", {
          method: "POST",
          headers: { "CF-Connecting-IP": "9.9.9.9" },
        }),
        env as never,
      );
      expect(res.status).toBe(200);
    }
  });

  it("uses X-Forwarded-For as fallback when CF-Connecting-IP is absent", async () => {
    const ns = makeNamespace();
    const app = makeApp();
    const env = { RATE_LIMITER: ns };

    // Exhaust limit using X-Forwarded-For
    for (let i = 0; i < 2; i++) {
      await app.fetch(
        new Request("http://localhost/protected", {
          method: "POST",
          headers: { "X-Forwarded-For": "10.0.0.1" },
        }),
        env as never,
      );
    }

    const res = await app.fetch(
      new Request("http://localhost/protected", {
        method: "POST",
        headers: { "X-Forwarded-For": "10.0.0.1" },
      }),
      env as never,
    );

    expect(res.status).toBe(429);
  });

  it("treats different IPs as separate buckets", async () => {
    const ns = makeNamespace();
    const app = makeApp();
    const env = { RATE_LIMITER: ns };

    // Exhaust limit for IP A
    for (let i = 0; i < 2; i++) {
      await app.fetch(
        new Request("http://localhost/protected", {
          method: "POST",
          headers: { "CF-Connecting-IP": "1.1.1.1" },
        }),
        env as never,
      );
    }

    // IP B should still be allowed
    const res = await app.fetch(
      new Request("http://localhost/protected", {
        method: "POST",
        headers: { "CF-Connecting-IP": "2.2.2.2" },
      }),
      env as never,
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// ipKeyFn tests
// ---------------------------------------------------------------------------
describe("ipKeyFn", () => {
  type MinimalEnv = {
    Bindings: {
      RATE_LIMITER?: DurableObjectNamespace;
    };
  };

  function makeContext(_headers: Record<string, string>) {
    const app = new Hono<MinimalEnv>();
    let capturedKey = "";
    app.post("/test", (c) => {
      capturedKey = ipKeyFn(c as unknown as Parameters<typeof ipKeyFn>[0]);
      return c.json({ key: capturedKey });
    });
    return { app, getKey: () => capturedKey };
  }

  it("uses CF-Connecting-IP when present", async () => {
    const { app } = makeContext({});
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "CF-Connecting-IP": "3.3.3.3" },
      }),
      {} as never,
    );
    const body = (await res.json()) as { key: string };
    expect(body.key).toBe("ip:3.3.3.3");
  });

  it("M10: does NOT fall back to X-Forwarded-For (XFF is client-controlled and can be spoofed)", async () => {
    // M10: ipKeyFn must NOT use X-Forwarded-For as a fallback. Requests with
    // only XFF present (no CF-Connecting-IP) must land in the shared "unknown"
    // bucket, not in an attacker-controlled bucket.
    const { app } = makeContext({});
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "X-Forwarded-For": "4.4.4.4" },
      }),
      {} as never,
    );
    const body = (await res.json()) as { key: string };
    // XFF alone must NOT produce "ip:4.4.4.4" — it must fall through to "unknown".
    expect(body.key).toBe("ip:unknown");
  });

  it("falls back to 'unknown' when no IP header is present", async () => {
    const { app } = makeContext({});
    const res = await app.fetch(
      new Request("http://localhost/test", { method: "POST" }),
      {} as never,
    );
    const body = (await res.json()) as { key: string };
    expect(body.key).toBe("ip:unknown");
  });
});
