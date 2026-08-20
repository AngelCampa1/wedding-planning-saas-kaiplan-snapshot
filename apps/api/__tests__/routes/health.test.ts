import { describe, it, expect } from "vitest";
import { healthRoutes } from "../../src/routes/health";

describe("healthRoutes", () => {
  it("GET / returns status ok and a timestamp", async () => {
    const before = Date.now();
    const res = await healthRoutes.request("/");
    const after = Date.now();

    expect(res.status).toBe(200);

    const body = await res.json() as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");

    const ts = new Date(body.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("GET / returns JSON content-type", async () => {
    const res = await healthRoutes.request("/");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
