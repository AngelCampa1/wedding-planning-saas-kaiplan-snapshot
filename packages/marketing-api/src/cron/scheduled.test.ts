import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMarketingApiExceptionMock = vi.fn();

vi.mock("../services/sentry", () => ({
  captureMarketingApiException: (error: unknown, tags?: unknown) =>
    captureMarketingApiExceptionMock(error, tags),
}));

import { runScheduledTasks, type ScheduledEnv } from "./scheduled";
import { makeDb, makeLocalEnv } from "../integration/setup";

function makeEnv(overrides: Partial<ScheduledEnv> = {}): ScheduledEnv {
  return {
    ...makeLocalEnv(),
    ...overrides,
  };
}

describe("runScheduledTasks", () => {
  beforeEach(() => {
    captureMarketingApiExceptionMock.mockClear();
  });

  it("returns early and logs when DB binding is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const env = makeEnv();
      env.DB = null as unknown as D1Database;
      await runScheduledTasks(env);
      expect(errorSpy).toHaveBeenCalledWith(
        "[scheduled] DB binding missing - skipping cron dispatch",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("runs survey reminder when DB override is provided", async () => {
    const db = await makeDb();
    const env = makeEnv();
    await expect(
      runScheduledTasks(env, {
        db: db as unknown as import("../app").DrizzleD1Database,
      }),
    ).resolves.toBeUndefined();
  });

  it("logs rejected jobs without rethrowing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = await makeDb();
    try {
      const env = makeEnv();
      await runScheduledTasks(env, {
        db: db as unknown as import("../app").DrizzleD1Database,
      });
      expect(true).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("captures rejected scheduled jobs in Sentry", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("survey reminder exploded");
    try {
      const env = makeEnv();
      await runScheduledTasks(env, {
        db: {
          select: () => {
            throw error;
          },
        } as unknown as import("../app").DrizzleD1Database,
      });

      expect(captureMarketingApiExceptionMock).toHaveBeenCalledWith(
        error,
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("logs and captures when the reminder job rejects", async () => {
    vi.resetModules();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("survey reminder exploded");

    vi.doMock("./survey-reminder", () => ({
      handleSurveyReminder: vi.fn().mockRejectedValue(error),
    }));

    try {
      const { runScheduledTasks: runScheduledTasksWithMock } = await import(
        "./scheduled"
      );

      await runScheduledTasksWithMock(makeEnv(), {
        db: {} as import("../app").DrizzleD1Database,
      });

      expect(errorSpy).toHaveBeenCalledWith(
        "[scheduled] survey reminder failed",
        error,
      );
      expect(captureMarketingApiExceptionMock).toHaveBeenCalledWith(error, {
        source: "scheduled-survey-reminder",
      });
    } finally {
      vi.doUnmock("./survey-reminder");
      vi.resetModules();
      errorSpy.mockRestore();
    }
  });
});
