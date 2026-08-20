import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertApiMarketingDbBinding,
  assertApiCustomDomainRoute,
  assertHyperdriveBinding,
  assertRequiredApiSecrets,
  parseTomlApiConfig,
  parseWranglerSecretNames,
  WRANGLER_SECRET_LIST_TIMEOUT_MS,
} from "./lib/cloudflare-api-config";
import { buildPnpmInvocation } from "./lib/pnpm-invocation";

const configPath = existsSync("wrangler.toml")
  ? "wrangler.toml"
  : join("apps", "api", "wrangler.toml");
const config = parseTomlApiConfig(readFileSync(configPath, "utf8"));

assertHyperdriveBinding(config);
assertApiMarketingDbBinding(config);
assertApiCustomDomainRoute(config);

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
      "Unable to verify Cloudflare Worker secrets for kaiplan-api before deploying.",
      "Confirm the kaiplan-api Worker exists and set every production secret required by apps/api/src/lib/env-schema.ts.",
      stderr,
    ]
      .filter(Boolean)
      .join("\n"),
    { cause: error },
  );
}

assertRequiredApiSecrets(parseWranglerSecretNames(secretListOutput));
