import { describe, expect, it, vi } from "vitest";
import { dispatchSignupLifecycleEmails } from "../../src/lib/lifecycle-emails";

function makeLifecycleDb(input: {
  candidates: Array<{
    userId: string;
    email: string;
    name: string;
    emailVerified: boolean;
    createdAt: Date;
    plan?: string | null;
    status?: string | null;
    trialStartedAt?: Date | null;
    pendingCheckoutSessionId?: string | null;
  }>;
  lifecycleRows?: Array<{
    userId: string;
    stepKey: string;
    status: string;
    attempts: number;
    updatedAt?: Date | string | null;
  }>;
  preferences?: Record<string, boolean>;
  preferenceEmail?: string;
  insertConflict?: boolean;
  updateConflict?: boolean;
}) {
  const lifecycleRows = [...(input.lifecycleRows ?? [])];
  const insertedRows: unknown[] = [];
  const updatedRows: unknown[] = [];

  const db = {
    select: vi.fn().mockImplementation((shape?: unknown) => {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn().mockReturnValue(builder);
      builder.leftJoin = vi.fn().mockReturnValue(builder);
      builder.where = vi.fn().mockReturnValue(builder);
      builder.limit = vi.fn().mockImplementation(() => {
        const rows =
          shape &&
          typeof shape === "object" &&
          "stepKey" in (shape as Record<string, unknown>)
            ? lifecycleRows
            : input.candidates;
        return Promise.resolve(rows);
      });
      builder.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (error: unknown) => unknown,
      ) => Promise.resolve(input.candidates).then(onFulfilled, onRejected);
      return builder;
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((row: unknown) => {
        insertedRows.push(row);
        const inserted = {
          ...(row as Record<string, unknown>),
          status: "pending",
          attempts: 0,
        };
        lifecycleRows.push(inserted as never);
        return {
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue(input.insertConflict ? [] : [inserted]),
          }),
        };
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((row: unknown) => {
        updatedRows.push(row);
        const updates = row as Record<string, unknown>;
        const claimedRetry =
          updates.status === "pending"
            ? lifecycleRows.find(
                (lifecycleRow) =>
                  ["failed", "pending"].includes(
                    (lifecycleRow as { status: string }).status,
                  ) &&
                  (lifecycleRow as { attempts: number }).attempts < 3,
              )
            : null;
        if (claimedRetry) {
          (claimedRetry as { status: string }).status = "pending";
        }
        return {
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue(
                claimedRetry && !input.updateConflict ? [claimedRetry] : [],
              ),
            then: (onFulfilled: (value: unknown) => unknown) =>
              Promise.resolve(undefined).then(onFulfilled),
          }),
        };
      }),
    }),
  };

  function collectSqlParamValues(value: unknown, values: unknown[] = []) {
    if (!value || typeof value !== "object") return values;

    const record = value as {
      encoder?: unknown;
      queryChunks?: unknown[];
      value?: unknown;
    };
    if ("encoder" in record && "value" in record) {
      values.push(record.value);
    }
    for (const chunk of record.queryChunks ?? []) {
      collectSqlParamValues(chunk, values);
    }
    return values;
  }

  const marketingDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((condition: unknown) => {
          const rows = Object.entries(input.preferences ?? {}).map(
            ([preferenceType, enabled]) => ({
              preferenceType,
              enabled,
            }),
          );
          if (!input.preferenceEmail) return Promise.resolve(rows);

          const values = collectSqlParamValues(condition);
          return Promise.resolve(
            values.includes(input.preferenceEmail) ? rows : [],
          );
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "token-1" }]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };

  return { db, marketingDb, insertedRows, updatedRows };
}

const env = {
  APP_URL: "https://app.kaiplan.test",
  EMAIL_TOKEN_SECRET: "secret",
  EMAIL_FROM_ADDRESS: "hello@kaiplan.test",
};

describe("dispatchSignupLifecycleEmails", () => {
  it("does not send verification nudges for unverified users", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "unverified@example.com",
          name: "Unverified User",
          emailVerified: false,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn().mockResolvedValue(undefined),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-04T12:00:00.000Z"),
    );

    expect(emailService.sendVerificationReminder).not.toHaveBeenCalled();
    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips subscribe nudges for active subscribers", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "active@example.com",
          name: "Active User",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "pro",
          status: "active",
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-04T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
    expect(emailService.sendTrialActivationNudge).not.toHaveBeenCalled();
  });

  it("skips subscribe nudges for trialing paid users without a trial start date", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "trialing-paid@example.com",
          name: "Trialing Paid",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "pro",
          status: "trialing",
          trialStartedAt: null,
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-04T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
    expect(emailService.sendTrialActivationNudge).not.toHaveBeenCalled();
  });

  it("skips verification nudges after checkout has started", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "checkout@example.com",
          name: "Checkout User",
          emailVerified: false,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "active",
          trialStartedAt: null,
          pendingCheckoutSessionId: "cs_pending",
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService,
      new Date("2026-05-03T00:00:00.000Z"),
    );

    expect(emailService.sendVerificationReminder).not.toHaveBeenCalled();
  });

  it("skips marketing nudges when app lifecycle emails are disabled", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "optout@example.com",
          name: "Opt Out",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
      preferences: { appLifecycle: false },
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-04T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
  });

  it("normalizes mixed-case account emails before checking lifecycle opt-out", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "OptOut@Example.com",
          name: "Opt Out",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
      preferenceEmail: "optout@example.com",
      preferences: { appLifecycle: false },
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-04T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
  });

  it("does not duplicate a sent subscribe step", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "sent@example.com",
          name: "Sent User",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
      lifecycleRows: [
        {
          userId: "user-1",
          stepKey: "subscribe-day-1",
          status: "sent",
          attempts: 1,
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-04T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
  });

  it("does not send a step already claimed by another run", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "pending@example.com",
          name: "Pending User",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
          trialStartedAt: null,
          pendingCheckoutSessionId: null,
        },
      ],
      lifecycleRows: [
        {
          userId: "user-1",
          stepKey: "subscribe-day-1",
          status: "pending",
          attempts: 0,
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-03T00:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
  });

  it("reclaims stale pending subscribe steps", async () => {
    const { db, marketingDb, updatedRows } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "stale-pending@example.com",
          name: "Stale Pending",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
          trialStartedAt: null,
          pendingCheckoutSessionId: null,
        },
      ],
      lifecycleRows: [
        {
          userId: "user-1",
          stepKey: "subscribe-day-1",
          status: "pending",
          attempts: 1,
          updatedAt: new Date("2026-05-03T10:00:00.000Z"),
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn().mockResolvedValue(undefined),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-03T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).toHaveBeenCalledTimes(1);
    expect(updatedRows).toContainEqual(
      expect.objectContaining({
        status: "pending",
      }),
    );
    expect(updatedRows).toContainEqual(
      expect.objectContaining({
        status: "sent",
        attempts: 2,
      }),
    );
  });

  it("marks lifecycle step sent when token cleanup fails after delivery", async () => {
    const { db, marketingDb, updatedRows } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "cleanup-fail@example.com",
          name: "Cleanup Failure",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
    });
    vi.mocked(marketingDb.delete).mockReturnValue({
      where: vi.fn().mockRejectedValue(new Error("cleanup failed")),
    } as never);
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn().mockResolvedValue(undefined),
      sendTrialActivationNudge: vi.fn(),
    };
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-03T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).toHaveBeenCalledTimes(1);
    expect(updatedRows).toContainEqual(
      expect.objectContaining({
        status: "sent",
        attempts: 1,
      }),
    );
    expect(updatedRows).not.toContainEqual(
      expect.objectContaining({
        status: "failed",
      }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[email] preference token cleanup failed:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("does not retry failed verification steps", async () => {
    const { db, marketingDb, updatedRows } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "retry@example.com",
          name: "Retry User",
          emailVerified: false,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
      lifecycleRows: [
        {
          userId: "user-1",
          stepKey: "verify-day-3",
          status: "failed",
          attempts: 1,
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn().mockResolvedValue(undefined),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-04T12:00:00.000Z"),
    );

    expect(emailService.sendVerificationReminder).not.toHaveBeenCalled();
    expect(updatedRows).toEqual([]);
  });

  it("retries failed subscribe steps below the attempt limit", async () => {
    const { db, marketingDb, updatedRows } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "retry-subscribe@example.com",
          name: "Retry Subscribe",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
      lifecycleRows: [
        {
          userId: "user-1",
          stepKey: "subscribe-day-4",
          status: "failed",
          attempts: 1,
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn().mockResolvedValue(undefined),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).toHaveBeenCalledTimes(1);
    expect(updatedRows).toContainEqual(
      expect.objectContaining({
        status: "pending",
      }),
    );
    expect(updatedRows).toContainEqual(
      expect.objectContaining({
        status: "sent",
        attempts: 2,
      }),
    );
  });

  it("skips delivery when a failed subscribe step cannot be claimed for retry", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "retry-race@example.com",
          name: "Retry Race",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
      lifecycleRows: [
        {
          userId: "user-1",
          stepKey: "subscribe-day-4",
          status: "failed",
          attempts: 1,
        },
      ],
      updateConflict: true,
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
  });

  it("sends trial activation nudges on trial day 10", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "trial@example.com",
          name: "Trial User",
          emailVerified: true,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          plan: "pro",
          status: "trialing",
          trialStartedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn().mockResolvedValue(undefined),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-11T12:00:00.000Z"),
    );

    expect(emailService.sendTrialActivationNudge).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "trial@example.com",
        stepKey: "trial-day-10",
      }),
    );
  });

  it("sends trial activation nudges for free full-app trials", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "free-trial@example.com",
          name: "Free Trial",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "trialing",
          trialStartedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn().mockResolvedValue(undefined),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-11T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
    expect(emailService.sendTrialActivationNudge).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "free-trial@example.com",
        stepKey: "trial-day-10",
      }),
    );
  });

  it("sends trial activation nudges for legacy inactive free trials", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "legacy-free-trial@example.com",
          name: "Legacy Free Trial",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
          trialStartedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn().mockResolvedValue(undefined),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-11T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
    expect(emailService.sendTrialActivationNudge).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "legacy-free-trial@example.com",
        stepKey: "trial-day-10",
      }),
    );
  });

  it("does nothing when no step is due yet", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "new@example.com",
          name: "New User",
          emailVerified: false,
          createdAt: new Date("2026-05-04T00:00:00.000Z"),
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-04T12:00:00.000Z"),
    );

    expect(emailService.sendVerificationReminder).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips subscribe nudges while checkout is already pending", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "pending@example.com",
          name: "Pending User",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
          pendingCheckoutSessionId: "cs_test_123",
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
  });

  it("does not retry failed subscribe steps after the attempt limit", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "max@example.com",
          name: "Max Attempts",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
      lifecycleRows: [
        {
          userId: "user-1",
          stepKey: "subscribe-day-1",
          status: "failed",
          attempts: 3,
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-04T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
  });

  it("marks a step failed when delivery throws", async () => {
    const { db, marketingDb, updatedRows } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "fail@example.com",
          name: "Failure User",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
    });
    const error = new Error("provider down");
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn().mockRejectedValue(error),
      sendTrialActivationNudge: vi.fn(),
    };
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(updatedRows).toContainEqual(
      expect.objectContaining({
        status: "failed",
        attempts: 1,
        lastError: "provider down",
      }),
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("marks a step failed when preferences URL creation throws after claim", async () => {
    const { db, marketingDb, updatedRows } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "prefs-fail@example.com",
          name: "Prefs Failure User",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
    });
    vi.mocked(marketingDb.insert).mockReturnValue({
      values: vi.fn().mockImplementation(() => {
        throw new Error("token insert failed");
      }),
    } as never);
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
    expect(updatedRows).toContainEqual(
      expect.objectContaining({
        status: "failed",
        attempts: 1,
        lastError: "token insert failed",
      }),
    );
    consoleSpy.mockRestore();
  });

  it("skips delivery when another worker already claimed the step", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "race@example.com",
          name: "Race User",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
      insertConflict: true,
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
  });

  it("skips trial nudges when lifecycle emails are disabled", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "trial-optout@example.com",
          name: "Trial Opt Out",
          emailVerified: true,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          plan: "starter",
          status: "trialing",
          trialStartedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
      preferences: { appLifecycle: false },
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-11T12:00:00.000Z"),
    );

    expect(emailService.sendTrialActivationNudge).not.toHaveBeenCalled();
  });

  it("does not send a trial nudge before the first trial step is due", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "early-trial@example.com",
          name: "Early Trial",
          emailVerified: true,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          plan: "starter",
          status: "trialing",
          trialStartedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-02T12:00:00.000Z"),
    );

    expect(emailService.sendTrialActivationNudge).not.toHaveBeenCalled();
  });

  it("does not send a subscribe nudge before the first subscribe step is due", async () => {
    const { db, marketingDb } = makeLifecycleDb({
      candidates: [
        {
          userId: "user-1",
          email: "early-subscribe@example.com",
          name: "Early Subscribe",
          emailVerified: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          plan: "free",
          status: "inactive",
        },
      ],
    });
    const emailService = {
      sendVerificationReminder: vi.fn(),
      sendSubscribeNudge: vi.fn(),
      sendTrialActivationNudge: vi.fn(),
    };

    await dispatchSignupLifecycleEmails(
      db as never,
      marketingDb as never,
      env,
      emailService as never,
      new Date("2026-05-01T12:00:00.000Z"),
    );

    expect(emailService.sendSubscribeNudge).not.toHaveBeenCalled();
  });
});
