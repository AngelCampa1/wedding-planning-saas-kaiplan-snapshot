export type DeployTarget = "api" | "app" | "web";

export const DEPLOY_TARGETS: Record<DeployTarget, string> = {
  api: "pnpm run deploy:api",
  app: "pnpm run deploy:app",
  web: "pnpm run deploy:web",
};

export const DEFAULT_DEPLOY_BASE_REF = "origin/master";

export function resolveDeployBaseRef(env: NodeJS.ProcessEnv): string {
  return env.DEPLOY_BASE_REF?.trim() || DEFAULT_DEPLOY_BASE_REF;
}

const ROOT_DEPLOY_ALL_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/lib/pnpm-invocation.ts",
  "tsconfig.base.json",
  "turbo.json",
]);

const WEB_DEPLOY_SCRIPT_FILES = new Set([
  "scripts/build-lead-magnet-pdfs.ts",
  "scripts/backfill-marketing-unsubscribes.ts",
  "scripts/deploy-lead-magnet-pdfs.ts",
  "scripts/patch-astro-cloudflare-preview-config.ts",
  "scripts/lib/astro-cloudflare-preview-config.ts",
  "scripts/patch-wrangler-custom-domains.ts",
  "scripts/lib/wrangler-custom-domains.ts",
  "scripts/validate-cloudflare-web-config.ts",
]);

const API_DEPLOY_SCRIPT_FILES = new Set([
  "scripts/validate-cloudflare-api-config.ts",
  "scripts/lib/cloudflare-api-config.ts",
]);

const APP_DEPLOY_SCRIPT_FILES = new Set([
  "scripts/build-cloudflare-app.ts",
  "scripts/validate-cloudflare-app-config.ts",
  "scripts/lib/cloudflare-app-config.ts",
]);

const WEB_APP_DEPLOY_SCRIPT_FILES = new Set([
  "scripts/lib/cloudflare-web-config.ts",
]);

export function mapChangedFilesToDeployTargets(
  files: string[],
): DeployTarget[] {
  const targets = new Set<DeployTarget>();

  for (const file of files) {
    const normalized = file.replace(/\\/g, "/");

    if (ROOT_DEPLOY_ALL_FILES.has(normalized)) {
      targets.add("api");
      targets.add("app");
      targets.add("web");
      continue;
    }

    if (WEB_DEPLOY_SCRIPT_FILES.has(normalized)) {
      targets.add("web");
      continue;
    }

    if (WEB_APP_DEPLOY_SCRIPT_FILES.has(normalized)) {
      targets.add("app");
      targets.add("web");
      continue;
    }

    if (API_DEPLOY_SCRIPT_FILES.has(normalized)) {
      targets.add("api");
      continue;
    }

    if (APP_DEPLOY_SCRIPT_FILES.has(normalized)) {
      targets.add("app");
      continue;
    }

    if (normalized.startsWith("apps/api/")) {
      targets.add("api");
      continue;
    }

    if (normalized.startsWith("apps/app/")) {
      targets.add("app");
      continue;
    }

    if (normalized.startsWith("packages/knowledge/")) {
      targets.add("app");
      targets.add("web");
      continue;
    }

    if (
      normalized.startsWith("apps/web/") ||
      normalized.startsWith("packages/marketing/") ||
      normalized.startsWith("packages/marketing-api/") ||
      normalized.startsWith("packages/lead-magnet-pdf/")
    ) {
      targets.add("web");
      continue;
    }

    if (normalized.startsWith("packages/shared/")) {
      targets.add("api");
      targets.add("app");
      targets.add("web");
    }
  }

  return Array.from(targets).sort();
}

export function formatDeployPlan(targets: DeployTarget[]): string {
  if (targets.length === 0) {
    return "No deployable projects changed.";
  }

  return `Deploy targets: ${targets.join(", ")}`;
}

const DEPLOY_TARGET_NAMES: readonly DeployTarget[] = ["api", "app", "web"];

function isDeployTarget(value: string): value is DeployTarget {
  return (DEPLOY_TARGET_NAMES as readonly string[]).includes(value);
}

function parseTargetList(raw: string, flag: string): DeployTarget[] {
  const targets: DeployTarget[] = [];
  for (const piece of raw.split(",")) {
    const trimmed = piece.trim();
    if (!trimmed) {
      continue;
    }
    if (!isDeployTarget(trimmed)) {
      throw new Error(
        `Unknown deploy target: ${trimmed} (in ${flag}). Valid targets: ${DEPLOY_TARGET_NAMES.join(
          ", ",
        )}`,
      );
    }
    targets.push(trimmed);
  }
  return targets;
}

export interface DeployArgs {
  base: string;
  dryRun: boolean;
  only: DeployTarget[] | undefined;
  skip: DeployTarget[];
}

export function parseDeployArgs(
  argv: string[],
  env: NodeJS.ProcessEnv,
): DeployArgs {
  const args: DeployArgs = {
    base: resolveDeployBaseRef(env),
    dryRun: false,
    only: undefined,
    skip: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--base") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--base requires a git ref value");
      }
      args.base = value;
      index += 1;
      continue;
    }
    if (arg === "--only") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--only requires a comma-separated list of targets");
      }
      const parsed = parseTargetList(value, "--only");
      args.only = Array.from(new Set([...(args.only ?? []), ...parsed])).sort();
      index += 1;
      continue;
    }
    if (arg === "--skip") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--skip requires a comma-separated list of targets");
      }
      const parsed = parseTargetList(value, "--skip");
      args.skip = Array.from(new Set([...args.skip, ...parsed])).sort();
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

export function filterTargets(
  touched: DeployTarget[],
  filters: { only?: DeployTarget[] | undefined; skip: DeployTarget[] },
): DeployTarget[] {
  const base = filters.only ?? touched;
  const skipSet = new Set(filters.skip);
  return Array.from(new Set(base.filter((t) => !skipSet.has(t)))).sort();
}

export interface DeployResult {
  target: DeployTarget;
  ok: boolean;
  error?: Error;
}

export type DeployRunner = (command: string) => void;

export function runDeploys(
  targets: DeployTarget[],
  runner: DeployRunner,
): DeployResult[] {
  const ordered = [...targets].sort();
  const results: DeployResult[] = [];

  for (const target of ordered) {
    const command = DEPLOY_TARGETS[target];
    try {
      runner(command);
      results.push({ target, ok: true });
    } catch (error) {
      const wrapped =
        error instanceof Error
          ? error
          : new Error(typeof error === "string" ? error : String(error));
      results.push({ target, ok: false, error: wrapped });
      break;
    }
  }

  return results;
}

export function formatDeploySummary(results: DeployResult[]): string {
  if (results.length === 0) {
    return "No deploys ran.";
  }

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const lines: string[] = [];
  lines.push(
    `Deploy summary: ${succeeded.length} deployed, ${failed.length} failed`,
  );
  for (const result of succeeded) {
    lines.push(`  OK ${result.target}`);
  }
  for (const result of failed) {
    const message = result.error?.message ?? "unknown error";
    lines.push(`  FAIL ${result.target}: ${message}`);
  }
  return lines.join("\n");
}
