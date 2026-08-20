import { describe, expect, it } from "vitest";
import { instrumentD1WithSentry, withSentry } from "./local-sentry-cloudflare";

describe("local sentry cloudflare shim", () => {
  it("returns the same D1 binding without instrumentation", () => {
    const binding = { name: "db" };

    expect(instrumentD1WithSentry(binding)).toBe(binding);
  });

  it("returns the same app without wrapping", () => {
    const app = { fetch: () => new Response("ok") };

    expect(withSentry(() => ({ dsn: "ignored" }), app)).toBe(app);
  });
});
