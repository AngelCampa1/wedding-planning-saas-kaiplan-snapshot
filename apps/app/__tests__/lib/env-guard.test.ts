import { describe, it, expect } from "vitest";
import { assertProdEnv } from "../../src/lib/env-guard";

describe("assertProdEnv", () => {
  it("throws when VITE_API_URL is missing in production", () => {
    expect(() =>
      assertProdEnv({
        prod: true,
        apiUrl: undefined,
        publicSiteUrl: "https://kaiplan.app",
        sentryDsn: "https://public@example.ingest.sentry.io/1",
      }),
    ).toThrow("VITE_API_URL is required in production");
  });

  it("throws when VITE_API_URL is empty string in production", () => {
    expect(() =>
      assertProdEnv({
        prod: true,
        apiUrl: "",
        publicSiteUrl: "https://kaiplan.app",
        sentryDsn: "https://public@example.ingest.sentry.io/1",
      }),
    ).toThrow("VITE_API_URL is required in production");
  });

  it("throws when VITE_PUBLIC_SITE_URL is missing in production", () => {
    expect(() =>
      assertProdEnv({
        prod: true,
        apiUrl: "https://api.kaiplan.app",
        publicSiteUrl: undefined,
        sentryDsn: "https://public@example.ingest.sentry.io/1",
      }),
    ).toThrow("VITE_PUBLIC_SITE_URL is required in production");
  });

  it("throws when VITE_PUBLIC_SITE_URL is empty string in production", () => {
    expect(() =>
      assertProdEnv({
        prod: true,
        apiUrl: "https://api.kaiplan.app",
        publicSiteUrl: "",
        sentryDsn: "https://public@example.ingest.sentry.io/1",
      }),
    ).toThrow("VITE_PUBLIC_SITE_URL is required in production");
  });

  it("does not throw when both env vars are set in production", () => {
    expect(() =>
      assertProdEnv({
        prod: true,
        apiUrl: "https://api.kaiplan.app",
        publicSiteUrl: "https://kaiplan.app",
        sentryDsn: "https://public@example.ingest.sentry.io/1",
      }),
    ).not.toThrow();
  });

  it("does not throw in development even when env vars are missing", () => {
    expect(() =>
      assertProdEnv({
        prod: false,
        apiUrl: undefined,
        publicSiteUrl: undefined,
        sentryDsn: undefined,
      }),
    ).not.toThrow();
  });

  it("does not throw in development with empty strings", () => {
    expect(() =>
      assertProdEnv({
        prod: false,
        apiUrl: "",
        publicSiteUrl: "",
        sentryDsn: "",
      }),
    ).not.toThrow();
  });

  it("throws when VITE_SENTRY_DSN is missing in production", () => {
    expect(() =>
      assertProdEnv({
        prod: true,
        apiUrl: "https://api.kaiplan.app",
        publicSiteUrl: "https://kaiplan.app",
        sentryDsn: undefined,
      }),
    ).toThrow("VITE_SENTRY_DSN is required in production");
  });
});
