import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertCloudflareWebConfig,
  assertRequiredWebSecrets,
  parseJsonc,
  type CloudflareWebConfig,
} from "./lib/cloudflare-web-config";
import {
  parseWranglerSecretNames,
  WRANGLER_SECRET_LIST_TIMEOUT_MS,
} from "./lib/cloudflare-api-config";
import { buildPnpmInvocation } from "./lib/pnpm-invocation";

const configPath = existsSync("wrangler.jsonc")
  ? "wrangler.jsonc"
  : join("apps", "web", "wrangler.jsonc");
const config = parseJsonc(readFileSync(configPath, "utf8"));

assertCloudflareWebConfig(config as CloudflareWebConfig);

const command = buildPnpmInvocation([
  "exec",
  "wrangler",
  "secret",
  "list",
  "--config",
  configPath,
  "--format",
  "json",
]);

let secretListOutput: string;

try {
  secretListOutput = execFileSync(command.executable, command.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: WRANGLER_SECRET_LIST_TIMEOUT_MS,
  });
} catch (error) {
  const commandError = error as { stderr?: Buffer | string };
  const stderr = Buffer.isBuffer(commandError.stderr)
    ? commandError.stderr.toString("utf8").trim()
    : commandError.stderr?.trim();

  throw new Error(
    [
      "Unable to verify Cloudflare Worker secrets for kaiplan-web before deploying.",
      "Confirm the kaiplan-web Worker exists and set every production secret required by the embedded marketing API.",
      stderr,
    ]
      .filter(Boolean)
      .join("\n"),
    { cause: error },
  );
}

assertRequiredWebSecrets(
  parseWranglerSecretNames(secretListOutput),
  config as CloudflareWebConfig,
);
