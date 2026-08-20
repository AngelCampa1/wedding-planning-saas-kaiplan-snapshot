export const MARKETING_D1_DATABASE_NAME = "kaiplan-db";
export const REQUIRED_WEB_SECRET_NAMES = [
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
] as const;
export const REQUIRED_WEB_SEQUENCER_SECRET_NAMES = [
  "SEQUENCER_CF_ACCESS_CLIENT_ID",
  "SEQUENCER_CF_ACCESS_CLIENT_SECRET",
] as const;

export interface CloudflareWebConfig {
  main?: string;
  assets?: {
    binding?: string;
    run_worker_first?: boolean | string[];
  };
  routes?: Array<{
    pattern?: string;
    custom_domain?: boolean;
    zone_name?: string;
    zone_id?: string;
  }>;
  vars?: {
    PUBLIC_API_URL?: string;
    PUBLIC_RSVP_REQUIRE_TURNSTILE?: string;
    PUBLIC_SENTRY_DSN?: string;
    PUBLIC_TURNSTILE_SITE_KEY?: string;
    SEQUENCER_BASE_URL?: string;
  };
  triggers?: {
    crons?: string[];
  };
  r2_buckets?: Array<{
    binding?: string;
    bucket_name?: string;
  }>;
  d1_databases?: Array<{
    binding?: string;
    database_name?: string;
    database_id?: string;
  }>;
}

export function parseJsonc(jsonc: string): unknown {
  const withoutComments = jsonc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const withoutTrailingCommas = withoutComments.replace(/,\s*([}\]])/g, "$1");

  return JSON.parse(withoutTrailingCommas);
}

export function assertMarketingD1Binding(config: CloudflareWebConfig): void {
  const dbBinding = config.d1_databases?.find(
    (binding) => binding.binding === "DB",
  );

  if (!dbBinding) {
    throw new Error(
      'apps/web/wrangler.jsonc must configure a D1 binding named "DB" for the embedded marketing API.',
    );
  }

  if (dbBinding.database_name !== MARKETING_D1_DATABASE_NAME) {
    throw new Error(
      `Set apps/web/wrangler.jsonc d1_databases[DB].database_name to ${MARKETING_D1_DATABASE_NAME}.`,
    );
  }

  if (!dbBinding.database_id) {
    throw new Error(
      `Set apps/web/wrangler.jsonc d1_databases[DB].database_id to the production ${MARKETING_D1_DATABASE_NAME} D1 database id before deploying.`,
    );
  }
}

export function assertPublicSentryDsn(config: CloudflareWebConfig): void {
  if (!config.vars?.PUBLIC_SENTRY_DSN?.trim()) {
    throw new Error(
      "Set apps/web/wrangler.jsonc vars.PUBLIC_SENTRY_DSN to the production public Sentry DSN before deploying.",
    );
  }
}

export function assertPublicApiUrl(config: CloudflareWebConfig): void {
  if (!config.vars?.PUBLIC_API_URL?.trim()) {
    throw new Error(
      "Set apps/web/wrangler.jsonc vars.PUBLIC_API_URL to the production API URL before deploying.",
    );
  }
}

export function assertPublicTurnstileConfig(config: CloudflareWebConfig): void {
  if (!config.vars?.PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
    throw new Error(
      "Set apps/web/wrangler.jsonc vars.PUBLIC_TURNSTILE_SITE_KEY to the production Turnstile site key before deploying.",
    );
  }

  if (config.vars.PUBLIC_RSVP_REQUIRE_TURNSTILE !== "true") {
    throw new Error(
      'Set apps/web/wrangler.jsonc vars.PUBLIC_RSVP_REQUIRE_TURNSTILE to "true" before deploying.',
    );
  }
}

export function assertLeadMagnetR2Binding(config: CloudflareWebConfig): void {
  const r2Binding = config.r2_buckets?.find(
    (binding) => binding.binding === "LEAD_MAGNETS_R2",
  );
  if (!r2Binding || r2Binding.bucket_name !== "kaiplan-lead-magnets") {
    throw new Error(
      "apps/web/wrangler.jsonc must bind LEAD_MAGNETS_R2 to kaiplan-lead-magnets for lead magnet downloads.",
    );
  }
}

export function assertWorkerFirstAssetsConfig(
  config: CloudflareWebConfig,
): void {
  if (
    config.assets?.binding !== "ASSETS" ||
    config.assets.run_worker_first !== true
  ) {
    throw new Error(
      "apps/web/wrangler.jsonc assets must bind ASSETS and set run_worker_first to true so canonical redirects run before static HTML assets.",
    );
  }
}

export function assertWebCustomDomainRoutes(config: CloudflareWebConfig): void {
  const requiredDomains = ["kaiplan.app", "www.kaiplan.app"];
  const missingDomains = requiredDomains.filter(
    (domain) =>
      !config.routes?.some(
        (route) => route.pattern === domain && route.custom_domain === true,
      ),
  );

  if (missingDomains.length > 0) {
    throw new Error(
      `apps/web/wrangler.jsonc must configure exact Worker custom domains for ${missingDomains.join(", ")}.`,
    );
  }

  const legacyRoute = config.routes?.find(
    (route) => route.pattern?.includes("*") || route.zone_name || route.zone_id,
  );

  if (legacyRoute) {
    throw new Error(
      "apps/web/wrangler.jsonc routes must use exact Worker custom domains instead of zone routes.",
    );
  }
}

export function assertCloudflareWebConfig(config: CloudflareWebConfig): void {
  assertMarketingD1Binding(config);
  assertPublicApiUrl(config);
  assertPublicSentryDsn(config);
  assertPublicTurnstileConfig(config);
  assertLeadMagnetR2Binding(config);
  assertWorkerFirstAssetsConfig(config);
  assertWebCustomDomainRoutes(config);
}

export function assertRequiredWebSecrets(
  secretNames: string[],
  config: CloudflareWebConfig = {},
): void {
  const configured = new Set(secretNames);
  const required = [
    ...REQUIRED_WEB_SECRET_NAMES,
    ...(config.vars?.SEQUENCER_BASE_URL?.trim()
      ? REQUIRED_WEB_SEQUENCER_SECRET_NAMES
      : []),
  ];
  const missing = required.filter((name) => !configured.has(name));

  if (missing.length > 0) {
    throw new Error(
      `Set Cloudflare Worker secrets ${missing.join(
        ", ",
      )} for kaiplan-web before deploying.`,
    );
  }
}
