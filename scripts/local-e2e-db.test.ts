import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCAL_E2E_RUNTIME } from "./local-e2e-config";
import {
  buildDockerReadyCheckCommand,
  buildDockerRunCommand,
  buildGrantPaidPlanSql,
  isStaleLocalE2EDbContainerName,
  shouldRecreateStoppedLocalDbContainer,
} from "./local-e2e-db";

afterEach(() => {
  vi.doUnmock("node:child_process");
  vi.resetModules();
});

describe("buildDockerRunCommand", () => {
  it("starts a deterministic postgres container for local e2e", () => {
    const command = buildDockerRunCommand(DEFAULT_LOCAL_E2E_RUNTIME.db);

    expect(command).toContain("docker run");
    expect(command).toContain("--rm");
    expect(command).toContain("--name kaiplan-e2e-db");
    expect(command).toContain("-e POSTGRES_DB=kaiplan_e2e");
    expect(command).toContain("-e POSTGRES_USER=postgres");
    expect(command).toContain("-e POSTGRES_PASSWORD=postgres");
    expect(command).toContain("-p 55432:5432");
    expect(command).toContain("postgres:16-alpine");
  });
});

describe("buildDockerReadyCheckCommand", () => {
  it("waits until the configured database can answer a real query", () => {
    const command = buildDockerReadyCheckCommand(DEFAULT_LOCAL_E2E_RUNTIME.db);

    expect(command).toContain("docker exec kaiplan-e2e-db");
    expect(command).toContain("psql");
    expect(command).toContain("-U postgres");
    expect(command).toContain("-d kaiplan_e2e");
    expect(command).toContain('-c "select 1;"');
  });
});

describe("buildGrantPaidPlanSql", () => {
  it("upserts active paid access for the local e2e user", () => {
    const sql = buildGrantPaidPlanSql("user-123");

    expect(sql).toContain('insert into "subscription"');
    expect(sql).toContain("'user-123'");
    expect(sql).toContain("'pro'");
    expect(sql).toContain("'active'");
    expect(sql).toContain("on conflict");
  });

  it("quote-doubles user ids before building SQL literals", () => {
    const sql = buildGrantPaidPlanSql("user'123");

    expect(sql).toContain("'user''123'");
    expect(sql).not.toContain("'user'123'");
  });
});

describe("isStaleLocalE2EDbContainerName", () => {
  it("matches old Kaiplan E2E DB names while preserving the current container", () => {
    expect(
      isStaleLocalE2EDbContainerName(
        "kaiplan-e2e-db-0993c7337d25",
        "kaiplan-e2e-db",
      ),
    ).toBe(true);
    expect(
      isStaleLocalE2EDbContainerName(
        "kaiplan_e2e_codex_smoke",
        "kaiplan-e2e-db",
      ),
    ).toBe(true);
    expect(
      isStaleLocalE2EDbContainerName("kaiplan-e2e-db", "kaiplan-e2e-db"),
    ).toBe(false);
    expect(
      isStaleLocalE2EDbContainerName("unrelated-postgres", "kaiplan-e2e-db"),
    ).toBe(false);
  });
});

describe("shouldRecreateStoppedLocalDbContainer", () => {
  it("recreates a stopped container when the desired mapped port changed", () => {
    expect(
      shouldRecreateStoppedLocalDbContainer({
        desiredPort: 55432,
        mappedPort: 55439,
      }),
    ).toBe(true);
  });

  it("keeps a stopped container when it already uses the desired mapped port", () => {
    expect(
      shouldRecreateStoppedLocalDbContainer({
        desiredPort: 55432,
        mappedPort: 55432,
      }),
    ).toBe(false);
  });
});

describe("startLocalDb", () => {
  it("fails fast with a clear error when docker container lookup times out", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("Docker timed out."), {
          code: "ETIMEDOUT",
        }),
      })),
    }));

    const module = await import("./local-e2e-db");

    expect(() => module.startLocalDb(DEFAULT_LOCAL_E2E_RUNTIME.db)).toThrow(
      "docker ps -a --filter name=^/kaiplan-e2e-db$ --format {{.Names}} timed out after 5000ms",
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
        "{{.Names}}",
      ],
      {
        encoding: "utf8",
        stdio: "pipe",
        timeout: 5_000,
      },
    );
  });

  it("reports non-timeout docker lookup signals distinctly", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
      })),
    }));

    const module = await import("./local-e2e-db");

    expect(() => module.startLocalDb(DEFAULT_LOCAL_E2E_RUNTIME.db)).toThrow(
      "docker ps -a --filter name=^/kaiplan-e2e-db$ --format {{.Names}} exited after signal SIGTERM.",
    );
  });

  it("allows docker run enough time to pull and start the Postgres image", async () => {
    vi.resetModules();
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
      });
    vi.doMock("node:child_process", () => ({
      spawnSync,
    }));

    const module = await import("./local-e2e-db");
    module.startLocalDb(DEFAULT_LOCAL_E2E_RUNTIME.db);

    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      "docker",
      [
        "run",
        "-d",
        "--rm",
        "--name",
        "kaiplan-e2e-db",
        "-e",
        "POSTGRES_DB=kaiplan_e2e",
        "-e",
        "POSTGRES_USER=postgres",
        "-e",
        "POSTGRES_PASSWORD=postgres",
        "-p",
        "55432:5432",
        "postgres:16-alpine",
      ],
      {
        encoding: "utf8",
        stdio: "inherit",
        timeout: 120_000,
      },
    );
  });

  it("removes stopped Kaiplan E2E DB containers from older runs before starting", async () => {
    vi.resetModules();
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        stdout: [
          "kaiplan-e2e-db-0993c7337d25|exited",
          "kaiplan_e2e_codex_smoke|created",
          "kaiplan_e2e_active|running",
          "unrelated-postgres|exited",
        ].join("\n"),
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
      });
    vi.doMock("node:child_process", () => ({
      spawnSync,
    }));

    const module = await import("./local-e2e-db");
    module.startLocalDb(DEFAULT_LOCAL_E2E_RUNTIME.db);

    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      "docker",
      [
        "rm",
        "-f",
        "-v",
        "kaiplan-e2e-db-0993c7337d25",
        "kaiplan_e2e_codex_smoke",
      ],
      {
        encoding: "utf8",
        stdio: "inherit",
        timeout: 120_000,
      },
    );
  });
});

describe("waitForLocalDb", () => {
  it("uses a timeout for each docker readiness probe", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: 0,
        stdout: "",
        stderr: "",
      })),
    }));

    const module = await import("./local-e2e-db");
    module.waitForLocalDb(DEFAULT_LOCAL_E2E_RUNTIME.db);

    const childProcess = await import("node:child_process");
    expect(vi.mocked(childProcess.spawnSync)).toHaveBeenCalledWith(
      "docker",
      [
        "exec",
        "kaiplan-e2e-db",
        "psql",
        "-U",
        "postgres",
        "-d",
        "kaiplan_e2e",
        "-c",
        "select 1;",
      ],
      {
        stdio: "ignore",
        timeout: 5_000,
      },
    );
  });

  it("reports non-timeout docker readiness signals distinctly", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: null,
        signal: "SIGINT",
        stdout: "",
        stderr: "",
      })),
    }));

    const module = await import("./local-e2e-db");

    expect(() => module.waitForLocalDb(DEFAULT_LOCAL_E2E_RUNTIME.db)).toThrow(
      "docker exec kaiplan-e2e-db psql exited after signal SIGINT.",
    );
  });
});

describe("runPsqlQuery", () => {
  it("executes local psql queries with a docker timeout and returns trimmed output", async () => {
    vi.resetModules();
    const spawnSync = vi.fn(() => ({
      status: 0,
      signal: null,
      stdout: "user-123\n",
      stderr: "",
    }));
    vi.doMock("node:child_process", () => ({
      spawnSync,
    }));

    const module = await import("./local-e2e-db");
    expect(module.runPsqlQuery("select 1;", DEFAULT_LOCAL_E2E_RUNTIME.db)).toBe(
      "user-123",
    );

    expect(spawnSync).toHaveBeenCalledWith(
      "docker",
      [
        "exec",
        "-i",
        "kaiplan-e2e-db",
        "psql",
        "-U",
        "postgres",
        "-d",
        "kaiplan_e2e",
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-c",
        "select 1;",
      ],
      {
        encoding: "utf8",
        stdio: "pipe",
        timeout: 5_000,
      },
    );
  });
});
