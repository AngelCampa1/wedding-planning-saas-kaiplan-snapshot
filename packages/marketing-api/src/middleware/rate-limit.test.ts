import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import {
  rateLimit,
  hits,
  identifierBuckets,
  consumeIdentifierToken,
  resetIdentifierPruneClock,
} from "./rate-limit";

function createApp(max: number, windowMs: number) {
  const app = new Hono();
  app.use("*", rateLimit(max, windowMs));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit middleware", () => {
  beforeEach(() => {
    hits.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first request through", async () => {
    const app = createApp(2, 60_000);
    const res = await app.request("/test", {
      headers: { "CF-Connecting-IP": "1.2.3.4" },
    });
    expect(res.status).toBe(200);
  });

  it("returns 429 when limit exceeded", async () => {
    const app = createApp(1, 60_000);
    await app.request("/test", { headers: { "CF-Connecting-IP": "5.6.7.8" } });
    const res = await app.request("/test", {
      headers: { "CF-Connecting-IP": "5.6.7.8" },
    });
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  it("resets at the exact window boundary", async () => {
    const app = createApp(1, 1000);
    await app.request("/test", { headers: { "CF-Connecting-IP": "9.9.9.9" } });
    vi.advanceTimersByTime(1000);
    const res = await app.request("/test", {
      headers: { "CF-Connecting-IP": "9.9.9.9" },
    });
    expect(res.status).toBe(200);
  });

  it("tracks different IPs independently", async () => {
    const app = createApp(1, 60_000);
    await app.request("/test", { headers: { "CF-Connecting-IP": "10.0.0.1" } });
    const res = await app.request("/test", {
      headers: { "CF-Connecting-IP": "10.0.0.2" },
    });
    expect(res.status).toBe(200);
  });

  it("uses the E2E client IP override only in E2E mode", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { env: { E2E_MODE: string; ENVIRONMENT: string } }).env =
        {
          E2E_MODE: "true",
          ENVIRONMENT: "test",
        };
      await next();
    });
    app.use("*", rateLimit(1, 60_000));
    app.get("/test", (c) => c.json({ ok: true }));

    await app.request("/test", {
      headers: { "X-Kaiplan-E2E-IP": "203.0.113.10" },
    });
    const res = await app.request("/test", {
      headers: { "X-Kaiplan-E2E-IP": "203.0.113.11" },
    });

    expect(res.status).toBe(200);
  });

  it("ignores the E2E client IP override in production mode", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { env: { E2E_MODE: string; ENVIRONMENT: string } }).env =
        {
          E2E_MODE: "true",
          ENVIRONMENT: "production",
        };
      await next();
    });
    app.use("*", rateLimit(1, 60_000));
    app.get("/test", (c) => c.json({ ok: true }));

    await app.request("/test", {
      headers: { "X-Kaiplan-E2E-IP": "203.0.113.10" },
    });
    const res = await app.request("/test", {
      headers: { "X-Kaiplan-E2E-IP": "203.0.113.11" },
    });

    expect(res.status).toBe(429);
  });

  it("ignores the E2E client IP override outside E2E mode", async () => {
    const app = createApp(1, 60_000);

    await app.request("/test", {
      headers: { "X-Kaiplan-E2E-IP": "203.0.113.10" },
    });
    const res = await app.request("/test", {
      headers: { "X-Kaiplan-E2E-IP": "203.0.113.11" },
    });

    expect(res.status).toBe(429);
  });

  it("uses 'unknown' when CF-Connecting-IP missing", async () => {
    const app = createApp(1, 60_000);
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("isolates counters per site", async () => {
    const appA = new Hono();
    appA.use("*", async (c, next) => {
      (c as unknown as { env: { PRODUCT_DOMAIN: string } }).env = {
        PRODUCT_DOMAIN: "site-a.example.com",
      };
      await next();
    });
    appA.use("*", rateLimit(1, 60_000));
    appA.get("/test", (c) => c.json({ ok: true }));

    const appB = new Hono();
    appB.use("*", async (c, next) => {
      (c as unknown as { env: { PRODUCT_DOMAIN: string } }).env = {
        PRODUCT_DOMAIN: "site-b.example.com",
      };
      await next();
    });
    appB.use("*", rateLimit(1, 60_000));
    appB.get("/test", (c) => c.json({ ok: true }));

    const ip = "5.5.5.5";

    await appA.request("/test", { headers: { "CF-Connecting-IP": ip } });
    const resA2 = await appA.request("/test", {
      headers: { "CF-Connecting-IP": ip },
    });
    expect(resA2.status).toBe(429);

    const resB1 = await appB.request("/test", {
      headers: { "CF-Connecting-IP": ip },
    });
    expect(resB1.status).toBe(200);
  });

  it("falls back to host header when PRODUCT_DOMAIN is not set", async () => {
    const appNoEnv = new Hono();
    appNoEnv.use("*", rateLimit(1, 60_000));
    appNoEnv.get("/test", (c) => c.json({ ok: true }));

    const res1 = await appNoEnv.request("/test", {
      headers: { "CF-Connecting-IP": "1.1.1.1", Host: "fallback.example.com" },
    });
    expect(res1.status).toBe(200);

    const res2 = await appNoEnv.request("/test", {
      headers: { "CF-Connecting-IP": "1.1.1.1", Host: "fallback.example.com" },
    });
    expect(res2.status).toBe(429);
  });

  it("prunes expired entries on the next request without waiting for 100 requests", async () => {
    const app = createApp(200, 500);

    for (let i = 0; i < 3; i++) {
      await app.request("/test", {
        headers: { "CF-Connecting-IP": `192.168.20.${i}` },
      });
    }
    expect(hits.size).toBe(3);

    vi.advanceTimersByTime(600);

    await app.request("/test", {
      headers: { "CF-Connecting-IP": "10.1.2.3" },
    });

    expect(hits.size).toBe(1);
  });

  it("hitting one route does not block a different route for the same IP", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { env: { PRODUCT_DOMAIN: string } }).env = {
        PRODUCT_DOMAIN: "cross-route-test.com",
      };
      await next();
    });
    app.use("/api/pricing-click", rateLimit(3, 60_000));
    app.use("/api/signup", rateLimit(3, 60_000));
    app.post("/api/pricing-click", (c) => c.json({ ok: true }));
    app.post("/api/signup", (c) => c.json({ ok: true }));

    const ip = "11.22.33.44";

    for (let i = 0; i < 3; i++) {
      await app.request("/api/pricing-click", {
        method: "POST",
        headers: { "CF-Connecting-IP": ip },
      });
    }

    const blockedClick = await app.request("/api/pricing-click", {
      method: "POST",
      headers: { "CF-Connecting-IP": ip },
    });
    expect(blockedClick.status).toBe(429);

    const signupRes = await app.request("/api/signup", {
      method: "POST",
      headers: { "CF-Connecting-IP": ip },
    });
    expect(signupRes.status).toBe(200);
  });

  it("shares a counter across routes when the same route-group scope is used", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { env: { PRODUCT_DOMAIN: string } }).env = {
        PRODUCT_DOMAIN: "scoped-route-test.com",
      };
      await next();
    });
    app.use("/api/signup", rateLimit(1, 60_000, "signup"));
    app.use("/api/signup/confirm", rateLimit(1, 60_000, "signup"));
    app.post("/api/signup", (c) => c.json({ ok: true }));
    app.post("/api/signup/confirm", (c) => c.json({ ok: true }));

    const ip = "55.66.77.88";

    const first = await app.request("/api/signup", {
      method: "POST",
      headers: { "CF-Connecting-IP": ip },
    });
    expect(first.status).toBe(200);

    const second = await app.request("/api/signup/confirm", {
      method: "POST",
      headers: { "CF-Connecting-IP": ip },
    });
    expect(second.status).toBe(429);
  });

  it("isolates counters per HTTP method", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as unknown as { env: { PRODUCT_DOMAIN: string } }).env = {
        PRODUCT_DOMAIN: "method-test.com",
      };
      await next();
    });
    app.use("/api/stats", rateLimit(1, 60_000));
    app.get("/api/stats", (c) => c.json({ ok: true }));
    app.post("/api/stats", (c) => c.json({ ok: true }));

    const ip = "50.50.50.50";

    await app.request("/api/stats", {
      headers: { "CF-Connecting-IP": ip },
    });
    const blockedGet = await app.request("/api/stats", {
      headers: { "CF-Connecting-IP": ip },
    });
    expect(blockedGet.status).toBe(429);

    const postRes = await app.request("/api/stats", {
      method: "POST",
      headers: { "CF-Connecting-IP": ip },
    });
    expect(postRes.status).toBe(200);
  });
});

describe("consumeIdentifierToken", () => {
  beforeEach(() => {
    identifierBuckets.clear();
    resetIdentifierPruneClock();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the default capacity then blocks", () => {
    expect(consumeIdentifierToken("signup-email", "a@test.com")).toBe(true);
    expect(consumeIdentifierToken("signup-email", "a@test.com")).toBe(true);
    expect(consumeIdentifierToken("signup-email", "a@test.com")).toBe(true);
    expect(consumeIdentifierToken("signup-email", "a@test.com")).toBe(false);
  });

  it("normalizes identifier by lowercasing and trimming", () => {
    expect(consumeIdentifierToken("signup-email", "A@Test.com ")).toBe(true);
    expect(consumeIdentifierToken("signup-email", " a@test.com")).toBe(true);
    expect(consumeIdentifierToken("signup-email", "a@test.com")).toBe(true);
    expect(consumeIdentifierToken("signup-email", "A@TEST.COM")).toBe(false);
  });

  it("refills one token after the refill interval", () => {
    for (let i = 0; i < 3; i++) {
      expect(consumeIdentifierToken("signup-email", "b@test.com")).toBe(true);
    }
    expect(consumeIdentifierToken("signup-email", "b@test.com")).toBe(false);

    vi.advanceTimersByTime(600_000);
    expect(consumeIdentifierToken("signup-email", "b@test.com")).toBe(true);
    expect(consumeIdentifierToken("signup-email", "b@test.com")).toBe(false);
  });

  it("does not refill beyond capacity", () => {
    expect(consumeIdentifierToken("signup-email", "c@test.com")).toBe(true);
    // Idle for a long time — should cap at capacity, not accumulate.
    vi.advanceTimersByTime(600_000 * 100);
    for (let i = 0; i < 3; i++) {
      expect(consumeIdentifierToken("signup-email", "c@test.com")).toBe(true);
    }
    expect(consumeIdentifierToken("signup-email", "c@test.com")).toBe(false);
  });

  it("isolates buckets per prefix and per identifier", () => {
    for (let i = 0; i < 3; i++) {
      consumeIdentifierToken("signup-email", "d@test.com");
    }
    expect(consumeIdentifierToken("signup-email", "d@test.com")).toBe(false);
    // Different prefix, same identifier — independent bucket.
    expect(consumeIdentifierToken("feedback-email", "d@test.com")).toBe(true);
    // Different identifier, same prefix — independent bucket.
    expect(consumeIdentifierToken("signup-email", "e@test.com")).toBe(true);
  });

  it("honors custom capacity and refill interval options", () => {
    const opts = { capacity: 1, refillIntervalMs: 1000 };
    expect(consumeIdentifierToken("custom", "x", opts)).toBe(true);
    expect(consumeIdentifierToken("custom", "x", opts)).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(consumeIdentifierToken("custom", "x", opts)).toBe(true);
  });

  it("prunes fully refilled idle identifier buckets", () => {
    const opts = { capacity: 2, refillIntervalMs: 1000, maxBuckets: 10 };

    expect(consumeIdentifierToken("signup-email", "idle@test.com", opts)).toBe(
      true,
    );
    expect(identifierBuckets.size).toBe(1);

    vi.advanceTimersByTime(2000);

    expect(
      consumeIdentifierToken("signup-email", "active@test.com", opts),
    ).toBe(true);
    expect(identifierBuckets.has("signup-email:idle@test.com")).toBe(false);
    expect(identifierBuckets.has("signup-email:active@test.com")).toBe(true);
  });

  it("evicts the oldest identifier bucket when the cap is reached", () => {
    const opts = { capacity: 3, refillIntervalMs: 60_000, maxBuckets: 2 };

    expect(consumeIdentifierToken("signup-email", "old@test.com", opts)).toBe(
      true,
    );
    vi.advanceTimersByTime(10);
    expect(consumeIdentifierToken("signup-email", "new@test.com", opts)).toBe(
      true,
    );
    expect(identifierBuckets.size).toBe(2);

    vi.advanceTimersByTime(10);
    expect(consumeIdentifierToken("signup-email", "third@test.com", opts)).toBe(
      true,
    );

    expect(identifierBuckets.size).toBe(2);
    expect(identifierBuckets.has("signup-email:old@test.com")).toBe(false);
    expect(identifierBuckets.has("signup-email:new@test.com")).toBe(true);
    expect(identifierBuckets.has("signup-email:third@test.com")).toBe(true);
  });

  it("preserves an exhausted (throttled) bucket and evicts a fuller one on overflow", () => {
    const opts = { capacity: 3, refillIntervalMs: 600_000, maxBuckets: 2 };

    // Exhaust an attacker's bucket to tokens === 0.
    for (let i = 0; i < 3; i++) {
      consumeIdentifierToken("signup-email", "attacker@test.com", opts);
    }
    expect(
      consumeIdentifierToken("signup-email", "attacker@test.com", opts),
    ).toBe(false);

    // Add a fuller bucket (tokens === 2 after one consume).
    consumeIdentifierToken("signup-email", "fuller@test.com", opts);

    // Map is now at capacity (2). The next distinct identity triggers eviction.
    // The fullest bucket (fuller@test.com) must be evicted, not the exhausted
    // attacker bucket, so the attacker stays throttled.
    consumeIdentifierToken("signup-email", "flood@test.com", opts);

    expect(identifierBuckets.has("signup-email:attacker@test.com")).toBe(true);
    expect(
      identifierBuckets.get("signup-email:attacker@test.com")?.tokens,
    ).toBe(0);
    expect(identifierBuckets.has("signup-email:fuller@test.com")).toBe(false);
  });

  it("breaks eviction ties by removing the oldest lastRefill", () => {
    const opts = { capacity: 3, refillIntervalMs: 600_000, maxBuckets: 2 };

    consumeIdentifierToken("signup-email", "older@test.com", opts);
    vi.advanceTimersByTime(10);
    consumeIdentifierToken("signup-email", "newer@test.com", opts);
    vi.advanceTimersByTime(10);
    // Both surviving buckets share tokens === 2; the older one is evicted.
    consumeIdentifierToken("signup-email", "trigger@test.com", opts);

    expect(identifierBuckets.has("signup-email:older@test.com")).toBe(false);
    expect(identifierBuckets.has("signup-email:newer@test.com")).toBe(true);
    expect(identifierBuckets.has("signup-email:trigger@test.com")).toBe(true);
  });

  it("still prunes fully-idle buckets once enough time has elapsed", () => {
    const opts = { capacity: 2, refillIntervalMs: 1000, maxBuckets: 100 };

    consumeIdentifierToken("signup-email", "idle@test.com", opts);
    expect(identifierBuckets.size).toBe(1);

    // Advance well past the idle-full threshold so the prune gate fires.
    vi.advanceTimersByTime(5000);

    consumeIdentifierToken("signup-email", "active@test.com", opts);
    expect(identifierBuckets.has("signup-email:idle@test.com")).toBe(false);
    expect(identifierBuckets.has("signup-email:active@test.com")).toBe(true);
  });
});
