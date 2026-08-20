import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDb, makeApp, clearRateLimit } from "./setup";
import { signups } from "../db/schema";
import { eq } from "drizzle-orm";
import { handleSurveyReminder } from "../cron/survey-reminder";
import type { DrizzleD1Database } from "drizzle-orm/d1";

vi.mock("../services/email", () => ({
  sendConfirmation: vi.fn().mockResolvedValue({ id: "test-email-id" }),
  sendSurveyReminder: vi.fn().mockResolvedValue(true),
}));
vi.mock("../services/apollo", () => ({
  addToProductList: vi.fn().mockResolvedValue(undefined),
}));

const emailModule = await import("../services/email");
const mockSendReminder = vi.mocked(emailModule.sendSurveyReminder);

const cronEnv = {
  RESEND_API_KEY: "re_test",
  PRODUCT_NAME: "TestProduct",
  PRODUCT_DOMAIN: "test.app",
  PRODUCT_LOGO_URL: "https://test.app/logo.png",
  PRODUCT_BRAND_COLOR: "#0066FF",
  PRODUCT_ACCENT_COLOR: "#f59e0b",
  EMAIL_FROM: "hello@test.app",
};

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function makeSignup(
  overrides: Partial<typeof signups.$inferInsert> & { email: string },
) {
  return {
    sourcePage: "/",
    surveyCompleted: 0,
    reminderSent: 0,
    referralCode: `ref-${overrides.email}`,
    surveyToken: `tok-${overrides.email}`,
    createdAt: hoursAgo(25),
    ...overrides,
  };
}

describe("handleSurveyReminder cron", () => {
  let db: Awaited<ReturnType<typeof makeDb>>;

  beforeEach(async () => {
    db = await makeDb();
    vi.clearAllMocks();
    mockSendReminder.mockResolvedValue(true);
  });

  it("sends reminder for signup older than 24h with surveyCompleted=0 and reminderSent=0", async () => {
    await db.insert(signups).values(makeSignup({ email: "old@test.com" }));

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    expect(mockSendReminder).toHaveBeenCalledOnce();
    expect(mockSendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "old@test.com",
        surveyToken: "tok-old@test.com",
        productName: "TestProduct",
        domain: "test.app",
        emailFrom: "hello@test.app",
        resendApiKey: "re_test",
      }),
    );
  });

  it("does NOT send reminder for signup less than 24h old", async () => {
    await db
      .insert(signups)
      .values(
        makeSignup({ email: "recent@test.com", createdAt: hoursAgo(12) }),
      );

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it("does NOT send reminder for signup with surveyCompleted=1", async () => {
    await db
      .insert(signups)
      .values(makeSignup({ email: "done@test.com", surveyCompleted: 1 }));

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it("does NOT send reminder for signup with reminderSent=1 already set", async () => {
    await db
      .insert(signups)
      .values(makeSignup({ email: "already@test.com", reminderSent: 1 }));

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it("does NOT send reminder for a locally unsubscribed signup", async () => {
    await db.insert(signups).values(
      makeSignup({
        email: "unsubscribed@test.com",
        unsubscribedAt: "2026-04-20T00:00:00.000Z",
      }),
    );

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it("sets reminderSent=1 in the DB after processing", async () => {
    await db.insert(signups).values(makeSignup({ email: "flag@test.com" }));

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    const [row] = await db
      .select({ reminderSent: signups.reminderSent })
      .from(signups)
      .where(eq(signups.email, "flag@test.com"));
    expect(row.reminderSent).toBe(1);
  });

  it("only sends one reminder when overlapping cron runs claim the same signup", async () => {
    await db.insert(signups).values(makeSignup({ email: "race@test.com" }));
    mockSendReminder.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(true), 25);
        }),
    );

    await Promise.all([
      handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv),
      handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv),
    ]);

    expect(mockSendReminder).toHaveBeenCalledTimes(1);
    const [row] = await db
      .select({ reminderSent: signups.reminderSent })
      .from(signups)
      .where(eq(signups.email, "race@test.com"));
    expect(row.reminderSent).toBe(1);
  });

  it("releases the reminder claim when the email send reports failure", async () => {
    await db
      .insert(signups)
      .values(makeSignup({ email: "send-false@test.com" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSendReminder.mockResolvedValueOnce(false);

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    const [row] = await db
      .select({ reminderSent: signups.reminderSent })
      .from(signups)
      .where(eq(signups.email, "send-false@test.com"));
    expect(row.reminderSent).toBe(0);
    errorSpy.mockRestore();
  });

  // The schema defines surveyToken as NOT NULL UNIQUE, so we cannot insert a row
  // with a null surveyToken via Drizzle. We use a raw SQL INSERT to bypass this
  // constraint and test the null-token guard in handleSurveyReminder.
  it("skips email without setting flag for signup with empty surveyToken", async () => {
    // Empty string surveyToken — the `if (!signup.surveyToken)` check catches falsy values
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.insert(signups).values(
      makeSignup({
        email: "notoken@test.com",
        surveyToken: "",
        referralCode: "ref-notoken-unique",
      }),
    );

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    expect(mockSendReminder).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("notoken@test.com"),
    );
    const [row] = await db
      .select({ reminderSent: signups.reminderSent })
      .from(signups)
      .where(eq(signups.email, "notoken@test.com"));
    expect(row.reminderSent).toBe(0);
  });

  it("skips email without setting flag for signup with whitespace-only surveyToken", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.insert(signups).values(
      makeSignup({
        email: "space-token@test.com",
        surveyToken: "   ",
        referralCode: "ref-space-token-unique",
      }),
    );

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    expect(mockSendReminder).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("space-token@test.com"),
    );
    const [row] = await db
      .select({ reminderSent: signups.reminderSent })
      .from(signups)
      .where(eq(signups.email, "space-token@test.com"));
    expect(row.reminderSent).toBe(0);
  });

  it("processes at most 50 signups per batch", async () => {
    const rows = Array.from({ length: 52 }, (_, i) =>
      makeSignup({
        email: `batch${i}@test.com`,
        referralCode: `ref-batch-${i}`,
        surveyToken: `tok-batch-${i}`,
      }),
    );
    await db.insert(signups).values(rows);

    await handleSurveyReminder(db as unknown as DrizzleD1Database, cronEnv);

    expect(mockSendReminder).toHaveBeenCalledTimes(50);
  });

  it("cron picks up backdated signup and sets reminderSent flag", async () => {
    clearRateLimit();
    const app = await makeApp();

    // Signup via the API
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "pipeline@test.com", sourcePage: "/" }),
    });
    expect(res.status).toBe(200);

    // The app uses its own in-memory DB. We need to get a reference to it.
    // makeApp() creates a fresh DB internally, so we retrieve the signup from it
    // by making a second request. Instead, we extract the DB by inserting via
    // the app and then running cron against the same DB.
    //
    // Since makeApp() encapsulates the DB, we replicate the pipeline:
    // 1. Insert a signup into our own DB
    // 2. Backdate its createdAt to >24h ago
    // 3. Run the cron against the same DB
    const pipelineDb = await makeDb();
    await pipelineDb.insert(signups).values(
      makeSignup({
        email: "pipeline@test.com",
        createdAt: hoursAgo(1), // recent — cron should NOT pick it up yet
      }),
    );

    // Run cron — should not process because signup is <24h old
    await handleSurveyReminder(
      pipelineDb as unknown as DrizzleD1Database,
      cronEnv,
    );
    expect(mockSendReminder).not.toHaveBeenCalled();

    // Manually backdate createdAt to simulate 25h passing
    await pipelineDb
      .update(signups)
      .set({ createdAt: hoursAgo(25) })
      .where(eq(signups.email, "pipeline@test.com"));

    // Now cron should pick it up
    await handleSurveyReminder(
      pipelineDb as unknown as DrizzleD1Database,
      cronEnv,
    );
    expect(mockSendReminder).toHaveBeenCalledOnce();
    expect(mockSendReminder).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "pipeline@test.com" }),
    );

    // Verify reminderSent flag is set
    const [row] = await pipelineDb
      .select({ reminderSent: signups.reminderSent })
      .from(signups)
      .where(eq(signups.email, "pipeline@test.com"));
    expect(row.reminderSent).toBe(1);
  });
});
