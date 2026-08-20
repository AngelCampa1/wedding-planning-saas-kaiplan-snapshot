import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { ApiEnv } from "../app";
import { handleSurveyReminder } from "./survey-reminder";
import { captureMarketingApiException } from "../services/sentry";

/** Environment shape the shared scheduled() handler expects. */
export type ScheduledEnv = ApiEnv;

export interface RunScheduledTasksOptions {
  /**
   * Pre-built Drizzle client. Optional override used by integration tests
   * where the D1 binding is not available; production call sites omit this
   * and let the handler wrap `env.DB`.
   */
  db?: DrizzleD1Database;
}

/**
 * Cron-driven entry for recurring marketing-api jobs.
 *
 * When the caller has not bound `DB` (and no override was provided), the
 * function logs and returns early because survey reminders require D1 access.
 */
export async function runScheduledTasks(
  env: ScheduledEnv,
  options: RunScheduledTasksOptions = {},
): Promise<void> {
  const db = options.db ?? (env.DB ? drizzle(env.DB) : undefined);
  if (!db) {
    console.error("[scheduled] DB binding missing - skipping cron dispatch");
    return;
  }

  const reminderResult = await Promise.resolve(handleSurveyReminder(db, env))
    .then(() => ({ status: "fulfilled" as const }))
    .catch((reason: unknown) => ({ status: "rejected" as const, reason }));

  if (reminderResult.status === "rejected") {
    console.error("[scheduled] survey reminder failed", reminderResult.reason);
    captureMarketingApiException(reminderResult.reason, {
      source: "scheduled-survey-reminder",
    });
  }
}
