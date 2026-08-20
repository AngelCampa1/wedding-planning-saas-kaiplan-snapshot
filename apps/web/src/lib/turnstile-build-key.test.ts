import { describe, expect, it } from "vitest";
import { resolveTurnstileSiteKey } from "./turnstile-build-key";

describe("resolveTurnstileSiteKey", () => {
  it("prefers the process.env override when present", () => {
    expect(resolveTurnstileSiteKey("0xENV", "0xWRANGLER")).toBe("0xENV");
  });

  it("honors an explicitly empty override (forces the dev bypass)", () => {
    // local-e2e injects PUBLIC_TURNSTILE_SITE_KEY="" to disable the widget;
    // an explicit empty override must win over the wrangler fallback.
    expect(resolveTurnstileSiteKey("", "0xWRANGLER")).toBe("");
    expect(resolveTurnstileSiteKey("   ", "0xWRANGLER")).toBe("");
  });

  it("falls back to the wrangler value only when env is undefined", () => {
    expect(resolveTurnstileSiteKey(undefined, "0xWRANGLER")).toBe("0xWRANGLER");
  });

  it("trims whitespace from the resolved value", () => {
    expect(resolveTurnstileSiteKey("  0xENV  ", undefined)).toBe("0xENV");
    expect(resolveTurnstileSiteKey(undefined, "  0xWRANGLER  ")).toBe(
      "0xWRANGLER",
    );
  });

  it("returns an empty string when neither source has a value", () => {
    expect(resolveTurnstileSiteKey(undefined, undefined)).toBe("");
    expect(resolveTurnstileSiteKey(undefined, "   ")).toBe("");
  });
});
