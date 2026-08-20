import { STRIPE_PRICE_ENV_KEYS } from "../../packages/shared/src/index";

export const HYPERDRIVE_PLACEHOLDER = "";
export const WRANGLER_SECRET_LIST_TIMEOUT_MS = 120_000;
const REQUIRED_STRIPE_PRICE_SECRET_NAMES = Object.values(
  STRIPE_PRICE_ENV_KEYS,
).flatMap((keysByInterval) => Object.values(keysByInterval));
export const REQUIRED_API_SECRET_NAMES = [
  "BETTER_AUTH_SECRET",
  "EMAIL_FROM_ADDRESS",
  "EMAIL_TOKEN_SECRET",
  "FEEDBACK_RECIPIENT_EMAIL",
  "RESEND_API_KEY",
  "SENTRY_DSN",
  "STRIPE_CHECKOUT_CANCEL_URL",
  "STRIPE_CHECKOUT_SUCCESS_URL",
  "STRIPE_PORTAL_RETURN_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  ...REQUIRED_STRIPE_PRICE_SECRET_NAMES,
  "TURNSTILE_SECRET_KEY",
] as const;

export interface CloudflareApiConfig {
  d1_databases?: Array<{
    binding?: string;
    database_name?: string;
    database_id?: string;
    migrations_dir?: string;
  }>;
  hyperdrive?: Array<{
    binding?: string;
    id?: string;
  }>;
  routes?: Array<{
    pattern?: string;
    custom_domain?: boolean;
    zone_name?: string;
    zone_id?: string;
  }>;
}

export function parseTomlApiConfig(toml: string): CloudflareApiConfig {
  const d1Databases: Array<{
    binding?: string;
    database_name?: string;
    database_id?: string;
    migrations_dir?: string;
  }> = [];
  const bindings: Array<{ binding?: string; id?: string }> = [];
  const routes: Array<{
    pattern?: string;
    custom_domain?: boolean;
    zone_name?: string;
    zone_id?: string;
  }> = [];
  let currentSection: "d1_databases" | "hyperdrive" | "routes" | null = null;
  let currentD1Database: {
    binding?: string;
    database_name?: string;
    database_id?: string;
    migrations_dir?: string;
  } | null = null;
  let currentBinding: { binding?: string; id?: string } | null = null;
  let currentRoute: {
    pattern?: string;
    custom_domain?: boolean;
    zone_name?: string;
    zone_id?: string;
  } | null = null;

  for (const line of toml.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed === "[[d1_databases]]") {
      currentSection = "d1_databases";
      currentD1Database = {};
      currentBinding = null;
      currentRoute = null;
      d1Databases.push(currentD1Database);
      continue;
    }

    if (trimmed === "[[hyperdrive]]") {
      currentSection = "hyperdrive";
      currentD1Database = null;
      currentBinding = {};
      currentRoute = null;
      bindings.push(currentBinding);
      continue;
    }

    if (trimmed === "[[routes]]") {
      currentSection = "routes";
      currentD1Database = null;
      currentBinding = null;
      currentRoute = {};
      routes.push(currentRoute);
      continue;
    }

    if (trimmed.startsWith("[") && trimmed !== "[[hyperdrive]]") {
      currentSection = null;
      currentD1Database = null;
      currentBinding = null;
      currentRoute = null;
      continue;
    }

    if (currentSection === "d1_databases" && currentD1Database) {
      const match = trimmed.match(/^([a-z_]+)\s*=\s*"([^"]*)"$/);
      if (!match) {
        continue;
      }

      const [, key, value] = match;
      if (key === "binding") {
        currentD1Database.binding = value;
      } else if (key === "database_name") {
        currentD1Database.database_name = value;
      } else if (key === "database_id") {
        currentD1Database.database_id = value;
      } else if (key === "migrations_dir") {
        currentD1Database.migrations_dir = value;
      }
      continue;
    }

    if (currentSection === "hyperdrive" && currentBinding) {
      const match = trimmed.match(/^([a-z_]+)\s*=\s*"([^"]*)"$/);
      if (!match) {
        continue;
      }

      const [, key, value] = match;
      if (key === "binding") {
        currentBinding.binding = value;
      } else if (key === "id") {
        currentBinding.id = value;
      }
      continue;
    }

    if (currentSection !== "routes" || !currentRoute) {
      continue;
    }

    const stringMatch = trimmed.match(/^([a-z_]+)\s*=\s*"([^"]*)"$/);
    if (stringMatch) {
      const [, key, value] = stringMatch;
      if (key === "pattern") {
        currentRoute.pattern = value;
      } else if (key === "zone_name") {
        currentRoute.zone_name = value;
      } else if (key === "zone_id") {
        currentRoute.zone_id = value;
      }
      continue;
    }

    const booleanMatch = trimmed.match(/^([a-z_]+)\s*=\s*(true|false)$/);
    if (booleanMatch) {
      const [, key, value] = booleanMatch;
      if (key === "custom_domain") {
        currentRoute.custom_domain = value === "true";
      }
    }
  }

  return { d1_databases: d1Databases, hyperdrive: bindings, routes };
}

export const parseTomlHyperdriveBindings = parseTomlApiConfig;

export function assertHyperdriveBinding(config: CloudflareApiConfig): void {
  const binding = config.hyperdrive?.find(
    (item) => item.binding === "HYPERDRIVE",
  );

  if (!binding) {
    throw new Error(
      'apps/api/wrangler.toml must configure a Hyperdrive binding named "HYPERDRIVE".',
    );
  }

  if (!binding.id || binding.id === HYPERDRIVE_PLACEHOLDER) {
    throw new Error(
      "Set apps/api/wrangler.toml hyperdrive[HYPERDRIVE].id to the production kaiplan-hyperdrive id before deploying.",
    );
  }
}

export function assertApiMarketingDbBinding(config: CloudflareApiConfig): void {
  const binding = config.d1_databases?.find(
    (item) => item.binding === "MARKETING_DB",
  );

  if (!binding) {
    throw new Error(
      'apps/api/wrangler.toml must configure a D1 binding named "MARKETING_DB".',
    );
  }

  if (!binding.database_name) {
    throw new Error(
      "Set apps/api/wrangler.toml MARKETING_DB.database_name before deploying.",
    );
  }

  if (!binding.database_id) {
    throw new Error(
      "Set apps/api/wrangler.toml MARKETING_DB.database_id before deploying.",
    );
  }

  if (binding.migrations_dir !== "../../apps/web/d1/migrations") {
    throw new Error(
      'Set apps/api/wrangler.toml MARKETING_DB.migrations_dir to "../../apps/web/d1/migrations" before deploying.',
    );
  }
}

export function assertApiCustomDomainRoute(config: CloudflareApiConfig): void {
  const hasApiCustomDomain = config.routes?.some(
    (route) =>
      route.pattern === "api.kaiplan.app" && route.custom_domain === true,
  );

  if (!hasApiCustomDomain) {
    throw new Error(
      "apps/api/wrangler.toml must configure api.kaiplan.app as a Worker custom domain.",
    );
  }

  const legacyRoute = config.routes?.find(
    (route) => route.pattern?.includes("*") || route.zone_name || route.zone_id,
  );

  if (legacyRoute) {
    throw new Error(
      "apps/api/wrangler.toml routes must use the exact Worker custom domain instead of zone routes.",
    );
  }
}

export function parseWranglerSecretNames(json: string): string[] {
  const parsed = JSON.parse(json) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Expected `wrangler secret list` to return a JSON array.");
  }

  return parsed
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (
        item &&
        typeof item === "object" &&
        "name" in item &&
        typeof item.name === "string"
      ) {
        return item.name;
      }

      return undefined;
    })
    .filter((name): name is string => Boolean(name));
}

export function assertRequiredApiSecrets(secretNames: string[]): void {
  const configured = new Set(secretNames);
  const missing = REQUIRED_API_SECRET_NAMES.filter(
    (name) => !configured.has(name),
  );

  if (missing.length > 0) {
    throw new Error(
      `Set Cloudflare Worker secrets ${missing.join(
        ", ",
      )} for kaiplan-api before deploying.`,
    );
  }
}
