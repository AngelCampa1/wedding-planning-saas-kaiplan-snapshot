import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSurveyReminder } from "./survey-reminder";
import * as emailService from "../services/email";

vi.mock("../services/email", () => ({
  sendSurveyReminder: vi.fn().mockResolvedValue(true),
}));

describe("handleSurveyReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns without sending when eligible signup lookup fails", async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => {
                throw new Error("D1_ERROR: eligible lookup failed");
              },
            }),
          }),
        }),
      }),
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      {
        RESEND_API_KEY: "re_test",
        PRODUCT_NAME: "CrewRoute",
        PRODUCT_DOMAIN: "crewroute.app",
        PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
        PRODUCT_BRAND_COLOR: "#0066FF",
        PRODUCT_ACCENT_COLOR: "#f59e0b",
        EMAIL_FROM: "angel.campa@kaiplan.app",
      },
    );

    expect(emailService.sendSurveyReminder).not.toHaveBeenCalled();
  });

  it("sends reminders for eligible signups", async () => {
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "user1@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
                {
                  id: 2,
                  email: "user2@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token2",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(emailService.sendSurveyReminder).toHaveBeenCalledTimes(2);
  });

  it("passes correct env params to sendSurveyReminder", async () => {
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "user1@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(emailService.sendSurveyReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: "CrewRoute",
        domain: "crewroute.app",
        logoUrl: "https://crewroute.app/logo.png",
        brandColor: "#0066FF",
        accentColor: "#f59e0b",
        recipientEmail: "user1@test.com",
        emailFrom: "angel.campa@kaiplan.app",
        resendApiKey: "re_test",
        surveyToken: "token1",
        deliveryKey: "survey-reminder:1",
      }),
    );
  });

  it("trims surveyToken before sending the reminder link", async () => {
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(true);
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "user1@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "  token1  ",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(emailService.sendSurveyReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        surveyToken: "token1",
      }),
    );
  });

  it("does not enable e2e email mode in production when E2E_MODE is set", async () => {
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "user1@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      {
        RESEND_API_KEY: "re_test",
        PRODUCT_NAME: "CrewRoute",
        PRODUCT_DOMAIN: "crewroute.app",
        PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
        PRODUCT_BRAND_COLOR: "#0066FF",
        PRODUCT_ACCENT_COLOR: "#f59e0b",
        EMAIL_FROM: "angel.campa@kaiplan.app",
        E2E_MODE: "true",
        ENVIRONMENT: "production",
      },
    );

    expect(emailService.sendSurveyReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        e2eMode: false,
      }),
    );
  });

  it("claims reminderSent = 1 for each signup before delivery", async () => {
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(true);
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const setCalls: unknown[] = [];
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "user1@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
                {
                  id: 2,
                  email: "user2@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token2",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: (val: unknown) => {
          setCalls.push(val);
          return {
            where: () => Promise.resolve(undefined),
          };
        },
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(setCalls).toHaveLength(2);
    expect(setCalls[0]).toEqual({ reminderSent: 1 });
    expect(setCalls[1]).toEqual({ reminderSent: 1 });
  });

  it("claims reminderSent = 1 before sending email to prevent duplicate sends on concurrent runs", async () => {
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(true);

    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    const callOrder: string[] = [];

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "user1@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () =>
            Promise.resolve(undefined).then(() => {
              callOrder.push("db-update");
            }),
        }),
      }),
    };

    vi.mocked(emailService.sendSurveyReminder).mockImplementation(async () => {
      callOrder.push("email-send");
      return true;
    });

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    // Claim must be persisted before the email is sent to avoid overlapping
    // cron runs double-sending the same reminder.
    expect(callOrder).toEqual(["db-update", "email-send"]);
  });

  it("sends the reminder when the atomic claim returns a row", async () => {
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(true);
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "claimed@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token-claimed",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ id: 1 }],
          }),
        }),
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(emailService.sendSurveyReminder).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "claimed@test.com" }),
    );
  });

  it("skips the reminder when another cron run already claimed it", async () => {
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(true);
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "claimed-elsewhere@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token-lost",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(emailService.sendSurveyReminder).not.toHaveBeenCalled();
  });

  it("releases reminderSent claim when email send reports failure", async () => {
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    const updateCalls: unknown[] = [];
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "fail@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: (val: unknown) => {
          updateCalls.push(val);
          return {
            where: () => Promise.resolve(undefined),
          };
        },
      }),
    };

    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(false);

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(updateCalls).toEqual([{ reminderSent: 1 }, { reminderSent: 0 }]);
  });

  it("keeps the reminder claim when the provider send times out", async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const updateCalls: unknown[] = [];
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "timeout@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token-timeout",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: (val: unknown) => {
          updateCalls.push(val);
          return {
            where: () => Promise.resolve(undefined),
          };
        },
      }),
    };

    vi.mocked(emailService.sendSurveyReminder).mockImplementation(
      () => new Promise<boolean>(() => {}),
    );

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    try {
      const run = handleSurveyReminder(
        mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
        env,
      );
      await vi.advanceTimersByTimeAsync(5_000);
      await run;
    } finally {
      vi.useRealTimers();
      errorSpy.mockRestore();
    }

    expect(updateCalls).toEqual([{ reminderSent: 1 }]);
  });

  it("releases reminderSent claim when sendSurveyReminder returns false", async () => {
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(false);
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const setCalls: unknown[] = [];
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "user1@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: (val: unknown) => {
          setCalls.push(val);
          return {
            where: () => Promise.resolve(undefined),
          };
        },
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(setCalls).toEqual([{ reminderSent: 1 }, { reminderSent: 0 }]);
  });

  it("skips sendSurveyReminder when surveyToken is empty and logs the skip", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const setCalls: unknown[] = [];
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "notoken@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: (val: unknown) => {
          setCalls.push(val);
          return {
            where: () => Promise.resolve(undefined),
          };
        },
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(emailService.sendSurveyReminder).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("notoken@test.com"),
    );
    expect(setCalls).toHaveLength(0);
  });

  it("skips sendSurveyReminder when surveyToken is whitespace-only", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const setCalls: unknown[] = [];
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 2,
                  email: "spaces@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "   ",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: (val: unknown) => {
          setCalls.push(val);
          return {
            where: () => Promise.resolve(undefined),
          };
        },
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(emailService.sendSurveyReminder).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("spaces@test.com"),
    );
    expect(setCalls).toHaveLength(0);
  });

  it("BUG-8 — surveyToken is always present (schema enforces notNull), no null guard needed", async () => {
    // The schema defines surveyToken as text("survey_token").notNull(), so
    // every signup row returned from the DB will always have a surveyToken.
    // The old null-token guard was dead code and has been removed.
    // This test confirms all signups get emails when surveyToken is present.
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(true);
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "user1@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
                {
                  id: 2,
                  email: "user2@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token2",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    // Both signups have non-null surveyToken — both get emails
    expect(emailService.sendSurveyReminder).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no eligible signups exist", async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [],
            }),
          }),
        }),
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    expect(emailService.sendSurveyReminder).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BUG-3 — DB update failure must not kill the entire batch
// ---------------------------------------------------------------------------

describe("BUG-3 — db.update failure is non-fatal per signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const env = {
    RESEND_API_KEY: "re_test",
    PRODUCT_NAME: "CrewRoute",
    PRODUCT_DOMAIN: "crewroute.app",
    PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
    PRODUCT_BRAND_COLOR: "#0066FF",
    PRODUCT_ACCENT_COLOR: "#f59e0b",
    EMAIL_FROM: "angel.campa@kaiplan.app",
  };

  it("continues to next signup when db.update throws for one signup", async () => {
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(true);
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    let updateCallCount = 0;
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "fail@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
                {
                  id: 2,
                  email: "ok@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token2",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => {
            updateCallCount++;
            if (updateCallCount === 1) {
              return Promise.reject(new Error("D1_ERROR: transient failure"));
            }
            return Promise.resolve(undefined);
          },
        }),
      }),
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    // The second signup must still be processed despite the first update failing
    expect(emailService.sendSurveyReminder).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "ok@test.com" }),
    );
  });

  it("2e — emails are sent in parallel batches, not strictly sequential", async () => {
    // Bug: the for-of loop awaited each send one at a time — 50 emails × latency = slow.
    // Fix: process emails in batches of 5 using Promise.allSettled.
    // Proof: in a parallel batch, ALL sends within a batch must be called before
    // any of them resolves. We verify this by counting how many sendSurveyReminder
    // calls have been initiated at the moment the FIRST call resolves.
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(true);

    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    let callCount = 0;
    let callCountWhenFirstResolved = 0;

    // Track how many sends have been STARTED at the time the first one resolves.
    // If sequential: callCountWhenFirstResolved === 1 (only 1 started when it finishes).
    // If parallel:   callCountWhenFirstResolved > 1 (multiple started before any finishes).
    let firstResolution = true;
    vi.mocked(emailService.sendSurveyReminder).mockImplementation(async () => {
      callCount++;
      // Yield to allow other concurrent calls to start before resolving
      await Promise.resolve();
      if (firstResolution) {
        firstResolution = false;
        callCountWhenFirstResolved = callCount;
      }
      return true;
    });

    const signupCount = 5; // one full batch
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () =>
                Array.from({ length: signupCount }, (_, i) => ({
                  id: i + 1,
                  email: `user${i + 1}@test.com`,
                  createdAt: twentySixHoursAgo,
                  surveyToken: `token${i + 1}`,
                })),
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    // All 5 sends must have been called
    expect(callCount).toBe(signupCount);

    // In a parallel batch, multiple sends start before any resolves.
    // A sequential implementation would give callCountWhenFirstResolved === 1.
    expect(callCountWhenFirstResolved).toBeGreaterThan(1);
  });

  it("2e — a timed-out email logs an error but does not stop the rest of the batch", async () => {
    // Bug: sequential sends meant one hang would block all subsequent sends.
    // Fix: each send is raced with a 5-second timeout; a timeout logs and moves on.
    vi.useFakeTimers();
    vi.mocked(emailService.sendSurveyReminder).mockImplementation(
      async (opts) => {
        if (opts.surveyToken === "token-hang") {
          // Never resolves — simulates a stuck send
          return new Promise<boolean>(() => {});
        }
        return true;
      },
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "hang@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token-hang",
                },
                {
                  id: 2,
                  email: "ok@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token-ok",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    const runPromise = handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    // Advance time past the 5-second timeout
    await vi.advanceTimersByTimeAsync(6000);
    await runPromise;

    // The timeout should have fired and logged an error
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("timed out"),
      expect.anything(),
    );

    vi.useRealTimers();
  });

  it("2e — reminderSent claim is kept when the email times out", async () => {
    vi.useFakeTimers();
    vi.mocked(emailService.sendSurveyReminder).mockImplementation(
      async () =>
        // Never resolves — simulates a stuck send
        new Promise<boolean>(() => {}),
    );

    const setCalls: unknown[] = [];

    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "hang2@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token-hang2",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: (val: unknown) => {
          setCalls.push(val);
          return {
            where: () => Promise.resolve(undefined),
          };
        },
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    const runPromise = handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );
    await vi.advanceTimersByTimeAsync(6000);
    await runPromise;

    expect(setCalls).toEqual([{ reminderSent: 1 }]);

    vi.useRealTimers();
  });

  it("2e — a non-timeout send error logs the failure error message", async () => {
    // Covers the else branch of `isTimeout` in survey-reminder.ts catch block.
    // A regular send rejection (not a timeout) should log the generic failure message.
    vi.mocked(emailService.sendSurveyReminder).mockRejectedValue(
      new Error("Network error"),
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    const setCalls: unknown[] = [];
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "neterr@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token-neterr",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: (val: unknown) => {
          setCalls.push(val);
          return {
            where: () => Promise.resolve(undefined),
          };
        },
      }),
    };

    const env = {
      RESEND_API_KEY: "re_test",
      PRODUCT_NAME: "CrewRoute",
      PRODUCT_DOMAIN: "crewroute.app",
      PRODUCT_LOGO_URL: "https://crewroute.app/logo.png",
      PRODUCT_BRAND_COLOR: "#0066FF",
      PRODUCT_ACCENT_COLOR: "#f59e0b",
      EMAIL_FROM: "angel.campa@kaiplan.app",
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    // Must log the generic "email failed" message (not "timed out")
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Survey reminder email failed"),
      expect.any(Error),
    );
    // Must NOT log "timed out" for a network error
    const calls = errorSpy.mock.calls;
    const timedOutCall = calls.find(
      ([msg]) => typeof msg === "string" && msg.includes("timed out"),
    );
    expect(timedOutCall).toBeUndefined();
    expect(setCalls).toEqual([{ reminderSent: 1 }, { reminderSent: 0 }]);
  });

  it("still sends email to subsequent signups after a db update failure", async () => {
    vi.mocked(emailService.sendSurveyReminder).mockResolvedValue(true);
    const twentySixHoursAgo = new Date(
      Date.now() - 26 * 60 * 60 * 1000,
    ).toISOString();

    let updateCallCount = 0;
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 1,
                  email: "fail@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token1",
                },
                {
                  id: 2,
                  email: "second@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token2",
                },
                {
                  id: 3,
                  email: "third@test.com",
                  createdAt: twentySixHoursAgo,
                  surveyToken: "token3",
                },
              ],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => {
            updateCallCount++;
            if (updateCallCount === 1) {
              return Promise.reject(new Error("D1_ERROR: transient failure"));
            }
            return Promise.resolve(undefined);
          },
        }),
      }),
    };

    await handleSurveyReminder(
      mockDb as unknown as Parameters<typeof handleSurveyReminder>[0],
      env,
    );

    // signup 1 had a claim failure, so it is skipped before email send;
    // signups 2 and 3 still proceed.
    expect(emailService.sendSurveyReminder).toHaveBeenCalledTimes(2);
    expect(emailService.sendSurveyReminder).not.toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "fail@test.com" }),
    );
    expect(emailService.sendSurveyReminder).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "second@test.com" }),
    );
    expect(emailService.sendSurveyReminder).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "third@test.com" }),
    );
  });
});
