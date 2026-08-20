import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildLocalDbConfig, type LocalDbConfig } from "./local-e2e-config";
import {
  LOCAL_E2E_DEFAULT_PAID_PLAN,
  LOCAL_E2E_STRIPE_PRICE_IDS,
  LOCAL_E2E_TRIAL_DURATION_SQL_INTERVAL,
} from "./local-e2e-billing-fixtures";

const POSTGRES_IMAGE = "postgres:16-alpine";
const DOCKER_PROBE_TIMEOUT_MS = 5_000;
const DOCKER_LIFECYCLE_TIMEOUT_MS = 120_000;
const LOCAL_E2E_DB_CONTAINER_NAME_PATTERNS = [
  /^kaiplan-e2e-db(?:[-_].+)?$/,
  /^kaiplan_e2e(?:[-_].+)?$/,
];

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isDockerTimeout(result: ReturnType<typeof spawnSync>) {
  return (
    result.error !== undefined &&
    typeof result.error === "object" &&
    "code" in result.error &&
    result.error.code === "ETIMEDOUT"
  );
}

function runDocker(
  args: string[],
  options: { stdio?: "inherit" | "pipe"; timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? DOCKER_PROBE_TIMEOUT_MS;
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    timeout: timeoutMs,
  });

  if (isDockerTimeout(result)) {
    throw new Error(
      `docker ${args.join(" ")} timed out after ${timeoutMs}ms. Is Docker Desktop running and responsive?`,
    );
  }

  if (result.signal) {
    throw new Error(
      `docker ${args.join(" ")} exited after signal ${result.signal}.`,
    );
  }

  if (result.error) {
    throw new Error(
      `docker ${args.join(" ")} failed to start: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const stderr =
      typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(
      `docker ${args.join(" ")} failed${stderr ? `: ${stderr}` : "."}`,
    );
  }

  return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

function hasContainer(config: LocalDbConfig) {
  const output = runDocker([
    "ps",
    "-a",
    "--filter",
    `name=^/${config.containerName}$`,
    "--format",
    "{{.Names}}",
  ]);

  return output === config.containerName;
}

function isContainerRunning(config: LocalDbConfig) {
  const output = runDocker([
    "ps",
    "--filter",
    `name=^/${config.containerName}$`,
    "--format",
    "{{.Names}}",
  ]);

  return output === config.containerName;
}

function readContainerPort(config: LocalDbConfig) {
  const output = runDocker([
    "ps",
    "-a",
    "--filter",
    `name=^/${config.containerName}$`,
    "--format",
    "{{.Ports}}",
  ]);

  const match = output.match(/:(\d+)->5432\/tcp/);
  return match ? Number(match[1]) : null;
}

export function isStaleLocalE2EDbContainerName(
  name: string,
  currentContainerName: string,
) {
  return (
    name !== currentContainerName &&
    LOCAL_E2E_DB_CONTAINER_NAME_PATTERNS.some((pattern) => pattern.test(name))
  );
}

function listStaleStoppedLocalDbContainers(config: LocalDbConfig) {
  const output = runDocker(["ps", "-a", "--format", "{{.Names}}|{{.State}}"]);

  return output
    .split(/\r?\n/)
    .map((line) => {
      const [name = "", state = ""] = line.split("|", 2);
      return { name, state };
    })
    .filter(
      ({ name, state }) =>
        state !== "running" &&
        isStaleLocalE2EDbContainerName(name, config.containerName),
    )
    .map(({ name }) => name);
}

function removeStaleStoppedLocalDbContainers(config: LocalDbConfig) {
  const staleContainers = listStaleStoppedLocalDbContainers(config);

  if (staleContainers.length === 0) {
    return;
  }

  runDocker(["rm", "-f", "-v", ...staleContainers], {
    stdio: "inherit",
    timeoutMs: DOCKER_LIFECYCLE_TIMEOUT_MS,
  });
}

export function shouldRecreateStoppedLocalDbContainer(options: {
  desiredPort: number;
  mappedPort: number | null;
}) {
  return options.mappedPort !== options.desiredPort;
}

export function buildDockerRunCommand(config: LocalDbConfig) {
  return [
    "docker run -d",
    "--rm",
    `--name ${config.containerName}`,
    `-e POSTGRES_DB=${config.database}`,
    `-e POSTGRES_USER=${config.username}`,
    `-e POSTGRES_PASSWORD=${config.password}`,
    `-p ${config.port}:5432`,
    POSTGRES_IMAGE,
  ].join(" ");
}

export function buildDockerReadyCheckCommand(config: LocalDbConfig) {
  return [
    `docker exec ${config.containerName}`,
    "psql",
    `-U ${config.username}`,
    `-d ${config.database}`,
    '-c "select 1;"',
  ].join(" ");
}

export function buildGrantPaidPlanSql(userId: string) {
  const escapedUserId = userId.replace(/'/g, "''");
  const plan = LOCAL_E2E_DEFAULT_PAID_PLAN;
  const priceId = LOCAL_E2E_STRIPE_PRICE_IDS[plan].month;

  return `
insert into "subscription" (
  "user_id",
  "stripe_customer_id",
  "stripe_price_id",
  "plan",
  "status",
  "current_period_end",
  "created_at",
  "updated_at"
)
values (
  '${escapedUserId}',
  'cus_local_e2e',
  '${priceId}',
  '${plan}',
  'active',
  now() + interval '${LOCAL_E2E_TRIAL_DURATION_SQL_INTERVAL}',
  now(),
  now()
)
on conflict ("user_id") do update
set
  "stripe_customer_id" = excluded."stripe_customer_id",
  "stripe_price_id" = excluded."stripe_price_id",
  "plan" = excluded."plan",
  "status" = excluded."status",
  "current_period_end" = excluded."current_period_end",
  "updated_at" = now();
`.trim();
}

export function waitForLocalDb(
  config: LocalDbConfig = buildLocalDbConfig(),
  timeoutMs = 60_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = spawnSync(
      "docker",
      [
        "exec",
        config.containerName,
        "psql",
        "-U",
        config.username,
        "-d",
        config.database,
        "-c",
        "select 1;",
      ],
      {
        stdio: "ignore",
        timeout: DOCKER_PROBE_TIMEOUT_MS,
      },
    );

    if (isDockerTimeout(result)) {
      throw new Error(
        `docker exec ${config.containerName} psql timed out after ${DOCKER_PROBE_TIMEOUT_MS}ms. Is Docker Desktop running and responsive?`,
      );
    }

    if (result.signal) {
      throw new Error(
        `docker exec ${config.containerName} psql exited after signal ${result.signal}.`,
      );
    }

    if (result.error) {
      throw new Error(
        `docker exec ${config.containerName} psql failed to start: ${result.error.message}`,
      );
    }

    if (result.status === 0) {
      sleep(1_000);
      return;
    }

    sleep(250);
  }

  throw new Error(
    `Timed out waiting for local Postgres container ${config.containerName}.`,
  );
}

export function startLocalDb(config: LocalDbConfig = buildLocalDbConfig()) {
  const containerExists = hasContainer(config);
  removeStaleStoppedLocalDbContainers(config);

  if (!containerExists) {
    runDocker(
      [
        "run",
        "-d",
        "--rm",
        "--name",
        config.containerName,
        "-e",
        `POSTGRES_DB=${config.database}`,
        "-e",
        `POSTGRES_USER=${config.username}`,
        "-e",
        `POSTGRES_PASSWORD=${config.password}`,
        "-p",
        `${config.port}:5432`,
        POSTGRES_IMAGE,
      ],
      { stdio: "inherit", timeoutMs: DOCKER_LIFECYCLE_TIMEOUT_MS },
    );
  } else if (!isContainerRunning(config)) {
    const mappedPort = readContainerPort(config);

    if (
      shouldRecreateStoppedLocalDbContainer({
        desiredPort: config.port,
        mappedPort,
      })
    ) {
      runDocker(["rm", "-f", "-v", config.containerName], {
        stdio: "inherit",
        timeoutMs: DOCKER_LIFECYCLE_TIMEOUT_MS,
      });
      runDocker(
        [
          "run",
          "-d",
          "--rm",
          "--name",
          config.containerName,
          "-e",
          `POSTGRES_DB=${config.database}`,
          "-e",
          `POSTGRES_USER=${config.username}`,
          "-e",
          `POSTGRES_PASSWORD=${config.password}`,
          "-p",
          `${config.port}:5432`,
          POSTGRES_IMAGE,
        ],
        { stdio: "inherit", timeoutMs: DOCKER_LIFECYCLE_TIMEOUT_MS },
      );
    } else {
      runDocker(["start", config.containerName], {
        stdio: "inherit",
        timeoutMs: DOCKER_LIFECYCLE_TIMEOUT_MS,
      });
    }
  }

  waitForLocalDb(config);
}

export function stopLocalDb(config: LocalDbConfig = buildLocalDbConfig()) {
  if (!hasContainer(config)) {
    removeStaleStoppedLocalDbContainers(config);
    return;
  }

  runDocker(["rm", "-f", "-v", config.containerName], {
    stdio: "inherit",
    timeoutMs: DOCKER_LIFECYCLE_TIMEOUT_MS,
  });
  removeStaleStoppedLocalDbContainers(config);
}

export function resetLocalDb(config: LocalDbConfig = buildLocalDbConfig()) {
  stopLocalDb(config);
  startLocalDb(config);
}

export function runPsqlCommand(
  sql: string,
  config: LocalDbConfig = buildLocalDbConfig(),
) {
  runDocker(
    [
      "exec",
      "-i",
      config.containerName,
      "psql",
      "-U",
      config.username,
      "-d",
      config.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { stdio: "inherit" },
  );
}

export function runPsqlQuery(
  sql: string,
  config: LocalDbConfig = buildLocalDbConfig(),
) {
  return runDocker([
    "exec",
    "-i",
    config.containerName,
    "psql",
    "-U",
    config.username,
    "-d",
    config.database,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    sql,
  ]);
}

export function runApiCommand(
  args: string[],
  config: LocalDbConfig = buildLocalDbConfig(),
) {
  const command = ["pnpm", ...args].join(" ");
  const result = spawnSync(command, {
    cwd: process.cwd(),
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: config.connectionString,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 1}.`);
  }
}

function main() {
  const action = process.argv[2] ?? "start";
  const config = buildLocalDbConfig();

  switch (action) {
    case "connection-string":
      console.log(config.connectionString);
      return;
    case "start":
      startLocalDb(config);
      return;
    case "reset":
      resetLocalDb(config);
      return;
    case "stop":
      stopLocalDb(config);
      return;
    default:
      throw new Error(
        `Unknown action "${action}". Expected start, reset, stop, or connection-string.`,
      );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
