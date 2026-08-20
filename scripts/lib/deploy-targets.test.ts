import { describe, expect, it, vi } from "vitest";
import {
  filterTargets,
  formatDeployPlan,
  formatDeploySummary,
  mapChangedFilesToDeployTargets,
  parseDeployArgs,
  resolveDeployBaseRef,
  runDeploys,
} from "./deploy-targets";

describe("resolveDeployBaseRef", () => {
  it("uses DEPLOY_BASE_REF when it is set", () => {
    expect(resolveDeployBaseRef({ DEPLOY_BASE_REF: "origin/release" })).toBe(
      "origin/release",
    );
  });

  it("falls back to origin/master for blank values", () => {
    expect(resolveDeployBaseRef({ DEPLOY_BASE_REF: "   " })).toBe(
      "origin/master",
    );
  });
});

describe("mapChangedFilesToDeployTargets", () => {
  it("maps app, api, and web workspace files to their deploy targets", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "apps/app/src/main.tsx",
        "apps/api/src/index.ts",
        "apps/web/src/pages/index.astro",
      ]),
    ).toEqual(["api", "app", "web"]);
  });

  it("maps shared package changes to every deploy target", () => {
    expect(
      mapChangedFilesToDeployTargets(["packages/shared/src/types.ts"]),
    ).toEqual(["api", "app", "web"]);
  });

  it("maps marketing packages to the web deploy target", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "packages/marketing/src/index.ts",
        "packages/marketing-api/src/app.ts",
        "packages/lead-magnet-pdf/src/render.ts",
      ]),
    ).toEqual(["web"]);
  });

  it("maps web build and deploy automation scripts to the web deploy target", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "scripts/build-lead-magnet-pdfs.ts",
        "scripts/backfill-marketing-unsubscribes.ts",
        "scripts/deploy-lead-magnet-pdfs.ts",
        "scripts/patch-astro-cloudflare-preview-config.ts",
        "scripts/lib/astro-cloudflare-preview-config.ts",
        "scripts/patch-wrangler-custom-domains.ts",
        "scripts/lib/wrangler-custom-domains.ts",
        "scripts/validate-cloudflare-web-config.ts",
      ]),
    ).toEqual(["web"]);
  });

  it("maps shared Cloudflare web config helpers to web and app deploy targets", () => {
    expect(
      mapChangedFilesToDeployTargets(["scripts/lib/cloudflare-web-config.ts"]),
    ).toEqual(["app", "web"]);
  });

  it("maps API deploy automation scripts to the API deploy target", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "scripts/validate-cloudflare-api-config.ts",
        "scripts/lib/cloudflare-api-config.ts",
      ]),
    ).toEqual(["api"]);
  });

  it("maps app deploy automation scripts to the app deploy target", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "scripts/build-cloudflare-app.ts",
        "scripts/validate-cloudflare-app-config.ts",
        "scripts/lib/cloudflare-app-config.ts",
      ]),
    ).toEqual(["app"]);
  });

  it("maps knowledge package changes to app and web deploy targets", () => {
    expect(
      mapChangedFilesToDeployTargets(["packages/knowledge/src/marketing.ts"]),
    ).toEqual(["app", "web"]);
  });

  it("maps deeply nested knowledge paths to app and web (not api)", () => {
    expect(
      mapChangedFilesToDeployTargets(["packages/knowledge/src/bundles/foo.ts"]),
    ).toEqual(["app", "web"]);
  });

  it("does not add api target for knowledge package changes", () => {
    const targets = mapChangedFilesToDeployTargets([
      "packages/knowledge/src/index.ts",
    ]);
    expect(targets).not.toContain("api");
    expect(targets).toContain("app");
    expect(targets).toContain("web");
  });

  it("maps root deployment inputs to every deploy target", () => {
    expect(mapChangedFilesToDeployTargets(["turbo.json"])).toEqual([
      "api",
      "app",
      "web",
    ]);
  });

  it("maps shared pnpm invocation helper changes to every deploy target", () => {
    expect(
      mapChangedFilesToDeployTargets(["scripts/lib/pnpm-invocation.ts"]),
    ).toEqual(["api", "app", "web"]);
  });

  it("normalizes Windows path separators", () => {
    expect(
      mapChangedFilesToDeployTargets(["apps\\api\\src\\index.ts"]),
    ).toEqual(["api"]);
  });
});

describe("parseDeployArgs", () => {
  it("parses dry-run, base, only, and skip flags", () => {
    expect(
      parseDeployArgs(
        ["--dry-run", "--base", "HEAD~1", "--only", "web,api", "--skip", "api"],
        {},
      ),
    ).toEqual({
      base: "HEAD~1",
      dryRun: true,
      only: ["api", "web"],
      skip: ["api"],
    });
  });

  it("throws on unknown targets", () => {
    expect(() => parseDeployArgs(["--only", "workers"], {})).toThrow(
      "Unknown deploy target: workers",
    );
  });

  it("throws when a flag is missing its value", () => {
    expect(() => parseDeployArgs(["--base"], {})).toThrow(
      "--base requires a git ref value",
    );
  });
});

describe("filterTargets", () => {
  it("uses only targets when provided and removes skipped targets", () => {
    expect(
      filterTargets(["api"], { only: ["web", "api"], skip: ["api"] }),
    ).toEqual(["web"]);
  });

  it("deduplicates and sorts touched targets", () => {
    expect(filterTargets(["web", "api", "web"], { skip: [] })).toEqual([
      "api",
      "web",
    ]);
  });
});

describe("runDeploys", () => {
  it("runs deploy commands in sorted target order", () => {
    const runner = vi.fn();

    expect(runDeploys(["web", "api"], runner)).toEqual([
      { target: "api", ok: true },
      { target: "web", ok: true },
    ]);
    expect(runner.mock.calls).toEqual([
      ["pnpm run deploy:api"],
      ["pnpm run deploy:web"],
    ]);
  });

  it("stops later deploy targets after a failure", () => {
    const runner = vi.fn((command: string) => {
      if (command === "pnpm run deploy:app") {
        throw new Error("deploy failed");
      }
    });

    const results = runDeploys(["app", "web"], runner);

    expect(results[0]).toMatchObject({ target: "app", ok: false });
    expect(results[0]?.error?.message).toBe("deploy failed");
    expect(results).toHaveLength(1);
    expect(runner.mock.calls).toEqual([["pnpm run deploy:app"]]);
  });
});

describe("formatDeployPlan and formatDeploySummary", () => {
  it("formats an empty deploy plan", () => {
    expect(formatDeployPlan([])).toBe("No deployable projects changed.");
  });

  it("formats deploy summaries", () => {
    expect(
      formatDeploySummary([
        { target: "api", ok: true },
        { target: "web", ok: false, error: new Error("no token") },
      ]),
    ).toBe(
      "Deploy summary: 1 deployed, 1 failed\n  OK api\n  FAIL web: no token",
    );
  });
});
