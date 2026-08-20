// Default base URL for the public wedding website during local development.
// Must stay in sync with scripts/local-e2e-config.ts DEFAULT_WEB_PORT (3031)
// and apps/app/.env.example (VITE_PUBLIC_SITE_URL). CLAUDE.md reserves port
// 3030 for the Kaiplan planner SPA; the public website sits on 3031 so both
// can run side-by-side.
export const DEFAULT_PUBLIC_SITE_URL = "http://localhost:3031";

export function resolvePublicBaseUrl(
  configured?: string,
  fallback: string = DEFAULT_PUBLIC_SITE_URL,
): string {
  const runtimeConfigured = import.meta.env.VITE_PUBLIC_SITE_URL;
  const normalizedRuntimeConfigured =
    runtimeConfigured && runtimeConfigured !== "undefined"
      ? runtimeConfigured
      : undefined;
  const resolved =
    arguments.length === 0
      ? (normalizedRuntimeConfigured ?? fallback)
      : (configured ?? fallback);
  return resolved.replace(/\/$/, "");
}
