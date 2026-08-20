import { describe, it, expect } from "vitest";
import { httpsUrlField } from "../src/url";

describe("httpsUrlField", () => {
  it("accepts an https:// URL", () => {
    expect(httpsUrlField.safeParse("https://example.com").success).toBe(true);
  });

  it("accepts an HTTPS:// URL (uppercase scheme)", () => {
    expect(httpsUrlField.safeParse("HTTPS://example.com/path").success).toBe(
      true,
    );
  });

  it("rejects an http:// URL", () => {
    expect(httpsUrlField.safeParse("http://example.com").success).toBe(false);
  });

  it("rejects a javascript: URL", () => {
    expect(httpsUrlField.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("rejects a data: URL", () => {
    expect(
      httpsUrlField.safeParse("data:text/html,<script>alert(1)</script>")
        .success,
    ).toBe(false);
  });

  it("rejects an ftp:// URL", () => {
    expect(httpsUrlField.safeParse("ftp://files.example.com").success).toBe(
      false,
    );
  });

  it("rejects an empty string", () => {
    expect(httpsUrlField.safeParse("").success).toBe(false);
  });

  it("rejects a plain string without a scheme", () => {
    expect(httpsUrlField.safeParse("not-a-url").success).toBe(false);
  });

  it("returns the expected error message for a non-https URL", () => {
    const result = httpsUrlField.safeParse("http://example.com");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Must be an https:// URL");
    }
  });
});
