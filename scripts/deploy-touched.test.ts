import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPLOY_BASE_REF,
  filterTargets,
  formatDeployPlan,
  formatDeploySummary,
  mapChangedFilesToDeployTargets,
  parseDeployArgs,
  resolveDeployBaseRef,
  runDeploys,
  type DeployResult,
} from "./lib/deploy-targets";

describe("mapChangedFilesToDeployTargets", () => {
  it("maps deployable app workspaces to their Cloudflare targets", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "apps/api/src/index.ts",
        "apps/app/src/main.tsx",
        "apps/web/src/pages/index.astro",
      ]),
    ).toEqual(["api", "app", "web"]);
  });

  it("deploys the public web project when shared marketing packages change", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "packages/marketing/src/components/email-capture.tsx",
        "packages/marketing-api/src/app.ts",
      ]),
    ).toEqual(["web"]);
  });

  it("deploys the public web project for lead magnet generator changes", () => {
    expect(
      mapChangedFilesToDeployTargets(["packages/lead-magnet-pdf/src/index.ts"]),
    ).toEqual(["web"]);
  });

  it("deploys the public web project for web deploy automation changes", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "scripts/build-lead-magnet-pdfs.ts",
        "scripts/deploy-lead-magnet-pdfs.ts",
        "scripts/patch-wrangler-custom-domains.ts",
      ]),
    ).toEqual(["web"]);
  });

  it("deploys every runtime project when shared schemas change", () => {
    expect(
      mapChangedFilesToDeployTargets(["packages/shared/src/index.ts"]),
    ).toEqual(["api", "app", "web"]);
  });

  it("deploys every runtime project when shared TypeScript config changes", () => {
    expect(mapChangedFilesToDeployTargets(["tsconfig.base.json"])).toEqual([
      "api",
      "app",
      "web",
    ]);
  });

  it("reports when no deployable projects changed", () => {
    const targets = mapChangedFilesToDeployTargets([
      "docs/production-readiness.md",
    ]);

    expect(targets).toEqual([]);
    expect(formatDeployPlan(targets)).toBe("No deployable projects changed.");
  });

  it("formats a non-empty deploy plan as a comma-separated list", () => {
    expect(formatDeployPlan(["api", "web"])).toBe("Deploy targets: api, web");
  });

  it("maps newly added deployable files when deploy:touched includes untracked files", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "apps/web/src/pages/new-marketing-page.astro",
      ]),
    ).toEqual(["web"]);
  });

  it("maps deleted deployable files because removals still require deploys", () => {
    expect(
      mapChangedFilesToDeployTargets([
        "apps/app/src/deleted-component.tsx",
        "packages/marketing-api/src/deleted-route.ts",
      ]),
    ).toEqual(["app", "web"]);
  });
});

describe("resolveDeployBaseRef", () => {
  it("defaults to origin/master so multi-commit local work deploys every touched project", () => {
    expect(resolveDeployBaseRef({})).toBe(DEFAULT_DEPLOY_BASE_REF);
  });

  it("allows the deploy base to be overridden for release workflows", () => {
    expect(resolveDeployBaseRef({ DEPLOY_BASE_REF: "v1.2.3" })).toBe("v1.2.3");
  });
});

describe("parseDeployArgs", () => {
  it("returns defaults when no flags are provided", () => {
    const args = parseDeployArgs([], {});
    expect(args.base).toBe(DEFAULT_DEPLOY_BASE_REF);
    expect(args.dryRun).toBe(false);
    expect(args.only).toBeUndefined();
    expect(args.skip).toEqual([]);
  });

  it("parses --dry-run", () => {
    expect(parseDeployArgs(["--dry-run"], {}).dryRun).toBe(true);
  });

  it("parses --base <ref>", () => {
    expect(parseDeployArgs(["--base", "v1.0.0"], {}).base).toBe("v1.0.0");
  });

  it("throws when --base is missing a value", () => {
    expect(() => parseDeployArgs(["--base"], {})).toThrow(
      /--base requires a git ref value/,
    );
  });

  it("parses --only with a comma-separated list of targets", () => {
    expect(parseDeployArgs(["--only", "web,app"], {}).only).toEqual([
      "app",
      "web",
    ]);
  });

  it("parses --only with repeated flags", () => {
    expect(
      parseDeployArgs(["--only", "web", "--only", "api"], {}).only,
    ).toEqual(["api", "web"]);
  });

  it("parses --skip with a comma-separated list", () => {
    expect(parseDeployArgs(["--skip", "api"], {}).skip).toEqual(["api"]);
  });

  it("rejects unknown targets in --only", () => {
    expect(() => parseDeployArgs(["--only", "docs"], {})).toThrow(
      /Unknown deploy target: docs/,
    );
  });

  it("rejects unknown targets in --skip", () => {
    expect(() => parseDeployArgs(["--skip", "docs"], {})).toThrow(
      /Unknown deploy target: docs/,
    );
  });

  it("rejects unknown flags", () => {
    expect(() => parseDeployArgs(["--wat"], {})).toThrow(
      /Unknown argument: --wat/,
    );
  });

  it("throws when --only is missing a value", () => {
    expect(() => parseDeployArgs(["--only"], {})).toThrow(
      /--only requires a comma-separated list/,
    );
  });

  it("throws when --skip is missing a value", () => {
    expect(() => parseDeployArgs(["--skip"], {})).toThrow(
      /--skip requires a comma-separated list/,
    );
  });

  it("tolerates empty segments in a comma-separated target list", () => {
    expect(parseDeployArgs(["--only", "web,,api"], {}).only).toEqual([
      "api",
      "web",
    ]);
  });

  it("honors DEPLOY_BASE_REF from the environment when --base is not passed", () => {
    expect(parseDeployArgs([], { DEPLOY_BASE_REF: "v2.0.0" }).base).toBe(
      "v2.0.0",
    );
  });
});

describe("filterTargets", () => {
  it("returns the touched set unchanged when no filter flags apply", () => {
    expect(filterTargets(["api", "app", "web"], { skip: [] })).toEqual([
      "api",
      "app",
      "web",
    ]);
  });

  it("when --only is set, returns exactly the --only list regardless of what was touched", () => {
    expect(filterTargets(["api", "app"], { only: ["web"], skip: [] })).toEqual([
      "web",
    ]);
  });

  it("when --only is set, intersecting behavior is NOT used — explicit override wins", () => {
    // Intentional design: `--only web` means "deploy web", even if web wasn't
    // touched. This matches the user's mental model of explicit overrides.
    expect(filterTargets([], { only: ["web"], skip: [] })).toEqual(["web"]);
  });

  it("removes --skip targets from the touched set", () => {
    expect(filterTargets(["api", "app", "web"], { skip: ["api"] })).toEqual([
      "app",
      "web",
    ]);
  });

  it("applies --skip on top of --only", () => {
    expect(filterTargets([], { only: ["api", "web"], skip: ["api"] })).toEqual([
      "web",
    ]);
  });

  it("returns the result sorted", () => {
    expect(filterTargets(["web", "app", "api"], { skip: [] })).toEqual([
      "api",
      "app",
      "web",
    ]);
  });
});

describe("runDeploys", () => {
  it("runs one command per target and reports all as ok when the runner succeeds", () => {
    const commands: string[] = [];
    const runner = (command: string) => {
      commands.push(command);
    };

    const results = runDeploys(["web", "api"], runner);

    expect(commands).toEqual(["pnpm run deploy:api", "pnpm run deploy:web"]);
    expect(results).toEqual<DeployResult[]>([
      { target: "api", ok: true },
      { target: "web", ok: true },
    ]);
  });

  it("stops after a failing target so dependent deploys do not ship partially", () => {
    const commands: string[] = [];
    const runner = (command: string) => {
      commands.push(command);
      if (command.includes("deploy:api")) {
        throw new Error("Stripe secrets missing");
      }
    };

    const results = runDeploys(["api", "web"], runner);

    expect(commands).toEqual(["pnpm run deploy:api"]);
    expect(results).toHaveLength(1);
    expect(results[0]?.target).toBe("api");
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error?.message).toMatch(/Stripe secrets missing/);
  });

  it("wraps non-Error thrown values so the caller always gets an Error", () => {
    const runner = () => {
      throw "boom";
    };

    const results = runDeploys(["web"], runner);
    expect(results[0]?.error).toBeInstanceOf(Error);
    expect(results[0]?.error?.message).toMatch(/boom/);
  });

  it("returns an empty array when no targets are passed", () => {
    expect(runDeploys([], () => undefined)).toEqual([]);
  });
});

describe("formatDeploySummary", () => {
  it("summarizes an all-ok run", () => {
    expect(
      formatDeploySummary([
        { target: "web", ok: true },
        { target: "api", ok: true },
      ]),
    ).toContain("2 deployed");
  });

  it("includes failed target names and error messages", () => {
    const summary = formatDeploySummary([
      { target: "web", ok: true },
      {
        target: "api",
        ok: false,
        error: new Error("Stripe secrets missing"),
      },
    ]);
    expect(summary).toContain("api");
    expect(summary).toContain("Stripe secrets missing");
    expect(summary).toContain("1 deployed");
    expect(summary).toContain("1 failed");
  });

  it("handles an empty result set", () => {
    expect(formatDeploySummary([])).toBe("No deploys ran.");
  });
});
