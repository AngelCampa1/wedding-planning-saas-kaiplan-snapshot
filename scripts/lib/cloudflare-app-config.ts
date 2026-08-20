export interface AppDeployEnv {
  VITE_API_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
  VITE_SENTRY_DSN?: string;
  // Optional Ventora CRM feedback widget plumbing. Forwarded from process.env
  // at deploy time when present; left unset (and the widget dormant) otherwise.
  VITE_CRM_WIDGET_KEY?: string;
  VITE_CRM_LOADER_URL?: string;
}

export const APP_BUILD_TIMEOUT_MS = 900_000;

export interface CloudflareAppConfig {
  name?: string;
  main?: string;
  vars?: AppDeployEnv;
  assets?: {
    directory?: string;
    binding?: string;
    not_found_handling?: string;
  };
  routes?: Array<{
    pattern?: string;
    custom_domain?: boolean;
    zone_name?: string;
    zone_id?: string;
  }>;
}

const REQUIRED_APP_DEPLOY_ENV = [
  "VITE_API_URL",
  "VITE_PUBLIC_SITE_URL",
  "VITE_SENTRY_DSN",
] as const;

export function assertAppDeployEnv(env: AppDeployEnv): void {
  const missing = REQUIRED_APP_DEPLOY_ENV.filter((key) => !env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Set ${missing.join(", ")} before deploying @kaiplan/app to Cloudflare Workers.`,
    );
  }
}

export function resolveAppBuildEnv(config: CloudflareAppConfig): AppDeployEnv {
  const env: AppDeployEnv = {
    VITE_API_URL: config.vars?.VITE_API_URL,
    VITE_PUBLIC_SITE_URL: config.vars?.VITE_PUBLIC_SITE_URL,
    VITE_SENTRY_DSN: config.vars?.VITE_SENTRY_DSN,
  };

  // Forward optional Ventora CRM feedback widget vars from the deploy-time
  // environment so they survive the build script's VITE_* sanitization. The
  // value is never read from committed config — only from process.env — and is
  // only attached when present, keeping the widget dormant by default.
  const crmKey = process.env.VITE_CRM_WIDGET_KEY?.trim();
  if (crmKey) {
    env.VITE_CRM_WIDGET_KEY = crmKey;
  }

  const crmLoaderUrl = process.env.VITE_CRM_LOADER_URL?.trim();
  if (crmLoaderUrl) {
    env.VITE_CRM_LOADER_URL = crmLoaderUrl;
  }

  return env;
}

export function assertAppDeployScriptUsesWorkers(deployScript: string): void {
  if (/\bwrangler\s+pages\s+deploy\b/.test(deployScript)) {
    throw new Error(
      "@kaiplan/app must deploy as a Cloudflare Worker, not Cloudflare Pages.",
    );
  }

  if (!/\bwrangler\s+deploy\b/.test(deployScript)) {
    throw new Error(
      "@kaiplan/app deploy script must run wrangler deploy for the kaiplan-app Worker.",
    );
  }
}

export function assertAppWorkerConfig(config: CloudflareAppConfig): void {
  if (config.name !== "kaiplan-app") {
    throw new Error('apps/app/wrangler.jsonc name must be "kaiplan-app".');
  }

  if (config.main !== "./src/worker.ts") {
    throw new Error(
      "apps/app/wrangler.jsonc main must point to ./src/worker.ts.",
    );
  }

  if (
    config.assets?.directory !== "./dist" ||
    config.assets.binding !== "ASSETS" ||
    config.assets.not_found_handling !== "single-page-application"
  ) {
    throw new Error(
      "apps/app/wrangler.jsonc assets must bind ASSETS to ./dist with single-page-application not_found_handling.",
    );
  }

  const hasAppCustomDomain = config.routes?.some(
    (route) =>
      route.pattern === "my.kaiplan.app" && route.custom_domain === true,
  );

  if (!hasAppCustomDomain) {
    throw new Error(
      "apps/app/wrangler.jsonc must configure my.kaiplan.app as a Worker custom domain.",
    );
  }

  assertAppDeployEnv(config.vars ?? {});
}
