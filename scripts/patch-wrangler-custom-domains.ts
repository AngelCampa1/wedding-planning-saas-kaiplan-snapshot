import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonc } from "./lib/cloudflare-web-config";
import {
  extractWorkerRoutes,
  mergeWorkerRoutes,
} from "./lib/wrangler-custom-domains";

const webRoot = existsSync("wrangler.jsonc") ? "." : join("apps", "web");
const userConfigPath = join(webRoot, "wrangler.jsonc");
const generatedConfigPath = join(webRoot, "dist", "server", "wrangler.json");

if (!existsSync(generatedConfigPath)) {
  console.error(`Generated config not found: ${generatedConfigPath}`);
  process.exit(1);
}

const userConfig = parseJsonc(readFileSync(userConfigPath, "utf8")) as Record<
  string,
  unknown
>;
const routes = extractWorkerRoutes(userConfig);

if (!routes.length) {
  process.exit(0);
}

const generated = JSON.parse(
  readFileSync(generatedConfigPath, "utf8"),
) as Record<string, unknown>;
const patched = mergeWorkerRoutes(generated, routes);
writeFileSync(generatedConfigPath, `${JSON.stringify(patched)}\n`);
console.log(
  `Injected routes into ${generatedConfigPath}: ${routes.map((r) => r.pattern).join(", ")}`,
);
