import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUBLIC_APP_ORIGIN,
  buildAppLoginUrl,
  buildAppSignupUrl,
  resolvePricingTierPlan,
} from "./app-links";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PUBLIC_APP_ORIGIN", () => {
  it("uses the configured public app origin when provided", async () => {
    vi.resetModules();
    vi.stubEnv("PUBLIC_APP_ORIGIN", "https://preview.my.kaiplan.app/");
    vi.stubEnv("PROD", true);

    const { PUBLIC_APP_ORIGIN: configuredOrigin } = await import("./app-links");

    expect(configuredOrigin).toBe("https://preview.my.kaiplan.app");
  });

  it("falls back to localhost during local development when no origin is configured", async () => {
    vi.resetModules();
    vi.stubEnv("PUBLIC_APP_ORIGIN", "");
    vi.stubEnv("PROD", false);

    const { PUBLIC_APP_ORIGIN: devOrigin } = await import("./app-links");

    expect(devOrigin).toBe("http://localhost:3030");
  });

  it("falls back to the production dashboard origin when production origin is unset", async () => {
    vi.resetModules();
    vi.stubEnv("PUBLIC_APP_ORIGIN", "");
    vi.stubEnv("PROD", true);

    const { PUBLIC_APP_ORIGIN: productionOrigin } = await import("./app-links");

    expect(productionOrigin).toBe("https://my.kaiplan.app");
  });
});

describe("app-links", () => {
  it("builds a generic signup url against the public app origin", () => {
    expect(buildAppSignupUrl()).toBe(`${PUBLIC_APP_ORIGIN}/signup`);
  });

  it("builds a generic login url against the public app origin", () => {
    expect(buildAppLoginUrl()).toBe(`${PUBLIC_APP_ORIGIN}/login`);
  });

  it("normalizes a trailing slash in the app origin", () => {
    expect(buildAppLoginUrl("pro", "https://my.kaiplan.app/")).toBe(
      "https://my.kaiplan.app/login?plan=pro",
    );
  });

  it("falls back to relative app routes when no public app origin is configured", () => {
    expect(buildAppSignupUrl("pro", undefined, "")).toBe("/signup?plan=pro");
    expect(buildAppLoginUrl(undefined, "")).toBe("/login");
    expect(buildAppSignupUrl("" as never, undefined, "")).toBe("/signup");
  });

  it("includes the selected plan in signup and login urls", () => {
    expect(buildAppSignupUrl("pro")).toBe(
      `${PUBLIC_APP_ORIGIN}/signup?plan=pro`,
    );
    expect(buildAppLoginUrl("starter")).toBe(
      `${PUBLIC_APP_ORIGIN}/login?plan=starter`,
    );
  });

  it("includes interval=year in signup url when annual is selected", () => {
    expect(buildAppSignupUrl("pro", "year")).toBe(
      `${PUBLIC_APP_ORIGIN}/signup?plan=pro&interval=year`,
    );
    expect(buildAppSignupUrl("starter", "year")).toBe(
      `${PUBLIC_APP_ORIGIN}/signup?plan=starter&interval=year`,
    );
  });

  it("does not include interval in signup url when monthly or no interval", () => {
    expect(buildAppSignupUrl("pro", "month")).toBe(
      `${PUBLIC_APP_ORIGIN}/signup?plan=pro`,
    );
    expect(buildAppSignupUrl("pro")).toBe(
      `${PUBLIC_APP_ORIGIN}/signup?plan=pro`,
    );
  });

  it("ignores empty plan values", () => {
    expect(buildAppSignupUrl("" as never)).toBe(`${PUBLIC_APP_ORIGIN}/signup`);
  });

  it("normalizes tier names into known billing plans", () => {
    expect(resolvePricingTierPlan("Starter")).toBe("starter");
    expect(resolvePricingTierPlan("Lifetime")).toBe("lifetime");
    expect(resolvePricingTierPlan("Unknown")).toBeUndefined();
  });
});
