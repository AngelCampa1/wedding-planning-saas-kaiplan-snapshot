// Read variables that may differ between the build-time environment and the
// deployed Cloudflare Worker runtime. `import.meta.env.PUBLIC_*` values are
// baked at build. Runtime `wrangler.jsonc` `vars` are exposed via the
// `cloudflare:workers` module (`Astro.locals.runtime.env` was removed in
// Astro v6).
//
// Prefer the runtime value so config changes in wrangler.jsonc take effect
// without rebuilding. Fall back to the build-time value for dev, SSG, and
// tests where the `cloudflare:workers` module is unavailable.

import { readCloudflareWorkersEnv } from "./cloudflare-workers-env";

export type RuntimeEnv = Record<string, string | undefined>;

// Intentionally module-scoped: wrangler vars are static per deployment, so
// caching once per isolate lifetime is safe. The "no rebuild needed" comment
// above refers to redeployment granularity, not per-request freshness.
let cachedRuntimeEnv: RuntimeEnv | undefined;

export function pickStringEntries(
  env: Record<string, unknown> | undefined | null,
): RuntimeEnv {
  if (!env) return {};
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export async function getRuntimeEnv(): Promise<RuntimeEnv> {
  if (cachedRuntimeEnv) return cachedRuntimeEnv;
  const rawEnv = await readCloudflareWorkersEnv();
  cachedRuntimeEnv = pickStringEntries(rawEnv);
  return cachedRuntimeEnv;
}

export function readPublicVar(
  runtime: RuntimeEnv,
  key: string,
  fallback?: string,
): string | undefined {
  const buildValue = (import.meta.env as RuntimeEnv)[key];
  if (
    typeof buildValue === "string" &&
    buildValue.length > 0 &&
    isLocalUrl(buildValue)
  ) {
    return buildValue;
  }

  const runtimeValue = runtime[key];
  if (typeof runtimeValue === "string" && runtimeValue.length > 0) {
    return runtimeValue;
  }

  if (typeof buildValue === "string" && buildValue.length > 0) {
    return buildValue;
  }
  return fallback;
}

function isLocalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function resetRuntimeEnvCacheForTests(): void {
  cachedRuntimeEnv = undefined;
}
