import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_BUILD_TIMEOUT_MS,
  assertAppDeployEnv,
  resolveAppBuildEnv,
  type CloudflareAppConfig,
} from "./lib/cloudflare-app-config";
import { parseJsonc } from "./lib/cloudflare-web-config";
import { buildPnpmInvocation } from "./lib/pnpm-invocation";

const appRoot = existsSync("wrangler.jsonc") ? "." : join("apps", "app");
const configPath = join(appRoot, "wrangler.jsonc");
const config = parseJsonc(readFileSync(configPath, "utf8"));
const buildEnv = resolveAppBuildEnv(config as CloudflareAppConfig);

assertAppDeployEnv(buildEnv);

const sanitizedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("VITE_")),
);
const command = buildPnpmInvocation(["exec", "vite", "build"]);
const result = spawnSync(command.executable, command.args, {
  cwd: appRoot,
  env: { ...sanitizedEnv, ...buildEnv },
  shell: false,
  stdio: "inherit",
  timeout: APP_BUILD_TIMEOUT_MS,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
