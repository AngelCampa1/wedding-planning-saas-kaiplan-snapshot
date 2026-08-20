import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupRepoOwnedService } from "./guard-local-service";
import { buildLocalE2eStripePriceEnv } from "./local-e2e-billing-fixtures";

type LocalApiEnvOverrides = Partial<Record<string, string | undefined>>;

export const LOCAL_E2E_ENV_KEYS = {
  host: "KAIPLAN_E2E_HOST",
  apiPort: "KAIPLAN_E2E_API_PORT",
  marketingApiPort: "KAIPLAN_E2E_MARKETING_API_PORT",
  appPort: "KAIPLAN_E2E_APP_PORT",
  webPort: "KAIPLAN_E2E_WEB_PORT",
  dbPort: "KAIPLAN_E2E_DB_PORT",
  dbContainerName: "KAIPLAN_E2E_DB_CONTAINER_NAME",
} as const;

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 5030;
const DEFAULT_MARKETING_API_PORT = 5031;
const DEFAULT_APP_PORT = 3030;
const DEFAULT_WEB_PORT = 3031;
const DEFAULT_DB_PORT = 55432;
const DEFAULT_DB_NAME = "kaiplan_e2e";
const DEFAULT_DB_USER = "postgres";
const DEFAULT_DB_PASSWORD = "postgres";
const DOCKER_PROBE_TIMEOUT_MS = 5_000;
const DEFAULT_BETTER_AUTH_SECRET =
  "local-e2e-auth-secret-7f3a9c1d5e8b2f4a6c9d0e1f3a5b7c8d";
const LOCAL_E2E_RUNTIME_DIR = path.join(process.cwd(), ".local-e2e");
const LOCAL_E2E_RUNTIME_FILE = path.join(LOCAL_E2E_RUNTIME_DIR, "runtime.json");
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const GUARD_LOCAL_SERVICE_SCRIPT = path.join(
  SCRIPTS_DIR,
  "guard-local-service.ts",
);

export type LocalPlaywrightWebServer = {
  command: string;
  url: string;
  reuseExistingServer: boolean;
  timeout: number;
  env?: Record<string, string | undefined>;
};

export type LocalDbConfig = {
  containerName: string;
  database: string;
  username: string;
  password: string;
  host: string;
  port: number;
  connectionString: string;
};

export type LocalE2ERuntime = {
  host: string;
  urls: {
    api: string;
    marketingApi: string;
    app: string;
    web: string;
  };
  db: LocalDbConfig;
};

function quoteCommandArg(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function buildGuardedLocalServiceCommand(options: {
  label: string;
  port: number | string;
  match: string;
  command: string;
  repoRoots?: string[];
}) {
  const commandParts = [
    `pnpm exec tsx ${quoteCommandArg(GUARD_LOCAL_SERVICE_SCRIPT)}`,
    `--label ${quoteCommandArg(options.label)}`,
    `--port ${quoteCommandArg(String(options.port))}`,
    `--match ${quoteCommandArg(options.match)}`,
  ];

  for (const repoRoot of options.repoRoots ?? []) {
    commandParts.push(`--repo-root ${quoteCommandArg(repoRoot)}`);
  }

  commandParts.push(`--command ${quoteCommandArg(options.command)}`);

  return commandParts.join(" ");
}

function buildConnectionString(host: string, port: number) {
  return `postgres://${DEFAULT_DB_USER}:${DEFAULT_DB_PASSWORD}@${host}:${port}/${DEFAULT_DB_NAME}`;
}

function persistLocalE2ERuntime(runtime: LocalE2ERuntime) {
  fs.mkdirSync(LOCAL_E2E_RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(LOCAL_E2E_RUNTIME_FILE, JSON.stringify(runtime, null, 2));
}

function readPersistedLocalE2ERuntime() {
  try {
    const runtime = JSON.parse(
      fs.readFileSync(LOCAL_E2E_RUNTIME_FILE, "utf8"),
    ) as LocalE2ERuntime;

    if (
      typeof runtime.host === "string" &&
      runtime.urls &&
      typeof runtime.urls.api === "string" &&
      typeof runtime.urls.marketingApi === "string" &&
      typeof runtime.urls.app === "string" &&
      typeof runtime.urls.web === "string" &&
      runtime.db &&
      typeof runtime.db.containerName === "string" &&
      typeof runtime.db.database === "string" &&
      typeof runtime.db.username === "string" &&
      typeof runtime.db.password === "string" &&
      typeof runtime.db.host === "string" &&
      typeof runtime.db.port === "number" &&
      typeof runtime.db.connectionString === "string"
    ) {
      return runtime;
    }
  } catch {
    return null;
  }

  return null;
}

function isDockerProbeTimeout(result: ReturnType<typeof spawnSync>) {
  return (
    result.error !== undefined &&
    typeof result.error === "object" &&
    "code" in result.error &&
    result.error.code === "ETIMEDOUT"
  );
}

function readExistingLocalDbPort(containerName: string) {
  const result = spawnSync(
    "docker",
    [
      "ps",
      "-a",
      "--filter",
      `name=^/${containerName}$`,
      "--format",
      "{{.State}}|{{.Ports}}",
    ],
    {
      encoding: "utf8",
      stdio: "pipe",
      timeout: DOCKER_PROBE_TIMEOUT_MS,
    },
  );

  if (isDockerProbeTimeout(result)) {
    throw new Error(
      `docker ps -a --filter name=^/${containerName}$ --format {{.State}}|{{.Ports}} timed out after ${DOCKER_PROBE_TIMEOUT_MS}ms. Is Docker Desktop running and responsive?`,
    );
  }

  if (result.signal) {
    throw new Error(
      `docker ps -a --filter name=^/${containerName}$ --format {{.State}}|{{.Ports}} exited after signal ${result.signal}.`,
    );
  }

  if (result.error) {
    throw new Error(
      `docker ps -a --filter name=^/${containerName}$ --format {{.State}}|{{.Ports}} failed to start: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    return null;
  }

  const output = result.stdout.trim();
  if (!output) {
    return null;
  }

  const [state = "", ports = ""] = output.split("|", 2);
  const match = ports.match(/:(\d+)->5432\/tcp/);

  return {
    isRunning: state === "running",
    port: match ? Number(match[1]) : null,
  };
}

function replaceRuntimeDbPort(runtime: LocalE2ERuntime, port: number) {
  return {
    ...runtime,
    db: {
      ...runtime.db,
      port,
      connectionString: buildConnectionString(runtime.db.host, port),
    },
  } satisfies LocalE2ERuntime;
}

export const DEFAULT_LOCAL_E2E_RUNTIME: LocalE2ERuntime = {
  host: DEFAULT_HOST,
  urls: {
    api: `http://${DEFAULT_HOST}:${DEFAULT_API_PORT}`,
    marketingApi: `http://${DEFAULT_HOST}:${DEFAULT_MARKETING_API_PORT}`,
    app: `http://${DEFAULT_HOST}:${DEFAULT_APP_PORT}`,
    web: `http://${DEFAULT_HOST}:${DEFAULT_WEB_PORT}`,
  },
  db: {
    containerName: "kaiplan-e2e-db",
    database: DEFAULT_DB_NAME,
    username: DEFAULT_DB_USER,
    password: DEFAULT_DB_PASSWORD,
    host: DEFAULT_HOST,
    port: DEFAULT_DB_PORT,
    connectionString: buildConnectionString(DEFAULT_HOST, DEFAULT_DB_PORT),
  },
};

let runtimePromise: Promise<LocalE2ERuntime> | null = null;

function readPort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildRuntime(
  host: string,
  ports: {
    api: number;
    marketingApi: number;
    app: number;
    web: number;
    db: number;
  },
  containerName: string,
): LocalE2ERuntime {
  return {
    host,
    urls: {
      api: `http://${host}:${ports.api}`,
      marketingApi: `http://${host}:${ports.marketingApi}`,
      app: `http://${host}:${ports.app}`,
      web: `http://${host}:${ports.web}`,
    },
    db: {
      containerName,
      database: DEFAULT_DB_NAME,
      username: DEFAULT_DB_USER,
      password: DEFAULT_DB_PASSWORD,
      host,
      port: ports.db,
      connectionString: buildConnectionString(host, ports.db),
    },
  };
}

export function readLocalE2ERuntime(): LocalE2ERuntime {
  if (runtimeEnvIsInitialized()) {
    return buildRuntime(
      process.env[LOCAL_E2E_ENV_KEYS.host] ?? DEFAULT_HOST,
      {
        api: readPort(
          process.env[LOCAL_E2E_ENV_KEYS.apiPort],
          DEFAULT_API_PORT,
        ),
        marketingApi: readPort(
          process.env[LOCAL_E2E_ENV_KEYS.marketingApiPort],
          DEFAULT_MARKETING_API_PORT,
        ),
        app: readPort(
          process.env[LOCAL_E2E_ENV_KEYS.appPort],
          DEFAULT_APP_PORT,
        ),
        web: readPort(
          process.env[LOCAL_E2E_ENV_KEYS.webPort],
          DEFAULT_WEB_PORT,
        ),
        db: readPort(process.env[LOCAL_E2E_ENV_KEYS.dbPort], DEFAULT_DB_PORT),
      },
      process.env[LOCAL_E2E_ENV_KEYS.dbContainerName] ??
        DEFAULT_LOCAL_E2E_RUNTIME.db.containerName,
    );
  }

  const persistedRuntime = readPersistedLocalE2ERuntime();
  if (persistedRuntime) {
    return persistedRuntime;
  }

  const host = process.env[LOCAL_E2E_ENV_KEYS.host] ?? DEFAULT_HOST;
  const apiPort = readPort(
    process.env[LOCAL_E2E_ENV_KEYS.apiPort],
    DEFAULT_API_PORT,
  );
  const marketingApiPort = readPort(
    process.env[LOCAL_E2E_ENV_KEYS.marketingApiPort],
    DEFAULT_MARKETING_API_PORT,
  );
  const appPort = readPort(
    process.env[LOCAL_E2E_ENV_KEYS.appPort],
    DEFAULT_APP_PORT,
  );
  const webPort = readPort(
    process.env[LOCAL_E2E_ENV_KEYS.webPort],
    DEFAULT_WEB_PORT,
  );
  const dbPort = readPort(
    process.env[LOCAL_E2E_ENV_KEYS.dbPort],
    DEFAULT_DB_PORT,
  );
  const containerName =
    process.env[LOCAL_E2E_ENV_KEYS.dbContainerName] ??
    DEFAULT_LOCAL_E2E_RUNTIME.db.containerName;

  return buildRuntime(
    host,
    {
      api: apiPort,
      marketingApi: marketingApiPort,
      app: appPort,
      web: webPort,
      db: dbPort,
    },
    containerName,
  );
}

function runtimeEnvIsInitialized() {
  return [
    LOCAL_E2E_ENV_KEYS.host,
    LOCAL_E2E_ENV_KEYS.apiPort,
    LOCAL_E2E_ENV_KEYS.marketingApiPort,
    LOCAL_E2E_ENV_KEYS.appPort,
    LOCAL_E2E_ENV_KEYS.webPort,
    LOCAL_E2E_ENV_KEYS.dbPort,
    LOCAL_E2E_ENV_KEYS.dbContainerName,
  ].every((key) => {
    const value = process.env[key];
    return typeof value === "string" && value.length > 0;
  });
}

function applyLocalE2EEnv(runtime: LocalE2ERuntime) {
  process.env[LOCAL_E2E_ENV_KEYS.host] = runtime.host;
  process.env[LOCAL_E2E_ENV_KEYS.apiPort] = new URL(runtime.urls.api).port;
  process.env[LOCAL_E2E_ENV_KEYS.marketingApiPort] = new URL(
    runtime.urls.marketingApi,
  ).port;
  process.env[LOCAL_E2E_ENV_KEYS.appPort] = new URL(runtime.urls.app).port;
  process.env[LOCAL_E2E_ENV_KEYS.webPort] = new URL(runtime.urls.web).port;
  process.env[LOCAL_E2E_ENV_KEYS.dbPort] = String(runtime.db.port);
  process.env[LOCAL_E2E_ENV_KEYS.dbContainerName] = runtime.db.containerName;
}

function reservePort(host: string | undefined, port: number) {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.once("error", (error) => {
      server.close();
      reject(error);
    });

    server.listen(port, host, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const resolvedPort = address.port;
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve(resolvedPort);
        });
        return;
      }

      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        reject(new Error("Could not resolve a local port."));
      });
    });
  });
}

async function resolveAvailablePort(
  host: string | undefined,
  preferredPort: number,
  reserved: Set<number>,
) {
  if (!reserved.has(preferredPort)) {
    try {
      const preferred = await reservePort(host, preferredPort);
      reserved.add(preferred);
      return preferred;
    } catch {
      // Fall back to an ephemeral port below.
    }
  }

  while (true) {
    const fallbackPort = await reservePort(host, 0);
    if (!reserved.has(fallbackPort)) {
      reserved.add(fallbackPort);
      return fallbackPort;
    }
  }
}

async function reserveStoppedContainerPortIfAvailable(
  host: string | undefined,
  port: number,
  reserved: Set<number>,
) {
  if (reserved.has(port)) {
    return false;
  }

  try {
    const reservedPort = await reservePort(host, port);
    reserved.add(reservedPort);
    return true;
  } catch {
    return false;
  }
}

async function reconcileCachedRuntimeDbPort(runtime: LocalE2ERuntime) {
  const reserved = new Set<number>([
    Number(new URL(runtime.urls.api).port),
    Number(new URL(runtime.urls.marketingApi).port),
    Number(new URL(runtime.urls.app).port),
    Number(new URL(runtime.urls.web).port),
  ]);
  const existingDbContainer = readExistingLocalDbPort(runtime.db.containerName);

  if (existingDbContainer?.port && existingDbContainer.isRunning) {
    return replaceRuntimeDbPort(runtime, existingDbContainer.port);
  }

  if (
    existingDbContainer?.port &&
    (await reserveStoppedContainerPortIfAvailable(
      runtime.host,
      existingDbContainer.port,
      reserved,
    ))
  ) {
    return replaceRuntimeDbPort(runtime, existingDbContainer.port);
  }

  if (
    await reserveStoppedContainerPortIfAvailable(
      runtime.host,
      runtime.db.port,
      reserved,
    )
  ) {
    return runtime;
  }

  const fallbackPort = await resolveAvailablePort(
    runtime.host,
    runtime.db.port,
    reserved,
  );
  return replaceRuntimeDbPort(runtime, fallbackPort);
}

export async function ensureLocalE2ERuntime() {
  if (runtimeEnvIsInitialized()) {
    const runtime = readLocalE2ERuntime();
    persistLocalE2ERuntime(runtime);
    return runtime;
  }

  const persistedRuntime = readPersistedLocalE2ERuntime();
  if (persistedRuntime) {
    const reconciledRuntime =
      await reconcileCachedRuntimeDbPort(persistedRuntime);
    applyLocalE2EEnv(reconciledRuntime);
    persistLocalE2ERuntime(reconciledRuntime);
    return reconciledRuntime;
  }

  if (!runtimePromise) {
    runtimePromise = (async () => {
      const host = process.env[LOCAL_E2E_ENV_KEYS.host] ?? DEFAULT_HOST;
      const reserved = new Set<number>();

      const apiPort = await resolveAvailablePort(
        host,
        readPort(process.env[LOCAL_E2E_ENV_KEYS.apiPort], DEFAULT_API_PORT),
        reserved,
      );
      const marketingApiPort = await resolveAvailablePort(
        host,
        readPort(
          process.env[LOCAL_E2E_ENV_KEYS.marketingApiPort],
          DEFAULT_MARKETING_API_PORT,
        ),
        reserved,
      );
      const appPort = await resolveAvailablePort(
        host,
        readPort(process.env[LOCAL_E2E_ENV_KEYS.appPort], DEFAULT_APP_PORT),
        reserved,
      );
      const webPort = await resolveAvailablePort(
        host,
        readPort(process.env[LOCAL_E2E_ENV_KEYS.webPort], DEFAULT_WEB_PORT),
        reserved,
      );
      const containerName =
        process.env[LOCAL_E2E_ENV_KEYS.dbContainerName] ??
        DEFAULT_LOCAL_E2E_RUNTIME.db.containerName;
      const existingDbContainer = readExistingLocalDbPort(containerName);
      let dbPort: number;

      if (existingDbContainer?.port && existingDbContainer.isRunning) {
        reserved.add(existingDbContainer.port);
        dbPort = existingDbContainer.port;
      } else if (
        existingDbContainer?.port &&
        (await reserveStoppedContainerPortIfAvailable(
          host,
          existingDbContainer.port,
          reserved,
        ))
      ) {
        dbPort = existingDbContainer.port;
      } else {
        dbPort = await resolveAvailablePort(
          host,
          readPort(process.env[LOCAL_E2E_ENV_KEYS.dbPort], DEFAULT_DB_PORT),
          reserved,
        );
      }

      process.env[LOCAL_E2E_ENV_KEYS.host] = host;
      process.env[LOCAL_E2E_ENV_KEYS.apiPort] = String(apiPort);
      process.env[LOCAL_E2E_ENV_KEYS.marketingApiPort] =
        String(marketingApiPort);
      process.env[LOCAL_E2E_ENV_KEYS.appPort] = String(appPort);
      process.env[LOCAL_E2E_ENV_KEYS.webPort] = String(webPort);
      process.env[LOCAL_E2E_ENV_KEYS.dbPort] = String(dbPort);
      process.env[LOCAL_E2E_ENV_KEYS.dbContainerName] = containerName;

      const runtime = readLocalE2ERuntime();
      persistLocalE2ERuntime(runtime);
      return runtime;
    })();
  }

  return runtimePromise;
}

export function buildLocalDbConfig(
  runtime: LocalE2ERuntime = readLocalE2ERuntime(),
): LocalDbConfig {
  return runtime.db;
}

export function buildLocalApiEnv(
  overrides: LocalApiEnvOverrides = {},
  runtime: LocalE2ERuntime = readLocalE2ERuntime(),
): Record<string, string | undefined> {
  const localStripePriceEnv = buildLocalE2eStripePriceEnv();

  return {
    APP_URL: overrides.APP_URL ?? runtime.urls.app,
    PUBLIC_WEB_URL: overrides.PUBLIC_WEB_URL ?? runtime.urls.web,
    BETTER_AUTH_SECRET:
      overrides.BETTER_AUTH_SECRET ?? DEFAULT_BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: overrides.BETTER_AUTH_URL ?? runtime.urls.api,
    EMAIL_FROM_ADDRESS:
      overrides.EMAIL_FROM_ADDRESS ?? "Angel Campa <angel.campa@kaiplan.local>",
    EMAIL_TOKEN_SECRET: overrides.EMAIL_TOKEN_SECRET ?? "local-email-secret",
    STRIPE_SECRET_KEY: overrides.STRIPE_SECRET_KEY ?? "sk_test_local",
    STRIPE_WEBHOOK_SECRET: overrides.STRIPE_WEBHOOK_SECRET ?? "whsec_local",
    ...localStripePriceEnv,
    ...Object.fromEntries(
      Object.keys(localStripePriceEnv).map((key) => [
        key,
        overrides[key] ?? localStripePriceEnv[key],
      ]),
    ),
    STRIPE_CHECKOUT_SUCCESS_URL:
      overrides.STRIPE_CHECKOUT_SUCCESS_URL ??
      `${runtime.urls.app}/settings?checkout=success`,
    STRIPE_CHECKOUT_CANCEL_URL:
      overrides.STRIPE_CHECKOUT_CANCEL_URL ??
      `${runtime.urls.app}/settings?checkout=cancelled`,
    STRIPE_PORTAL_RETURN_URL:
      overrides.STRIPE_PORTAL_RETURN_URL ?? `${runtime.urls.app}/settings`,
    CLOUDFLARE_IMAGES_ACCOUNT_ID:
      overrides.CLOUDFLARE_IMAGES_ACCOUNT_ID ?? "local-account",
    CLOUDFLARE_IMAGES_API_TOKEN:
      overrides.CLOUDFLARE_IMAGES_API_TOKEN ?? "local-token",
    DATABASE_URL: overrides.DATABASE_URL,
    // E2E_MODE and ENVIRONMENT must both be set so the fail-closed isE2eAllowed
    // gate recognises this as an E2E environment. E2E_MODE alone is insufficient
    // because isE2eAllowed requires ENVIRONMENT to be "development" or "test".
    E2E_MODE: overrides.E2E_MODE ?? "true",
    ENVIRONMENT: overrides.ENVIRONMENT ?? "development",
    GOOGLE_CLIENT_ID: overrides.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: overrides.GOOGLE_CLIENT_SECRET,
    RESEND_API_KEY: overrides.RESEND_API_KEY,
    TURNSTILE_SECRET_KEY: overrides.TURNSTILE_SECRET_KEY,
    PUBLIC_RSVP_HONEYPOT_FIELD: overrides.PUBLIC_RSVP_HONEYPOT_FIELD,
    PUBLIC_RSVP_TURNSTILE_FIELD: overrides.PUBLIC_RSVP_TURNSTILE_FIELD,
    PUBLIC_RSVP_REQUIRE_TURNSTILE:
      overrides.PUBLIC_RSVP_REQUIRE_TURNSTILE ?? "false",
    EMAIL_REPLY_TO_ADDRESS: overrides.EMAIL_REPLY_TO_ADDRESS,
    CLOUDFLARE_IMAGES_DELIVERY_BASE_URL:
      overrides.CLOUDFLARE_IMAGES_DELIVERY_BASE_URL,
    CLOUDFLARE_IMAGES_DIRECT_UPLOAD_TTL_SECONDS:
      overrides.CLOUDFLARE_IMAGES_DIRECT_UPLOAD_TTL_SECONDS,
  };
}

export function buildLocalPlaywrightWebServers(
  runtime: LocalE2ERuntime = readLocalE2ERuntime(),
): LocalPlaywrightWebServer[] {
  const apiPort = new URL(runtime.urls.api).port;
  const marketingApiPort = new URL(runtime.urls.marketingApi).port;
  const appPort = new URL(runtime.urls.app).port;
  const webPort = new URL(runtime.urls.web).port;

  return [
    {
      command: buildGuardedLocalServiceCommand({
        label: "marketing-api",
        port: marketingApiPort,
        match: "serve-local-marketing-api.ts",
        command: `pnpm exec tsx ${quoteCommandArg(
          path.join(SCRIPTS_DIR, "serve-local-marketing-api.ts"),
        )}`,
      }),
      url: `${runtime.urls.marketingApi}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: marketingApiPort,
        ALLOWED_ORIGIN: runtime.urls.web,
        PRODUCT_DOMAIN: new URL(runtime.urls.web).host,
      },
    },
    {
      command: buildGuardedLocalServiceCommand({
        label: "api",
        port: apiPort,
        match: "prepare-and-serve-local-api.ts",
        command: `pnpm exec tsx ${quoteCommandArg(
          path.join(SCRIPTS_DIR, "prepare-and-serve-local-api.ts"),
        )}`,
      }),
      url: `${runtime.urls.api}/api/health`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        ...buildLocalApiEnv(
          {
            DATABASE_URL: runtime.db.connectionString,
          },
          runtime,
        ),
        PORT: apiPort,
      },
    },
    {
      command: buildGuardedLocalServiceCommand({
        label: "web",
        port: webPort,
        match: "astro.mjs",
        repoRoots: buildLocalWebPreviewRepoRoots(),
        command: `pnpm --filter @kaiplan/web run build && pnpm --filter @kaiplan/web exec astro preview --host ${runtime.host} --port ${webPort} --strictPort`,
      }),
      url: runtime.urls.web,
      reuseExistingServer: false,
      timeout: 900_000,
      env: {
        PORT: webPort,
        LOCAL_MARKETING_API_STUB_SENTRY: "true",
        PUBLIC_DISABLE_ANALYTICS: "true",
        PUBLIC_DISABLE_REMOTE_FONTS: "true",
        PUBLIC_TURNSTILE_SITE_KEY: "",
        PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
        PUBLIC_API_URL: runtime.urls.api,
        PUBLIC_APP_ORIGIN: runtime.urls.app,
        PUBLIC_MARKETING_API_URL: runtime.urls.marketingApi,
      },
    },
    {
      command: buildGuardedLocalServiceCommand({
        label: "app",
        port: appPort,
        match: "vite.js",
        command: `pnpm --filter @kaiplan/app exec vite --host ${runtime.host} --port ${appPort} --strictPort`,
      }),
      url: `${runtime.urls.app}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: appPort,
        VITE_DISABLE_REMOTE_FONTS: "true",
        VITE_API_URL: runtime.urls.api,
        VITE_PUBLIC_SITE_URL: runtime.urls.web,
      },
    },
  ];
}

export function buildLocalWebPreviewRepoRoots() {
  const currentRepoRoot = process.cwd();
  return [
    currentRepoRoot,
    fs.realpathSync.native(currentRepoRoot),
    path.join(os.homedir(), "Documents", "kaiplan"),
  ].filter(
    (repoRoot, index, values) =>
      fs.existsSync(repoRoot) && values.indexOf(repoRoot) === index,
  );
}

export function cleanupStaleLocalWebPreview(
  runtime: LocalE2ERuntime = readLocalE2ERuntime(),
) {
  const webPort = Number(new URL(runtime.urls.web).port);
  return cleanupRepoOwnedService({
    port: webPort,
    match: "astro.mjs",
    repoRoots: buildLocalWebPreviewRepoRoots(),
  });
}
