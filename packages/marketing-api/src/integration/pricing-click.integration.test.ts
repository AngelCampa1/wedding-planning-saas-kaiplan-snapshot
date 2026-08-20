import { beforeEach, describe, expect, it } from "vitest";
import { makeApp, clearRateLimit } from "./setup";

describe("POST /api/pricing-click", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;

  beforeEach(async () => {
    clearRateLimit();
    app = await makeApp();
  });

  async function post(body: unknown) {
    return app.request("/api/pricing-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 200 for valid click", async () => {
    const res = await post({
      tier: "essential",
      sourcePage: "/",
      sessionId: "sess-abc",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });

  it("returns 400 for missing tier", async () => {
    const res = await post({ sourcePage: "/", sessionId: "sess-abc" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing sourcePage", async () => {
    const res = await post({ tier: "essential", sessionId: "sess-abc" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing sessionId", async () => {
    const res = await post({ tier: "essential", sourcePage: "/" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-string tier", async () => {
    const res = await post({
      tier: 123,
      sourcePage: "/",
      sessionId: "sess-abc",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when tier contains special characters", async () => {
    // "essential!@#" → "essential" after sanitization → still valid
    const res = await post({
      tier: "essential!@#",
      sourcePage: "/",
      sessionId: "sess-abc",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when tier becomes empty after sanitization", async () => {
    // "!@#$%" → "" after regex strips non-alphanum — should 400
    const res = await post({
      tier: "!@#$%",
      sourcePage: "/",
      sessionId: "sess-abc",
    });
    expect(res.status).toBe(400);
  });

  it("hyphens are allowed in tier names", async () => {
    const res = await post({
      tier: "pro-annual",
      sourcePage: "/",
      sessionId: "sess-abc",
    });
    expect(res.status).toBe(200);
  });

  it("allows multiple clicks for the same session without deduplication", async () => {
    await post({ tier: "essential", sourcePage: "/", sessionId: "same-sess" });
    const res = await post({
      tier: "premium",
      sourcePage: "/",
      sessionId: "same-sess",
    });
    // Both should succeed — no session deduplication
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});
