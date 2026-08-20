import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLIC_SITE_URL,
  resolvePublicBaseUrl,
} from "../../src/lib/public-site-url";

describe("resolvePublicBaseUrl", () => {
  it("exposes the Kaiplan-reserved public website port as the default", () => {
    // Must match apps/app/.env.example and scripts/local-e2e-config.ts.
    expect(DEFAULT_PUBLIC_SITE_URL).toBe("http://localhost:3031");
  });

  it("returns the configured site url when one is provided", () => {
    expect(resolvePublicBaseUrl("https://my.kaiplan.app")).toBe(
      "https://my.kaiplan.app",
    );
  });

  it("falls back to the default when no configured value is given", () => {
    expect(resolvePublicBaseUrl(undefined)).toBe(DEFAULT_PUBLIC_SITE_URL);
  });

  it("strips a single trailing slash from the resolved url", () => {
    expect(resolvePublicBaseUrl("https://my.kaiplan.app/")).toBe(
      "https://my.kaiplan.app",
    );
  });

  it("honors an explicit fallback override when configured is undefined", () => {
    expect(
      resolvePublicBaseUrl(undefined, "https://override.example.com"),
    ).toBe("https://override.example.com");
  });

  it("uses the explicit default fallback when no runtime env value exists", () => {
    const original = import.meta.env.VITE_PUBLIC_SITE_URL;
    import.meta.env.VITE_PUBLIC_SITE_URL = undefined;

    try {
      expect(resolvePublicBaseUrl()).toBe(DEFAULT_PUBLIC_SITE_URL);
    } finally {
      import.meta.env.VITE_PUBLIC_SITE_URL = original;
    }
  });

  it("uses runtime env url when called with no args and env is set", () => {
    const original = import.meta.env.VITE_PUBLIC_SITE_URL;
    import.meta.env.VITE_PUBLIC_SITE_URL = "https://env.example.com";

    try {
      expect(resolvePublicBaseUrl()).toBe("https://env.example.com");
    } finally {
      import.meta.env.VITE_PUBLIC_SITE_URL = original;
    }
  });

  it("treats the literal string 'undefined' in env as missing", () => {
    const original = import.meta.env.VITE_PUBLIC_SITE_URL;
    import.meta.env.VITE_PUBLIC_SITE_URL = "undefined";

    try {
      expect(resolvePublicBaseUrl()).toBe(DEFAULT_PUBLIC_SITE_URL);
    } finally {
      import.meta.env.VITE_PUBLIC_SITE_URL = original;
    }
  });
});
