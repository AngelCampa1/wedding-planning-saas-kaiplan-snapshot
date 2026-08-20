import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { signups, surveyResponses } from "../db/schema";
import type { DrizzleD1Database } from "../app";
import { captureMarketingApiException } from "../services/sentry";

const MAX_SURVEY_ANSWERS = 20;

type SurveyWriteDb = Pick<DrizzleD1Database, "insert" | "update">;
class SurveyAlreadyCompletedError extends Error {}

type SurveyAnswer = { questionId: string; answer: string };
const SURVEY_TRANSACTION_LOCK_RETRIES = 3;

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isSqliteLockError(err: unknown): boolean {
  const lower = getErrorMessage(err).toLowerCase();
  return lower.includes("sqlite_busy") || lower.includes("database is locked");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSurveyAnswers(answers: unknown[]): SurveyAnswer[] {
  return (answers as Array<{ questionId: string; answer: string }>).map(
    (answer) => ({
      questionId: answer.questionId.trim(),
      answer: answer.answer.trim(),
    }),
  );
}

async function isSurveyCompleted(
  db: DrizzleD1Database,
  signupId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ surveyCompleted: signups.surveyCompleted })
    .from(signups)
    .where(eq(signups.id, signupId));

  return row?.surveyCompleted === 1;
}

async function claimSurveyCompletion(
  tx: SurveyWriteDb,
  signupId: number,
): Promise<void> {
  const claimQuery = tx
    .update(signups)
    .set({ surveyCompleted: 1 })
    .where(and(eq(signups.id, signupId), eq(signups.surveyCompleted, 0)));

  if (
    typeof (claimQuery as { returning?: unknown }).returning === "function"
  ) {
    const claimedRows = (await (
      claimQuery as {
        returning: (shape: { id: typeof signups.id }) => Promise<unknown[]>;
      }
    ).returning({ id: signups.id })) as unknown[];

    if (claimedRows.length === 0) {
      throw new SurveyAlreadyCompletedError();
    }
    return;
  }

  await claimQuery;
}

async function submitSurveyResponses(
  db: DrizzleD1Database,
  signup: { id: number; email: string },
  answers: SurveyAnswer[],
  createdAt: string,
): Promise<void> {
  const writeSurvey = async (tx: SurveyWriteDb) => {
    await claimSurveyCompletion(tx, signup.id);

    await tx.insert(surveyResponses).values(
      answers.map((a) => ({
        signupEmail: signup.email,
        questionId: a.questionId,
        answer: a.answer,
        createdAt,
      })),
    );
  };

  if (typeof (db as { transaction?: unknown }).transaction === "function") {
    const transactionalDb = db as {
      transaction: (fn: (tx: SurveyWriteDb) => Promise<void>) => Promise<void>;
    };

    for (let attempt = 0; attempt < SURVEY_TRANSACTION_LOCK_RETRIES; attempt++) {
      try {
        await transactionalDb.transaction(writeSurvey);
        return;
      } catch (err) {
        if (
          attempt === SURVEY_TRANSACTION_LOCK_RETRIES - 1 ||
          !isSqliteLockError(err)
        ) {
          throw err;
        }

        await wait(10 * (attempt + 1));
      }
    }
    return;
  }

  await writeSurvey(db);
}

export function surveyRoute() {
  const route = new Hono<{ Variables: { db: DrizzleD1Database } }>();

  route.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.surveyToken || typeof body.surveyToken !== "string") {
      return c.json({ error: "surveyToken required" }, 400);
    }
    const surveyToken = body.surveyToken.trim();
    if (surveyToken.length === 0) {
      return c.json({ error: "surveyToken required" }, 400);
    }

    if (surveyToken.length > 128) {
      return c.json({ error: "surveyToken too long" }, 400);
    }

    if (!Array.isArray(body.answers) || body.answers.length === 0) {
      return c.json({ error: "answers[] required" }, 400);
    }

    if (body.answers.length > MAX_SURVEY_ANSWERS) {
      return c.json({ error: "Too many answers" }, 400);
    }

    const invalid = (body.answers as unknown[]).some((a) => {
      if (a === null || typeof a !== "object") return true;
      const item = a as Record<string, unknown>;
      return (
        typeof item.questionId !== "string" ||
        typeof item.answer !== "string" ||
        item.questionId.trim().length === 0 ||
        item.answer.trim().length === 0 ||
        item.questionId.trim().length > 100 ||
        item.answer.trim().length > 2000
      );
    });
    if (invalid) {
      return c.json(
        {
          error:
            "Each answer must have questionId (<=100 chars) and answer (<=2000 chars) strings",
        },
        400,
      );
    }

    // Reject duplicate questionIds upfront — a batch insert of duplicate
    // (signup_email, question_id) pairs would hit the unique constraint and
    // the catch block would incorrectly return 409 "Survey already completed".
    const answers = normalizeSurveyAnswers(body.answers as unknown[]);
    const questionIds = answers.map((a) => a.questionId);
    if (questionIds.length !== new Set(questionIds).size) {
      return c.json({ error: "Duplicate questionId in answers" }, 400);
    }

    const db = c.get("db");

    // Look up signup by survey token — the token authenticates the request
    let signup:
      | {
          id: number;
          email: string;
          surveyCompleted: number;
        }
      | undefined;
    try {
      [signup] = await db
        .select({
          id: signups.id,
          email: signups.email,
          surveyCompleted: signups.surveyCompleted,
        })
        .from(signups)
        .where(eq(signups.surveyToken, surveyToken));
    } catch (err) {
      console.error("[survey] signup lookup failed", err);
      captureMarketingApiException(err, {
        source: "survey-signup-lookup",
      });
      return c.json({ error: "Failed to submit survey" }, 500);
    }

    if (!signup) {
      return c.json({ error: "Invalid or expired survey token" }, 404);
    }

    if (signup.surveyCompleted === 1) {
      return c.json({ error: "Survey already completed" }, 409);
    }

    const now = new Date().toISOString();

    try {
      await submitSurveyResponses(db, signup, answers, now);
    } catch (err) {
      if (err instanceof SurveyAlreadyCompletedError) {
        return c.json({ error: "Survey already completed" }, 409);
      }
      const msg = getErrorMessage(err);
      const lower = msg.toLowerCase();
      if (isSqliteLockError(err)) {
        captureMarketingApiException(err, {
          source: "survey-atomic-submit-retryable",
        });
        try {
          if (await isSurveyCompleted(db, signup.id)) {
            return c.json({ error: "Survey already completed" }, 409);
          }
        } catch (readErr) {
          captureMarketingApiException(readErr, {
            source: "survey-atomic-submit-retry-check",
          });
        }
        return c.json({ error: "Please retry survey submission" }, 503);
      }
      if (lower.includes("unique constraint")) {
        return c.json({ error: "Survey already completed" }, 409);
      }
      if (lower.includes("foreign key") || lower.includes("foreign_key")) {
        return c.json({ error: "Invalid or expired survey token" }, 404);
      }
      console.error("[survey] atomic submit failed", err);
      captureMarketingApiException(err, {
        source: "survey-atomic-submit",
      });
      return c.json({ error: "Failed to submit survey" }, 500);
    }

    return c.json({ success: true });
  });

  return route;
}
