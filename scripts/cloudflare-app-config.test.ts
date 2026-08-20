import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  APP_BUILD_TIMEOUT_MS,
  assertAppDeployEnv,
  assertAppDeployScriptUsesWorkers,
  assertAppWorkerConfig,
  resolveAppBuildEnv,
} from "./lib/cloudflare-app-config";

describe("cloudflare app config", () => {
  it("requires app production build env before deploy", () => {
    expect(() => assertAppDeployEnv({})).toThrow(
      "VITE_API_URL, VITE_PUBLIC_SITE_URL, VITE_SENTRY_DSN",
    );
  });

  it("rejects empty app production build env values", () => {
    expect(() =>
      assertAppDeployEnv({
        VITE_API_URL: "https://api.kaiplan.app",
        VITE_PUBLIC_SITE_URL: " ",
        VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      }),
    ).toThrow("VITE_PUBLIC_SITE_URL");
  });

  it("accepts the required app production build env", () => {
    expect(() =>
      assertAppDeployEnv({
        VITE_API_URL: "https://api.kaiplan.app",
        VITE_PUBLIC_SITE_URL: "https://kaiplan.app",
        VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      }),
    ).not.toThrow();
  });

  it("rejects Cloudflare Pages deploy commands for the app frontend", () => {
    expect(() =>
      assertAppDeployScriptUsesWorkers(
        "wrangler pages deploy dist --project-name kaiplan-app",
      ),
    ).toThrow("must deploy as a Cloudflare Worker");
  });

  it("accepts Worker deploy commands for the app frontend", () => {
    expect(() =>
      assertAppDeployScriptUsesWorkers(
        "tsx ../../scripts/build-cloudflare-app.ts && wrangler deploy --config wrangler.jsonc",
      ),
    ).not.toThrow();
  });

  it("resolves production build env from Worker vars", () => {
    const prevKey = process.env.VITE_CRM_WIDGET_KEY;
    const prevUrl = process.env.VITE_CRM_LOADER_URL;
    delete process.env.VITE_CRM_WIDGET_KEY;
    delete process.env.VITE_CRM_LOADER_URL;
    try {
      expect(
        resolveAppBuildEnv({
          vars: {
            VITE_API_URL: "https://api.kaiplan.app",
            VITE_PUBLIC_SITE_URL: "https://kaiplan.app",
            VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
          },
        }),
      ).toEqual({
        VITE_API_URL: "https://api.kaiplan.app",
        VITE_PUBLIC_SITE_URL: "https://kaiplan.app",
        VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      });
    } finally {
      if (prevKey === undefined) delete process.env.VITE_CRM_WIDGET_KEY;
      else process.env.VITE_CRM_WIDGET_KEY = prevKey;
      if (prevUrl === undefined) delete process.env.VITE_CRM_LOADER_URL;
      else process.env.VITE_CRM_LOADER_URL = prevUrl;
    }
  });

  it("forwards optional CRM widget vars from process.env when present", () => {
    const prevKey = process.env.VITE_CRM_WIDGET_KEY;
    const prevUrl = process.env.VITE_CRM_LOADER_URL;
    process.env.VITE_CRM_WIDGET_KEY = "wk_testplaceholder";
    process.env.VITE_CRM_LOADER_URL = "https://crm.example.com/w/v1.js";
    try {
      expect(
        resolveAppBuildEnv({
          vars: {
            VITE_API_URL: "https://api.kaiplan.app",
            VITE_PUBLIC_SITE_URL: "https://kaiplan.app",
            VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
          },
        }),
      ).toEqual({
        VITE_API_URL: "https://api.kaiplan.app",
        VITE_PUBLIC_SITE_URL: "https://kaiplan.app",
        VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        VITE_CRM_WIDGET_KEY: "wk_testplaceholder",
        VITE_CRM_LOADER_URL: "https://crm.example.com/w/v1.js",
      });
    } finally {
      if (prevKey === undefined) delete process.env.VITE_CRM_WIDGET_KEY;
      else process.env.VITE_CRM_WIDGET_KEY = prevKey;
      if (prevUrl === undefined) delete process.env.VITE_CRM_LOADER_URL;
      else process.env.VITE_CRM_LOADER_URL = prevUrl;
    }
  });

  it("validates the app Static Assets Worker config", () => {
    expect(() =>
      assertAppWorkerConfig({
        name: "kaiplan-app",
        main: "./src/worker.ts",
        assets: {
          directory: "./dist",
          binding: "ASSETS",
          not_found_handling: "single-page-application",
        },
        vars: {
          VITE_API_URL: "https://api.kaiplan.app",
          VITE_PUBLIC_SITE_URL: "https://kaiplan.app",
          VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        },
        routes: [{ pattern: "my.kaiplan.app", custom_domain: true }],
      }),
    ).not.toThrow();
  });

  it("rejects app Worker configs without the my.kaiplan.app custom domain", () => {
    expect(() =>
      assertAppWorkerConfig({
        name: "kaiplan-app",
        main: "./src/worker.ts",
        assets: {
          directory: "./dist",
          binding: "ASSETS",
          not_found_handling: "single-page-application",
        },
        vars: {
          VITE_API_URL: "https://api.kaiplan.app",
          VITE_PUBLIC_SITE_URL: "https://kaiplan.app",
          VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        },
        routes: [{ pattern: "my.kaiplan.app/*", zone_name: "kaiplan.app" }],
      }),
    ).toThrow("my.kaiplan.app");
  });

  it("bounds the production Vite build before app Worker deploys", () => {
    const script = readFileSync("scripts/build-cloudflare-app.ts", {
      encoding: "utf8",
    });

    expect(APP_BUILD_TIMEOUT_MS).toBe(900_000);
    expect(script).toContain("timeout: APP_BUILD_TIMEOUT_MS");
  });
});
