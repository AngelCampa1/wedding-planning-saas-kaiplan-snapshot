type DatabaseEnv = {
  HYPERDRIVE?: { connectionString?: string };
  DATABASE_URL?: string;
};

type OriginEnv = {
  APP_URL: string;
  PUBLIC_WEB_URL?: string;
};

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, "");
}

export function resolveDatabaseConnectionString(env: DatabaseEnv) {
  const hyperdriveUrl = env.HYPERDRIVE?.connectionString?.trim();
  if (hyperdriveUrl) {
    return hyperdriveUrl;
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return databaseUrl;
  }

  throw new Error(
    "Database connection is not configured. Set HYPERDRIVE or DATABASE_URL.",
  );
}

export function buildAllowedOrigins(env: OriginEnv) {
  const origins = [env.APP_URL, env.PUBLIC_WEB_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeOrigin);

  // Ensure both apex and www are always in the allowlist when either is present,
  // so CORS works regardless of which canonical form the client uses.
  if (
    origins.includes("https://kaiplan.app") ||
    origins.includes("https://www.kaiplan.app")
  ) {
    origins.push("https://kaiplan.app", "https://www.kaiplan.app");
  }

  return [...new Set(origins)];
}

export function buildAuthenticatedMutationOrigins(env: OriginEnv) {
  return [normalizeOrigin(env.APP_URL)];
}

export function buildCorsOriginsForPath(env: OriginEnv, pathname: string) {
  if (pathname === "/api/public" || pathname.startsWith("/api/public/")) {
    return buildAllowedOrigins(env);
  }

  return buildAuthenticatedMutationOrigins(env);
}
