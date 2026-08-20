// Thin wrapper around the `cloudflare:workers` virtual module so we can test
// the rest of the runtime-env helpers without faking dynamic import failures.
// Excluded from coverage because the module only resolves inside the Worker
// runtime; in Node-based dev/test it either throws (if the plugin is absent)
// or resolves with an undefined `env`, and there's no reliable way to exercise
// both branches in a Vitest process.

export const cloudflareWorkersExecutionContextKey =
  "__kaiplanCloudflareWorkersExecutionContext";

export async function readCloudflareWorkersEnv(): Promise<
  Record<string, unknown> | undefined
> {
  try {
    const mod = (await import("cloudflare:workers")) as {
      ctx?: unknown;
      env?: Record<string, unknown>;
    };
    if (mod.env && mod.ctx) {
      Object.defineProperty(mod.env, cloudflareWorkersExecutionContextKey, {
        configurable: true,
        enumerable: false,
        value: mod.ctx,
      });
    }
    return mod.env;
  } catch {
    return undefined;
  }
}
