import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./privacy-summary.astro", import.meta.url)),
  "utf8",
);

describe("privacy-summary.astro", () => {
  it("contains all 4 bullet sections", () => {
    const labelCount = (source.match(/label:/g) ?? []).length;
    expect(labelCount).toBeGreaterThanOrEqual(4);
  });

  it("contains a canonical trailing-slash link to /privacy/", () => {
    expect(source).toContain('href="/privacy/"');
  });

  it('contains the heading "Privacy at a glance"', () => {
    expect(source.toLowerCase()).toContain("privacy at a glance");
  });

  it("mentions the expected data recipients", () => {
    expect(source).toContain("Stripe");
    expect(source).toContain("Resend");
    expect(source).toContain("Neon");
    expect(source).toContain("Apollo");
    expect(source).toContain("Cloudflare");
  });

  it("mentions that data is never sold and can be exported", () => {
    expect(source.toLowerCase()).toContain("sold");
    expect(source.toLowerCase()).toContain("export");
  });

  it("keeps the Apollo outbound note free of mojibake", () => {
    expect(source).toContain("CRM for outbound only - never planner data");
    expect(source).not.toContain("â€”");
  });

  it("has exactly the 4 spec labels", () => {
    expect(source).toContain('"Collected"');
    expect(source).toContain('"Shared with"');
    expect(source).toContain('"Never"');
    expect(source).toContain('"Yours"');
  });

  it('has a section element with aria-label="Privacy at a glance"', () => {
    expect(source).toContain("section");
    expect(source).toContain('aria-label="Privacy at a glance"');
  });
});
