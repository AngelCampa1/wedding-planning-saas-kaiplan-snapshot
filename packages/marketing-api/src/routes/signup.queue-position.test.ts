import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../app";
import type { ApiEnv } from "../app";
import * as emailService from "../services/email";
import * as apolloService from "../services/apollo";

type TransactionalDb = {
  transaction: <T>(cb: (tx: TransactionalDb) => Promise<T>) => Promise<T>;
};

function withTransaction<T extends Record<string, unknown>>(
  db: T,
): T & TransactionalDb {
  return {
    ...db,
    transaction: async <R>(cb: (tx: TransactionalDb & T) => Promise<R>) =>
      cb(db as TransactionalDb & T),
  };
}

function makeEnv(dbOverride: unknown): ApiEnv {
  const transactionalDb =
    dbOverride &&
    typeof (dbOverride as { transaction?: unknown }).transaction === "function"
      ? dbOverride
      : {
          ...(dbOverride as Record<string, unknown>),
          transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
            cb(dbOverride),
        };

  return {
    DB: {} as D1Database,
    RESEND_API_KEY: "re_test",
    APOLLO_API_KEY: "apollo_test",
    PRODUCT_NAME: "TestProduct",
    PRODUCT_DOMAIN: "test.app",
    PRODUCT_LOGO_URL: "https://test.app/logo.png",
    PRODUCT_BRAND_COLOR: "#0066FF",
    PRODUCT_ACCENT_COLOR: "#f59e0b",
    CALENDAR_URL: "https://cal.com/test",
    EMAIL_FROM: "hello@test.app",
    STATS_SECRET: "test-secret",
    ALLOWED_ORIGIN: "https://test.app",
    ENVIRONMENT: "test",
    _db: transactionalDb as ApiEnv["_db"],
  };
}

function makeNewSignupDb(positionCount: number) {
  let selectCallCount = 0;
  let capturedReferralCode: string | null = null;
  let capturedSurveyToken: string | null = null;
  const updateCalls: Record<string, unknown>[] = [];

  return withTransaction({
    insert: () => ({
      values: (data: Record<string, unknown>) => {
        capturedReferralCode = (data.referralCode as string | null) ?? null;
        capturedSurveyToken = (data.surveyToken as string | null) ?? null;
        return {
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([{ id: 11 }]),
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: async () => {
          selectCallCount += 1;
          if (selectCallCount === 1) {
            return [];
          }
          if (selectCallCount === 2) {
            return [
              {
                id: 11,
                email: "new@example.com",
                sourcePage: "/",
                createdAt: "2026-01-01T00:00:00.000Z",
                referralCode: capturedReferralCode,
                surveyToken: capturedSurveyToken,
                emailSentAt: null,
                queuePosition: null,
                leadMagnetTitle: null,
                leadMagnetUrl: null,
                unsubscribedAt: null,
              },
            ];
          }
          return [{ maxQueuePosition: positionCount - 1 }];
        },
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => {
        updateCalls.push(data);
        return { where: () => Promise.resolve() };
      },
    }),
    getUpdateCalls: () => updateCalls,
  });
}

function makeNewSignupDbWithMaxQueuePosition(maxQueuePosition: number) {
  let selectCallCount = 0;
  let capturedReferralCode: string | null = null;
  let capturedSurveyToken: string | null = null;
  const updateCalls: Record<string, unknown>[] = [];

  return withTransaction({
    insert: () => ({
      values: (data: Record<string, unknown>) => {
        capturedReferralCode = (data.referralCode as string | null) ?? null;
        capturedSurveyToken = (data.surveyToken as string | null) ?? null;
        return {
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([{ id: 11 }]),
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: async () => {
          selectCallCount += 1;
          if (selectCallCount === 1) {
            return [];
          }
          if (selectCallCount === 2) {
            return [
              {
                id: 11,
                email: "new@example.com",
                sourcePage: "/",
                createdAt: "2026-01-01T00:00:00.000Z",
                referralCode: capturedReferralCode,
                surveyToken: capturedSurveyToken,
                emailSentAt: null,
                queuePosition: null,
                leadMagnetTitle: null,
                leadMagnetUrl: null,
                unsubscribedAt: null,
              },
            ];
          }
          return [{ maxQueuePosition }];
        },
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => {
        updateCalls.push(data);
        return { where: () => Promise.resolve() };
      },
    }),
    getUpdateCalls: () => updateCalls,
  });
}

function makeDuplicateDb(row: {
  id: number;
  referralCode: string;
  surveyToken: string;
  emailSentAt: string | null;
  queuePosition: number | null;
  leadMagnetTitle?: string | null;
  leadMagnetUrl?: string | null;
}) {
  let selectCallCount = 0;

  return withTransaction({
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => {
          selectCallCount += 1;
          if (selectCallCount === 1) {
            return [{ id: row.id }];
          }
          if (selectCallCount === 2) {
            return [
              {
                id: row.id,
                email: "dup@example.com",
                sourcePage: "/",
                createdAt: "2026-01-01T00:00:00.000Z",
                referralCode: row.referralCode,
                surveyToken: row.surveyToken,
                emailSentAt: row.emailSentAt,
                queuePosition: row.queuePosition,
                leadMagnetTitle: row.leadMagnetTitle ?? null,
                leadMagnetUrl: row.leadMagnetUrl ?? null,
                unsubscribedAt: null,
              },
            ];
          }
          return [{ maxQueuePosition: (row.queuePosition ?? row.id) - 1 }];
        },
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => ({
        where: () => {
          if (typeof data.emailSendClaimedAt === "string") {
            return {
              returning: () => Promise.resolve([row]),
            };
          }
          return Promise.resolve();
        },
      }),
    }),
  });
}

afterEach(() => vi.restoreAllMocks());

describe("signup route queue position and retry delivery", () => {
  it("persists queuePosition after a successful new signup", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeNewSignupDb(4);
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.0.1",
      },
      body: JSON.stringify({
        email: "new@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    expect(db.getUpdateCalls()).toEqual(
      expect.arrayContaining([expect.objectContaining({ queuePosition: 4 })]),
    );
    expect(db.getUpdateCalls()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ emailSentAt: expect.any(String) }),
      ]),
    );
    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledWith(
      expect.objectContaining({
        signupPosition: 4,
      }),
    );
  });

  it("assigns new signups after the highest stored queuePosition", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeNewSignupDbWithMaxQueuePosition(42);
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.0.4",
      },
      body: JSON.stringify({
        email: "new@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    expect(db.getUpdateCalls()).toEqual(
      expect.arrayContaining([expect.objectContaining({ queuePosition: 43 })]),
    );
    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledWith(
      expect.objectContaining({
        signupPosition: 43,
      }),
    );
  });

  it("returns the stored queuePosition without exposing referral code for duplicate signups", async () => {
    const db = makeDuplicateDb({
      id: 3,
      referralCode: "STORED01",
      surveyToken: "stored-token-01",
      emailSentAt: "2026-01-01T00:00:00.000Z",
      queuePosition: 27,
    });
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.0.2",
      },
      body: JSON.stringify({
        email: "dup@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      position: number;
      referralCode?: string;
      surveyToken?: string;
    };
    expect(body.position).toBe(27);
    expect(body.referralCode).toBeUndefined();
    expect(body.surveyToken).toBeUndefined();
  });

  it("retries lead magnet delivery on duplicate retry without exposing surveyToken", async () => {
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDuplicateDb({
      id: 9,
      referralCode: "STORED99",
      surveyToken: "stored-token-99",
      emailSentAt: null,
      queuePosition: 9,
      leadMagnetTitle: "Stored Checklist",
      leadMagnetUrl: "https://test.app/free/stored-checklist",
    });
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.0.3",
      },
      body: JSON.stringify({
        email: "dup@example.com",
        sourcePage: "/free/vendor-red-flag-checklist",
        leadMagnetTitle: "Changed Checklist",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
    expect(sendLeadMagnetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "dup@example.com",
        leadMagnetTitle: "Changed Checklist",
        leadMagnetSlug: "vendor-red-flag-checklist",
        signupPosition: 9,
      }),
    );
    expect(vi.mocked(emailService.sendConfirmation)).not.toHaveBeenCalled();
    const body = (await res.json()) as { surveyToken?: string };
    expect(body.surveyToken).toBeUndefined();
  });
});
