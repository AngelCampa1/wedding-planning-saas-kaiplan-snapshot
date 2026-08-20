import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  POSTHOG_API_KEY,
  POSTHOG_HOST,
  buildPostHogBootstrapScript,
  trackEvent,
  identifyUser,
  sanitizeAnalyticsProperties,
  type PostHogInstance,
} from "./analytics";

function makePostHogMock(
  overrides: Partial<PostHogInstance> = {},
): PostHogInstance {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    ...overrides,
  };
}

describe("analytics constants", () => {
  it("POSTHOG_API_KEY is a non-empty string", () => {
    expect(typeof POSTHOG_API_KEY).toBe("string");
    expect(POSTHOG_API_KEY.length).toBeGreaterThan(0);
  });

  it("POSTHOG_HOST is a non-empty string", () => {
    expect(typeof POSTHOG_HOST).toBe("string");
    expect(POSTHOG_HOST.length).toBeGreaterThan(0);
  });
});

describe("buildPostHogBootstrapScript", () => {
  it("disables automatic pageview and pageleave capture", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks");

    expect(script).toContain("autocapture: false");
    expect(script).toContain("capture_pageview: false");
    expect(script).toContain("capture_pageleave: false");
  });

  it("does not capture or persist browser analytics before consent", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks");

    expect(script).toContain("disable_persistence: true");
    expect(script).toContain("disable_session_recording: true");
    expect(script).toContain("opt_out_capturing_by_default: true");
    expect(script).toContain("opt_out_persistence_by_default: true");
  });

  it("registers the site tag with the provided site name", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks");

    expect(script).toContain('site: "RestrictedBooks"');
  });

  it("uses the provided API key and host values", () => {
    const script = buildPostHogBootstrapScript(
      "RestrictedBooks",
      "test-key",
      "https://example.i.posthog.com",
    );

    expect(script).toContain('posthog.init("test-key", {');
    expect(script).toContain('api_host: "https://example.i.posthog.com"');
  });

  it("does not throw when posthog.init throws during bootstrap", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks");
    const init = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    const register = vi.fn();

    expect(() =>
      new Function(
        "document",
        "window",
        `const posthog = window.posthog; ${script}; return window.posthog;`,
      )(
        {},
        {
          posthog: {
            __SV: 1,
            init,
            register,
          },
        },
      ),
    ).not.toThrow();

    expect(init).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledOnce();
  });

  it("does not throw when posthog.register throws during bootstrap", () => {
    const script = buildPostHogBootstrapScript("RestrictedBooks");
    const register = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    const init = vi.fn();

    expect(() =>
      new Function(
        "document",
        "window",
        `const posthog = window.posthog; ${script}; return window.posthog;`,
      )(
        {},
        {
          posthog: {
            __SV: 1,
            init,
            register,
          },
        },
      ),
    ).not.toThrow();

    expect(init).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith({ site: "RestrictedBooks" });
  });
});

describe("trackEvent", () => {
  beforeEach(() => {
    delete window.posthog;
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("calls window.posthog.capture with event name and properties when posthog exists", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("signup_started", { source: "hero" });

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("signup_started", { source: "hero" });
  });

  it("does not throw when window.posthog is undefined", () => {
    expect(() => trackEvent("some_event", { key: "value" })).not.toThrow();
  });

  it("calls capture with no properties when properties arg is omitted", () => {
    const capture = vi.fn();
    window.posthog = makePostHogMock({ capture });

    trackEvent("page_viewed");

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("page_viewed", undefined);
  });

  it("does not throw when posthog.capture throws", () => {
    const capture = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    window.posthog = makePostHogMock({ capture });

    expect(() =>
      trackEvent("section_viewed", { section: "hero" }),
    ).not.toThrow();
  });
});

describe("identifyUser", () => {
  beforeEach(() => {
    delete window.posthog;
  });

  afterEach(() => {
    delete window.posthog;
  });

  it("calls window.posthog.identify with distinctId and safe properties when posthog exists", () => {
    const identify = vi.fn();
    window.posthog = makePostHogMock({ identify });

    identifyUser("user-abc", { plan: "starter" });

    expect(identify).toHaveBeenCalledOnce();
    expect(identify).toHaveBeenCalledWith("user-abc", {
      plan: "starter",
    });
  });

  it("filters obvious PII and token-like identify properties", () => {
    const identify = vi.fn();
    window.posthog = makePostHogMock({ identify });

    identifyUser("user-abc", {
      email: "test@example.com",
      displayName: "Test User",
      inviteToken: "secret-token",
      plan: "starter",
      source: "pricing",
    });

    expect(identify).toHaveBeenCalledWith("user-abc", {
      plan: "starter",
      source: "pricing",
    });
  });

  it("does not throw when window.posthog is undefined", () => {
    expect(() => identifyUser("user-abc", { plan: "starter" })).not.toThrow();
  });

  it("calls identify with no properties when properties arg is omitted", () => {
    const identify = vi.fn();
    window.posthog = makePostHogMock({ identify });

    identifyUser("user-1");

    expect(identify).toHaveBeenCalledOnce();
    expect(identify).toHaveBeenCalledWith("user-1", undefined);
  });

  it("does not throw when posthog.identify throws", () => {
    const identify = vi.fn(() => {
      throw new ReferenceError("options is not defined");
    });
    window.posthog = makePostHogMock({ identify });

    expect(() => identifyUser("user-1", { plan: "starter" })).not.toThrow();
  });
});

describe("sanitizeAnalyticsProperties", () => {
  it("filters email-shaped string values even when the key is generic", () => {
    expect(
      sanitizeAnalyticsProperties({
        contact: "test@example.com",
        source: "pricing",
      }),
    ).toEqual({ source: "pricing" });
  });

  it("returns undefined when every property is filtered", () => {
    expect(
      sanitizeAnalyticsProperties({
        email: "test@example.com",
        rsvpToken: "abc123",
      }),
    ).toBeUndefined();
  });
});
