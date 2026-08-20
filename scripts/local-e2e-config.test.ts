import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGuardedLocalServiceCommand,
  buildLocalApiEnv,
  buildLocalDbConfig,
  buildLocalPlaywrightWebServers,
  DEFAULT_LOCAL_E2E_RUNTIME,
  LOCAL_E2E_ENV_KEYS,
  readLocalE2ERuntime,
} from "./local-e2e-config";

const ORIGINAL_ENV = { ...process.env };
const LOCAL_E2E_RUNTIME_CACHE_FILE = path.join(
  process.cwd(),
  ".local-e2e",
  "runtime.json",
);
const SCRIPTS_DIR = path.resolve("scripts");

function restoreLocalE2EEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function clearLocalE2ERuntimeCache() {
  fs.rmSync(LOCAL_E2E_RUNTIME_CACHE_FILE, {
    force: true,
  });
}

async function getAvailablePort() {
  const listener = createServer();
  await new Promise<void>((resolve) =>
    listener.listen(0, "127.0.0.1", resolve),
  );
  const address = listener.address();
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );

  if (!address || typeof address !== "object") {
    throw new Error("Could not bind a test port.");
  }

  return address.port;
}

beforeEach(() => {
  clearLocalE2ERuntimeCache();
});

afterEach(() => {
  restoreLocalE2EEnv();
  clearLocalE2ERuntimeCache();
});

describe("buildLocalApiEnv", () => {
  it("provides the local e2e defaults required for real auth and public RSVP", () => {
    const runtime = readLocalE2ERuntime();
    const env = buildLocalApiEnv({
      DATABASE_URL: runtime.db.connectionString,
    });

    expect(env).toMatchObject({
      APP_URL: runtime.urls.app,
      PUBLIC_WEB_URL: runtime.urls.web,
      BETTER_AUTH_URL: runtime.urls.api,
      BETTER_AUTH_SECRET:
        "local-e2e-auth-secret-7f3a9c1d5e8b2f4a6c9d0e1f3a5b7c8d",
      E2E_MODE: "true",
      // ENVIRONMENT must be "development" so isE2eAllowed gates pass and
      // requireEmailVerification is disabled for the local e2e stack.
      ENVIRONMENT: "development",
      PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
      DATABASE_URL: runtime.db.connectionString,
      STRIPE_CHECKOUT_SUCCESS_URL: `${runtime.urls.app}/settings?checkout=success`,
      STRIPE_CHECKOUT_CANCEL_URL: `${runtime.urls.app}/settings?checkout=cancelled`,
      STRIPE_PORTAL_RETURN_URL: `${runtime.urls.app}/settings`,
    });
  });

  it("generated env satisfies isE2eAllowed gate — E2E_MODE and ENVIRONMENT are both set correctly", () => {
    const runtime = readLocalE2ERuntime();
    const env = buildLocalApiEnv({
      DATABASE_URL: runtime.db.connectionString,
    });

    // Assert the specific fields that isE2eAllowed checks:
    //   E2E_MODE === "true" && ENVIRONMENT === "development"
    expect(env.E2E_MODE).toBe("true");
    expect(env.ENVIRONMENT).toBe("development");
  });
});

describe("buildLocalPlaywrightWebServers", () => {
  it("keeps stale web cleanup inside guarded server startup, not config evaluation", () => {
    const configSource = fs.readFileSync(
      path.join(process.cwd(), "e2e", "playwright.config.ts"),
      "utf8",
    );

    expect(configSource).not.toContain("cleanupStaleLocalWebPreview");
  });

  it("uses the resolved runtime URLs for every local server", () => {
    process.env[LOCAL_E2E_ENV_KEYS.host] = "127.0.0.1";
    process.env[LOCAL_E2E_ENV_KEYS.apiPort] = "19087";
    process.env[LOCAL_E2E_ENV_KEYS.marketingApiPort] = "19088";
    process.env[LOCAL_E2E_ENV_KEYS.appPort] = "19000";
    process.env[LOCAL_E2E_ENV_KEYS.webPort] = "19432";
    process.env[LOCAL_E2E_ENV_KEYS.dbPort] = "19444";
    process.env[LOCAL_E2E_ENV_KEYS.dbContainerName] = "kaiplan-e2e-db-test";

    const runtime = readLocalE2ERuntime();
    const servers = buildLocalPlaywrightWebServers(runtime);

    expect(runtime.urls.marketingApi).toBe("http://127.0.0.1:19088");
    expect(servers.map((server) => server.url)).toEqual([
      "http://127.0.0.1:19088/api/health",
      "http://127.0.0.1:19087/api/health",
      "http://127.0.0.1:19432",
      "http://127.0.0.1:19000/login",
    ]);
  });

  it("boots the standalone marketing api server and exposes it to the web app", () => {
    process.env[LOCAL_E2E_ENV_KEYS.host] = "127.0.0.1";
    process.env[LOCAL_E2E_ENV_KEYS.apiPort] = "29087";
    process.env[LOCAL_E2E_ENV_KEYS.marketingApiPort] = "29088";
    process.env[LOCAL_E2E_ENV_KEYS.appPort] = "29000";
    process.env[LOCAL_E2E_ENV_KEYS.webPort] = "29432";
    process.env[LOCAL_E2E_ENV_KEYS.dbPort] = "29444";
    process.env[LOCAL_E2E_ENV_KEYS.dbContainerName] = "kaiplan-e2e-db-app";

    const runtime = readLocalE2ERuntime();
    const servers = buildLocalPlaywrightWebServers(runtime);
    const marketingServer = servers.find((server) =>
      server.url.endsWith(":29088/api/health"),
    );
    const apiServer = servers.find((server) =>
      server.url.endsWith(":29087/api/health"),
    );
    const webServer = servers.find((server) => server.url === runtime.urls.web);
    const appServer = servers.find((server) =>
      server.url.endsWith(":29000/login"),
    );

    expect(marketingServer).toBeDefined();
    expect(marketingServer?.command).toBe(
      buildGuardedLocalServiceCommand({
        label: "marketing-api",
        port: "29088",
        match: "serve-local-marketing-api.ts",
        command: `pnpm exec tsx "${path.join(
          SCRIPTS_DIR,
          "serve-local-marketing-api.ts",
        )}"`,
      }),
    );
    expect(marketingServer?.env).toMatchObject({
      PORT: "29088",
      ALLOWED_ORIGIN: runtime.urls.web,
      PRODUCT_DOMAIN: new URL(runtime.urls.web).host,
    });
    expect(marketingServer?.reuseExistingServer).toBe(false);
    expect(apiServer?.command).toBe(
      buildGuardedLocalServiceCommand({
        label: "api",
        port: "29087",
        match: "prepare-and-serve-local-api.ts",
        command: `pnpm exec tsx "${path.join(
          SCRIPTS_DIR,
          "prepare-and-serve-local-api.ts",
        )}"`,
      }),
    );
    expect(apiServer?.reuseExistingServer).toBe(false);
    expect(webServer?.env).toMatchObject({
      PUBLIC_DISABLE_ANALYTICS: "true",
      PUBLIC_DISABLE_REMOTE_FONTS: "true",
      PUBLIC_TURNSTILE_SITE_KEY: "",
      PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
      PUBLIC_API_URL: runtime.urls.api,
      PUBLIC_APP_ORIGIN: runtime.urls.app,
      PUBLIC_MARKETING_API_URL: runtime.urls.marketingApi,
    });
    expect(webServer?.reuseExistingServer).toBe(false);
    expect(webServer?.command).toContain("--repo-root");
    expect(webServer?.command).toContain(process.cwd());
    expect(webServer?.command).toContain(
      "pnpm --filter @kaiplan/web run build && pnpm --filter @kaiplan/web exec astro preview --host 127.0.0.1 --port 29432 --strictPort",
    );
    expect(appServer?.command).toBe(
      buildGuardedLocalServiceCommand({
        label: "app",
        port: "29000",
        match: "vite.js",
        command:
          "pnpm --filter @kaiplan/app exec vite --host 127.0.0.1 --port 29000 --strictPort",
      }),
    );
    expect(appServer?.env).toMatchObject({
      VITE_DISABLE_REMOTE_FONTS: "true",
    });
    expect(appServer?.reuseExistingServer).toBe(false);
  });

  it("does not reuse guarded backend services so stale responders cannot skip startup cleanup", () => {
    const servers = buildLocalPlaywrightWebServers(readLocalE2ERuntime());

    expect(
      servers
        .filter((server) =>
          server.command.includes("guard-local-service.ts"),
        )
        .map((server) => [server.url, server.reuseExistingServer]),
    ).toEqual([
      ["http://127.0.0.1:5031/api/health", false],
      ["http://127.0.0.1:5030/api/health", false],
      ["http://127.0.0.1:3031", false],
      ["http://127.0.0.1:3030/login", false],
    ]);
  });
});

describe("buildLocalDbConfig", () => {
  it("returns a deterministic dockerized postgres configuration for local e2e", () => {
    const config = buildLocalDbConfig(readLocalE2ERuntime());

    expect(config).toMatchObject({
      containerName: DEFAULT_LOCAL_E2E_RUNTIME.db.containerName,
      database: "kaiplan_e2e",
      username: "postgres",
      password: "postgres",
      host: "127.0.0.1",
      port: DEFAULT_LOCAL_E2E_RUNTIME.db.port,
    });
    expect(config.connectionString).toBe(
      DEFAULT_LOCAL_E2E_RUNTIME.db.connectionString,
    );
  });

  it("reads port and container overrides from the local e2e environment", () => {
    process.env[LOCAL_E2E_ENV_KEYS.host] = "127.0.0.1";
    process.env[LOCAL_E2E_ENV_KEYS.apiPort] = "49087";
    process.env[LOCAL_E2E_ENV_KEYS.marketingApiPort] = "49088";
    process.env[LOCAL_E2E_ENV_KEYS.appPort] = "49000";
    process.env[LOCAL_E2E_ENV_KEYS.webPort] = "49432";
    process.env[LOCAL_E2E_ENV_KEYS.dbPort] = "49444";
    process.env[LOCAL_E2E_ENV_KEYS.dbContainerName] = "kaiplan-e2e-db-env";

    const runtime = readLocalE2ERuntime();
    const config = buildLocalDbConfig(runtime);

    expect(config).toMatchObject({
      containerName: "kaiplan-e2e-db-env",
      port: 49444,
      connectionString:
        "postgres://postgres:postgres@127.0.0.1:49444/kaiplan_e2e",
    });
    expect(runtime.urls.marketingApi).toBe("http://127.0.0.1:49088");
  });
});

describe("ensureLocalE2ERuntime", () => {
  it("persists the resolved runtime to the repo-local cache and reuses it after module reload", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kaiplan-e2e-"));
    const previousCwd = process.cwd();

    restoreLocalE2EEnv();
    vi.resetModules();
    process.chdir(tempRoot);
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: 0,
        stdout: "",
        stderr: "",
      })),
    }));

    try {
      const module = await import("./local-e2e-config");
      const firstRuntime = await module.ensureLocalE2ERuntime();
      const runtimeFile = path.join(tempRoot, ".local-e2e", "runtime.json");

      expect(fs.existsSync(runtimeFile)).toBe(true);
      expect(JSON.parse(fs.readFileSync(runtimeFile, "utf8"))).toMatchObject({
        host: firstRuntime.host,
        urls: firstRuntime.urls,
        db: {
          containerName: firstRuntime.db.containerName,
          port: firstRuntime.db.port,
          connectionString: firstRuntime.db.connectionString,
        },
      });

      restoreLocalE2EEnv();
      vi.resetModules();

      const reloadedModule = await import("./local-e2e-config");
      const reloadedRuntime = await reloadedModule.ensureLocalE2ERuntime();

      expect(reloadedRuntime).toEqual(firstRuntime);
    } finally {
      process.chdir(previousCwd);
      vi.doUnmock("node:child_process");
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reconciles a cached runtime when the persisted db port is no longer available", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kaiplan-e2e-"));
    const previousCwd = process.cwd();
    const listener = createServer();

    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );

    try {
      const address = listener.address();
      if (!address || typeof address !== "object") {
        throw new Error("Could not bind a test port.");
      }

      const occupiedPort = address.port;

      restoreLocalE2EEnv();
      vi.resetModules();
      process.chdir(tempRoot);
      fs.mkdirSync(path.join(tempRoot, ".local-e2e"), { recursive: true });
      fs.writeFileSync(
        path.join(tempRoot, ".local-e2e", "runtime.json"),
        JSON.stringify({
          ...DEFAULT_LOCAL_E2E_RUNTIME,
          db: {
            ...DEFAULT_LOCAL_E2E_RUNTIME.db,
            port: occupiedPort,
            connectionString: `postgres://postgres:postgres@127.0.0.1:${occupiedPort}/kaiplan_e2e`,
          },
        }),
      );
      vi.doMock("node:child_process", () => ({
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: `exited|0.0.0.0:${occupiedPort}->5432/tcp`,
          stderr: "",
        })),
      }));

      const module = await import("./local-e2e-config");
      const runtime = await module.ensureLocalE2ERuntime();

      expect(runtime.db.port).not.toBe(occupiedPort);
      expect(runtime.db.connectionString).not.toBe(
        `postgres://postgres:postgres@127.0.0.1:${occupiedPort}/kaiplan_e2e`,
      );
    } finally {
      process.chdir(previousCwd);
      vi.doUnmock("node:child_process");
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      );
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps using the already-running shared db port even though that port is occupied", async () => {
    restoreLocalE2EEnv();
    vi.resetModules();

    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );

    try {
      const address = listener.address();
      if (!address || typeof address !== "object") {
        throw new Error("Could not bind a test port.");
      }

      const occupiedPort = address.port;

      vi.doMock("node:child_process", () => ({
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: `running|0.0.0.0:${occupiedPort}->5432/tcp`,
          stderr: "",
        })),
      }));

      const module = await import("./local-e2e-config");
      const runtime = await module.ensureLocalE2ERuntime();

      expect(runtime.db.port).toBe(occupiedPort);
      expect(runtime.db.connectionString).toBe(
        `postgres://postgres:postgres@127.0.0.1:${occupiedPort}/kaiplan_e2e`,
      );

      const childProcess = await import("node:child_process");
      expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledWith(
        "docker",
        [
          "ps",
          "-a",
          "--filter",
          "name=^/kaiplan-e2e-db$",
          "--format",
          "{{.State}}|{{.Ports}}",
        ],
        {
          encoding: "utf8",
          stdio: "pipe",
          timeout: 5_000,
        },
      );
    } finally {
      vi.doUnmock("node:child_process");
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("reuses the shared db port from an existing stopped container", async () => {
    restoreLocalE2EEnv();
    vi.resetModules();

    const availablePort = await getAvailablePort();

    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: 0,
        stdout: `exited|0.0.0.0:${availablePort}->5432/tcp`,
        stderr: "",
      })),
    }));

    try {
      const module = await import("./local-e2e-config");
      const runtime = await module.ensureLocalE2ERuntime();

      expect(runtime.db.port).toBe(availablePort);
      expect(runtime.db.connectionString).toBe(
        `postgres://postgres:postgres@127.0.0.1:${availablePort}/kaiplan_e2e`,
      );
    } finally {
      vi.doUnmock("node:child_process");
    }
  });

  it("falls back to a free db port when a stopped container's mapped port is already occupied", async () => {
    restoreLocalE2EEnv();
    vi.resetModules();

    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );

    try {
      const address = listener.address();
      if (!address || typeof address !== "object") {
        throw new Error("Could not bind a test port.");
      }

      const occupiedPort = address.port;

      vi.doMock("node:child_process", () => ({
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: `exited|0.0.0.0:${occupiedPort}->5432/tcp`,
          stderr: "",
        })),
      }));

      const module = await import("./local-e2e-config");
      const runtime = await module.ensureLocalE2ERuntime();

      expect(runtime.db.port).not.toBe(occupiedPort);
      expect(runtime.db.connectionString).not.toBe(
        `postgres://postgres:postgres@127.0.0.1:${occupiedPort}/kaiplan_e2e`,
      );
    } finally {
      vi.doUnmock("node:child_process");
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("avoids ports that are already occupied on the configured host", async () => {
    restoreLocalE2EEnv();
    vi.resetModules();

    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );

    try {
      const address = listener.address();
      if (!address || typeof address !== "object") {
        throw new Error("Could not bind a test port.");
      }

      process.env[LOCAL_E2E_ENV_KEYS.host] = "127.0.0.1";
      process.env[LOCAL_E2E_ENV_KEYS.webPort] = String(address.port);

      vi.doMock("node:child_process", () => ({
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: "",
          stderr: "",
        })),
      }));

      const module = await import("./local-e2e-config");
      const runtime = await module.ensureLocalE2ERuntime();

      expect(runtime.urls.web).not.toBe(`http://127.0.0.1:${address.port}`);
    } finally {
      vi.doUnmock("node:child_process");
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("fails fast when docker container lookup times out", async () => {
    restoreLocalE2EEnv();
    vi.resetModules();

    const availablePort = await getAvailablePort();
    process.env[LOCAL_E2E_ENV_KEYS.dbPort] = String(availablePort);

    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("Docker probe timed out."), {
          code: "ETIMEDOUT",
        }),
      })),
    }));

    try {
      const module = await import("./local-e2e-config");

      await expect(module.ensureLocalE2ERuntime()).rejects.toThrow(
        "docker ps -a --filter name=^/kaiplan-e2e-db$ --format {{.State}}|{{.Ports}} timed out after 5000ms",
      );
    } finally {
      vi.doUnmock("node:child_process");
    }
  });

  it("reports non-timeout docker container lookup signals distinctly", async () => {
    restoreLocalE2EEnv();
    vi.resetModules();

    const availablePort = await getAvailablePort();
    process.env[LOCAL_E2E_ENV_KEYS.dbPort] = String(availablePort);

    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
      })),
    }));

    try {
      const module = await import("./local-e2e-config");

      await expect(module.ensureLocalE2ERuntime()).rejects.toThrow(
        "docker ps -a --filter name=^/kaiplan-e2e-db$ --format {{.State}}|{{.Ports}} exited after signal SIGTERM.",
      );
    } finally {
      vi.doUnmock("node:child_process");
    }
  });
});
