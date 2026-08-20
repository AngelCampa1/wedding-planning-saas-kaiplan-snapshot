import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertAppDeployScriptUsesWorkers,
  assertAppWorkerConfig,
  type CloudflareAppConfig,
} from "./lib/cloudflare-app-config";
import { parseJsonc } from "./lib/cloudflare-web-config";

const appRoot = existsSync("wrangler.jsonc") ? "." : join("apps", "app");
const configPath = join(appRoot, "wrangler.jsonc");
const packagePath = join(appRoot, "package.json");

const config = parseJsonc(readFileSync(configPath, "utf8"));
assertAppWorkerConfig(config as CloudflareAppConfig);

const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
  scripts?: { deploy?: string };
};

assertAppDeployScriptUsesWorkers(packageJson.scripts?.deploy ?? "");
