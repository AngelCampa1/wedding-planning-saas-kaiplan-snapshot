import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headers = readFileSync(resolve(__dirname, "../public/_headers"), "utf8");

describe("app security headers", () => {
  it("allows the Cloudflare Web Analytics beacon script configured in production", () => {
    expect(headers).toContain("https://static.cloudflareinsights.com");
  });
});
