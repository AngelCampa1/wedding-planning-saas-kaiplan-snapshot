import { resolvePublicApiBase } from "./public-website";

interface ApiEnv {
  PUBLIC_API_URL?: string;
  PROD: boolean;
}

/**
 * Resolves the API base URL for the wedding RSVP page.
 *
 * Delegates to resolvePublicApiBase for URL resolution logic. Adds a
 * production guard: if PROD is true and PUBLIC_API_URL is not set, throws
 * immediately so the build fails rather than silently sending RSVP submissions
 * to the wrong origin.
 */
export function getApiBaseUrl(env: ApiEnv, currentUrl: URL): string {
  const configured = env.PUBLIC_API_URL?.trim();

  if (env.PROD && (!configured || configured.length === 0)) {
    throw new Error(
      "PUBLIC_API_URL is required in production but is not set. RSVP form submissions would be silently broken.",
    );
  }

  return resolvePublicApiBase(configured, currentUrl);
}
