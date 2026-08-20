import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeAstroCloudflarePreviewConfig } from "./lib/astro-cloudflare-preview-config";

const defaultConfigPath = existsSync(join("dist", "server", "wrangler.json"))
  ? join("dist", "server", "wrangler.json")
  : join("apps", "web", "dist", "server", "wrangler.json");
const configPath = process.argv[2] ?? defaultConfigPath;

if (existsSync(configPath)) {
  const rawConfig = readFileSync(configPath, "utf8");
  const config = JSON.parse(rawConfig) as Parameters<
    typeof normalizeAstroCloudflarePreviewConfig
  >[0];
  const normalizedConfig = normalizeAstroCloudflarePreviewConfig(config);

  writeFileSync(configPath, `${JSON.stringify(normalizedConfig)}\n`);
}
