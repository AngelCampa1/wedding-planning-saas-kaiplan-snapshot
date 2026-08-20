/**
 * Resolves the public Turnstile site key to bake into the client bundle at
 * build time.
 *
 * In this Cloudflare SSR setup, `import.meta.env.PUBLIC_TURNSTILE_SITE_KEY` is
 * NOT populated from `.env` files (those hold local-dev values), so the key
 * must be injected via `vite.define` in astro.config. The value comes from a
 * build-time process.env override when present, otherwise from the committed
 * wrangler.jsonc `vars` block (the single source of truth for the worker).
 *
 * The site key is a public, non-secret value — safe to embed in client code.
 *
 * An explicitly-set process.env override always wins, even when it is empty:
 * the local-e2e build injects `PUBLIC_TURNSTILE_SITE_KEY=""` to force the
 * empty-key dev bypass (no widget renders, server bypasses on localhost). Only
 * an `undefined` override (no build-time var set) falls back to wrangler.
 */
export function resolveTurnstileSiteKey(
  envValue: string | undefined,
  wranglerValue: string | undefined,
): string {
  if (envValue !== undefined) {
    return envValue.trim();
  }
  return wranglerValue?.trim() ?? "";
}
