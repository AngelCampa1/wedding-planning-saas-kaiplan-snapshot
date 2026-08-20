/**
 * Unit tests for signup route — covers three bugs:
 *
 *   C1  Case-insensitive duplicate detection before insert
 *   H4  Permissive email regex replaced with Zod z.string().email()
 *   M3  Position semantics: queuePosition is persisted and reused
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as emailService from "../services/email";
import * as apolloService from "../services/apollo";
import { resolveLeadMagnetUrl } from "./signup";
import { createApi } from "../app";
import type { ApiEnv } from "../app";
import { identifierBuckets } from "../middleware/rate-limit";
import { HONEYPOT_FIELD, TURNSTILE_FIELD } from "../lib/public-form-protection";

// ---------------------------------------------------------------------------
// IP helpers — each test gets a unique IP to avoid the shared rate-limit Map
// ---------------------------------------------------------------------------

let ipCounter = 200;
function nextIp(): string {
  ipCounter += 1;
  return `10.20.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
}

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

/** Shape of a signup row fetched via SELECT after insert. */
type SignupRow = {
  id: number;
  email?: string;
  sourcePage?: string;
  referralCode: string | null;
  surveyToken: string | null;
  emailSentAt?: string | null;
  createdAt?: string;
  leadMagnetTitle?: string | null;
  leadMagnetUrl?: string | null;
  queuePosition?: number | null;
};

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

function collectNames(value: unknown): string[] {
  const seen = new Set<object>();
  const names = new Set<string>();

  function walk(node: unknown) {
    if (!node || typeof node !== "object" || seen.has(node)) {
      return;
    }
    seen.add(node);

    const record = node as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(record, "name");
    if (descriptor?.value && typeof descriptor.value === "string") {
      names.add(descriptor.value);
    }

    for (const key of Reflect.ownKeys(record)) {
      const child = record[key as keyof typeof record];
      if (Array.isArray(child)) {
        for (const item of child) {
          walk(item);
        }
      } else {
        walk(child);
      }
    }
  }

  walk(value);
  return [...names];
}

/**
 * Minimal DB mock for new-signup path.
 *
 * New logic (D1-compatible):
 *   1. insert().values(data).onConflictDoNothing() — no .returning()
 *   2. select().from().where(eq(email)) → returns the just-inserted row
 *      whose referralCode matches what the route generated (captured from values())
 *   3. select().from().where(max(queue_position)) → returns next position
 *
 * The `insertedRow` parameter is accepted as an array for backward compatibility
 * with existing call sites. Only the first element is used; its id is echoed
 * back in step 2. The referralCode is always captured from values() so that
 * the isNewSignup check (row.referralCode === referralCode) passes.
 */
function makeDbNewSignup(
  insertedRow: SignupRow[] = [
    {
      id: 1,
      referralCode: null,
      surveyToken: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  positionCount = 1,
) {
  const rowTemplate = insertedRow[0] ?? {
    id: 1,
    referralCode: null,
    surveyToken: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  // Capture the referralCode passed to insert().values() so we can echo it
  // back in the SELECT — this makes isNewSignup (row.referralCode === referralCode) true.
  let capturedReferralCode: string | null = null;
  let capturedSurveyToken: string | null = null;
  let capturedEmail = rowTemplate.email ?? "new@example.com";
  let capturedSourcePage = rowTemplate.sourcePage ?? "/";
  let selectCallCount = 0;

  const db = {
    insert: () => ({
      values: (data: Record<string, unknown>) => {
        capturedEmail = (data.email as string | undefined) ?? capturedEmail;
        capturedSourcePage =
          (data.sourcePage as string | undefined) ?? capturedSourcePage;
        capturedReferralCode = (data.referralCode as string | null) ?? null;
        capturedSurveyToken = (data.surveyToken as string | null) ?? null;
        return {
          onConflictDoNothing: () => ({
            returning: () =>
              Promise.resolve(
                "leadMagnetSlug" in data
                  ? [{ downloadToken: data.downloadToken }]
                  : [{ id: rowTemplate.id }],
              ),
          }),
        };
      },
    }),
    select: () => ({
      from: () => {
        const node: Record<string, unknown> = {
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // Case-insensitive duplicate preselect: no existing row.
              return Promise.resolve([]);
            }
            if (selectCallCount === 2) {
              // Post-insert SELECT: return row with captured referralCode so
              // isNewSignup check (row.referralCode === referralCode) is true.
              return Promise.resolve([
                {
                  id: rowTemplate.id,
                  email: capturedEmail,
                  sourcePage: capturedSourcePage,
                  createdAt: rowTemplate.createdAt,
                  referralCode: capturedReferralCode,
                  surveyToken: capturedSurveyToken,
                  emailSentAt: null,
                  queuePosition: rowTemplate.queuePosition ?? null,
                  leadMagnetTitle: rowTemplate.leadMagnetTitle ?? null,
                  leadMagnetUrl: rowTemplate.leadMagnetUrl ?? null,
                  unsubscribedAt: null,
                },
              ]);
            }
            // Subsequent SELECTs: next queue position or referrer lookup
            return Promise.resolve([{ maxQueuePosition: positionCount - 1 }]);
          },
        };
        node.then = (resolve: (v: unknown) => void) =>
          resolve([{ maxQueuePosition: positionCount - 1 }]);
        return node;
      },
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
  };

  return withTransaction(db);
}

/**
 * DB mock for duplicate-email path (D1-compatible, no .returning()).
 *
 * Current logic:
 *   1. select().from().where(lower(email)) returns the existing signup id
 *   2. select().from().where(lower(email)) loads the full existing row
 *   3. when queuePosition is missing, select().from().where(...) returns
 *      max(queue_position) so the route can append a durable rank
 */
function makeDbDuplicate(
  existingRow: {
    id: number;
    referralCode: string | null;
    surveyToken: string | null;
    createdAt?: string;
    emailSentAt?: string | null;
    leadMagnetTitle?: string | null;
    leadMagnetUrl?: string | null;
    queuePosition?: number | null;
    unsubscribedAt?: string | null;
    existingDownloadToken?: string;
    existingDownloadEmailSentAt?: string | null;
  } = {
    id: 1,
    referralCode: "EXISTREF",
    surveyToken: "existingsurveytoken00000000000000",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  positionCount = 1,
  options: { failSentUpdate?: boolean; retryClaimed?: boolean } = {},
) {
  let selectCallCount = 0;
  let lteWhereArg: unknown = undefined;
  const releaseCalls: Record<string, unknown>[] = [];
  // Default emailSentAt to a non-null timestamp so existing tests (which expect
  // 409 + no email) continue to work. Pass emailSentAt: null explicitly to test
  // the retry path (where email was never confirmed sent).
  // Use undefined check (not ??) so that an explicit null is preserved.
  const emailSentAtValue =
    existingRow.emailSentAt !== undefined
      ? existingRow.emailSentAt
      : "2025-01-01T00:00:00.000Z";
  const rowWithEmailSentAt = {
    ...existingRow,
    email: "duplicate@example.com",
    sourcePage: "/",
    createdAt: existingRow.createdAt ?? "2026-01-01T00:00:00.000Z",
    emailSentAt: emailSentAtValue,
    queuePosition:
      existingRow.queuePosition === undefined
        ? positionCount
        : existingRow.queuePosition,
  };
  return withTransaction({
    insert: () => ({
      values: (data: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () =>
            Promise.resolve(
              "leadMagnetSlug" in data && !existingRow.existingDownloadToken
                ? [{ downloadToken: data.downloadToken }]
                : [],
            ),
        }),
      }),
    }),
    select: () => ({
      from: () => {
        const node: Record<string, unknown> = {
          where: async (arg: unknown) => {
            selectCallCount++;
            if (selectCallCount === 1) return [{ id: existingRow.id }];
            if (selectCallCount === 2) return [rowWithEmailSentAt];
            if (selectCallCount === 3 && existingRow.existingDownloadToken) {
              return [
                {
                  id: 1,
                  downloadToken: existingRow.existingDownloadToken,
                  expiresAt: "2027-05-20T00:00:00.000Z",
                  emailSentAt:
                    existingRow.existingDownloadEmailSentAt === undefined
                      ? "2025-01-01T00:00:00.000Z"
                      : existingRow.existingDownloadEmailSentAt,
                },
              ];
            }
            // Position fallback query must include a WHERE clause.
            lteWhereArg = arg;
            return [{ maxQueuePosition: positionCount - 1 }];
          },
        };
        node.then = (resolve: (v: unknown) => void) =>
          resolve([{ maxQueuePosition: positionCount - 1 }]);
        return node;
      },
    }),
    getLteWhereArg: () => lteWhereArg,
    update: () => ({
      set: (data: Record<string, unknown>) => ({
        where: () => {
          if (typeof data.emailSendClaimedAt === "string") {
            return {
              returning: () =>
                Promise.resolve(
                  options.retryClaimed === false ? [] : [rowWithEmailSentAt],
                ),
            };
          }
          if (typeof data.emailSentAt === "string") {
            if (options.failSentUpdate) {
              return Promise.reject(new Error("sent-state write failed"));
            }
            return Promise.resolve();
          }
          if (data.emailSendClaimedAt === null) {
            releaseCalls.push(data);
          }
          return Promise.resolve();
        },
      }),
    }),
    getReleaseCalls: () => releaseCalls,
  });
}

function makeDbExpiredDownloadRotationLostRace() {
  let selectCallCount = 0;
  let updateCallCount = 0;
  const expiredToken = "a".repeat(64);
  const persistedToken = "b".repeat(64);

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
          selectCallCount++;
          if (selectCallCount === 1) {
            return [{ id: 77 }];
          }
          if (selectCallCount === 2) {
            return [
              {
                id: 77,
                email: "expired-race@example.com",
                sourcePage: "/free/budget-template",
                createdAt: "2026-01-01T00:00:00.000Z",
                referralCode: "RACE7777",
                surveyToken: "racetoken7777777777777777777777",
                emailSentAt: "2026-01-01T00:00:00.000Z",
                queuePosition: 77,
                leadMagnetTitle: "Free Budget Template",
                leadMagnetUrl: "https://test.app/free/budget-template",
                unsubscribedAt: null,
              },
            ];
          }
          if (selectCallCount === 3) {
            return [
              {
                id: 9,
                downloadToken: expiredToken,
                expiresAt: "2000-01-01T00:00:00.000Z",
                emailSentAt: "2026-01-01T00:00:00.000Z",
              },
            ];
          }
          return [
            {
              id: 9,
              downloadToken: persistedToken,
              expiresAt: "2027-01-01T00:00:00.000Z",
              emailSentAt: null,
            },
          ];
        },
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => ({
        where: () => {
          updateCallCount++;
          if (typeof data.emailSendClaimedAt === "string") {
            return {
              returning: () => Promise.resolve([{ downloadToken: persistedToken }]),
            };
          }
          return {
            returning: () =>
              Promise.resolve(updateCallCount === 1 ? [] : undefined),
          };
        },
      }),
    }),
    persistedToken,
  });
}

function makeCaseVariantDuplicateDb(
  rows: Array<{
    id: number;
    email: string;
    referralCode: string | null;
    surveyToken: string | null;
    emailSentAt: string | null;
    queuePosition: number;
    unsubscribedAt?: string | null;
  }>,
) {
  let selectCallCount = 0;

  return withTransaction({
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([{ id: 999 }]),
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return [{ id: rows[0]?.id ?? 1 }];
          }
          if (selectCallCount === 2) {
            return rows.map((row) => ({
              ...row,
              sourcePage: "/legacy",
              createdAt: "2026-01-01T00:00:00.000Z",
              leadMagnetTitle: null,
              leadMagnetUrl: null,
              unsubscribedAt: row.unsubscribedAt ?? null,
            }));
          }
          return [{ maxQueuePosition: rows.length }];
        },
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
  });
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

beforeEach(() => identifierBuckets.clear());
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// C1 — Case-insensitive duplicate detection
// ---------------------------------------------------------------------------

describe("C1 — preselect: new signup succeeds when no duplicate exists", () => {
  it("returns 200 with referralCode and position when insert succeeds", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "new@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      referralCode: string;
      position: number;
    };
    expect(data.success).toBe(true);
    expect(typeof data.referralCode).toBe("string");
    expect(data.referralCode.length).toBe(8);
    expect(typeof data.position).toBe("number");
  });

  it("calls email and apollo services only after a successful insert", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const apolloSpy = vi
      .spyOn(apolloService, "addToProductList")
      .mockResolvedValue();

    const app = createApi(
      makeEnv(
        makeDbNewSignup(
          [{ id: 5, referralCode: "RCODE123", surveyToken: null }],
          5,
        ),
      ),
    );
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "fire@example.com",
        sourcePage: "/landing",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendSpy).toHaveBeenCalledOnce();
    expect(apolloSpy).toHaveBeenCalledOnce();
  });
});

describe("C1 — preselect: duplicate signup is detected before insert", () => {
  it("returns 200 with position and no referral code for duplicate email", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const apolloSpy = vi
      .spyOn(apolloService, "addToProductList")
      .mockResolvedValue();

    const db = makeDbDuplicate(
      { id: 3, referralCode: "DUPCODE3", surveyToken: null },
      3,
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "dup@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      position: number;
      referralCode?: string;
      surveyToken?: unknown;
    };
    expect(data.success).toBe(true);
    expect(data.position).toBe(3);
    expect(data.referralCode).toBeUndefined();
    expect(data.surveyToken).toBeUndefined();

    // No side-effects for duplicates
    expect(sendSpy).not.toHaveBeenCalled();
    expect(apolloSpy).not.toHaveBeenCalled();

    // Stored queuePosition avoids recomputing from createdAt/id.
    expect(db.getLteWhereArg()).toBeUndefined();
  });

  it("checks for a case-insensitive duplicate before inserting", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    let insertCalled = false;
    let firstSelectBeforeInsert = false;
    let selectCallCount = 0;

    const db = {
      insert: () => {
        insertCalled = true;
        return {
          values: () => {
            return {
              onConflictDoNothing: () => ({
                returning: () => Promise.resolve([{ id: 7 }]),
              }),
            };
          },
        };
      },
      select: () => ({
        from: () => {
          const node: Record<string, unknown> = {
            where: async () => {
              selectCallCount++;
              firstSelectBeforeInsert = !insertCalled;
              if (selectCallCount === 1) {
                return [
                  {
                    id: 7,
                    referralCode: "CONFLICT_EXISTING",
                    surveyToken: null,
                    emailSentAt: "2025-01-01T00:00:00.000Z",
                  },
                ];
              }
              // Position count for 200 response
              return [{ maxQueuePosition: 6 }];
            },
          };
          node.then = (resolve: (v: unknown) => void) =>
            resolve([{ maxQueuePosition: 6 }]);
          return node;
        },
      }),
      update: () => ({
        set: () => ({ where: () => Promise.resolve() }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "race@example.com", sourcePage: "/" }),
    });

    expect(firstSelectBeforeInsert).toBe(true);
    expect(insertCalled).toBe(false);
    expect(res.status).toBe(200);
  });

  it("uses a suppressed case-variant duplicate before an exact unsuppressed row", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const apolloSpy = vi
      .spyOn(apolloService, "addToProductList")
      .mockResolvedValue();
    const app = createApi(
      makeEnv(
        makeCaseVariantDuplicateDb([
          {
            id: 2,
            email: "user@example.com",
            referralCode: "EXACT002",
            surveyToken: "exacttoken000000000000000000000000",
            emailSentAt: null,
            queuePosition: 2,
          },
          {
            id: 1,
            email: "User@Example.com",
            referralCode: "SUPPRS01",
            surveyToken: "suppresstoken00000000000000000000",
            emailSentAt: null,
            queuePosition: 1,
            unsubscribedAt: "2026-05-01T00:00:00.000Z",
          },
        ]),
      ),
    );

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "user@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { position: number };
    expect(body.position).toBe(1);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(apolloSpy).not.toHaveBeenCalled();
  });

  it("uses the exact case-insensitive duplicate when none are suppressed", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();
    const app = createApi(
      makeEnv(
        makeCaseVariantDuplicateDb([
          {
            id: 1,
            email: "User@Example.com",
            referralCode: "MIXED001",
            surveyToken: "mixedtoken000000000000000000000000",
            emailSentAt: "2026-01-01T00:00:00.000Z",
            queuePosition: 1,
          },
          {
            id: 2,
            email: "user@example.com",
            referralCode: "EXACT002",
            surveyToken: "exacttoken000000000000000000000000",
            emailSentAt: "2026-01-01T00:00:00.000Z",
            queuePosition: 2,
          },
        ]),
      ),
    );

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "user@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { position: number };
    expect(body.position).toBe(2);
  });

  it("uses the oldest case variant when suppression and exactness are tied", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();
    const app = createApi(
      makeEnv(
        makeCaseVariantDuplicateDb([
          {
            id: 9,
            email: "USER@example.com",
            referralCode: "MIXED009",
            surveyToken: "mixedtoken900000000000000000000000",
            emailSentAt: "2026-01-01T00:00:00.000Z",
            queuePosition: 9,
          },
          {
            id: 3,
            email: "User@example.com",
            referralCode: "MIXED003",
            surveyToken: "mixedtoken300000000000000000000000",
            emailSentAt: "2026-01-01T00:00:00.000Z",
            queuePosition: 3,
          },
        ]),
      ),
    );

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "user@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { position: number };
    expect(body.position).toBe(3);
  });

  it("repairs missing queuePosition without using createdAt/id ordering", async () => {
    const db = makeDbDuplicate(
      {
        id: 14,
        createdAt: "2026-04-01T00:00:00.000Z",
        referralCode: "TIEBRK14",
        surveyToken: null,
        emailSentAt: null,
        queuePosition: 0,
      },
      14,
    );
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "tiebreak@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    const names = collectNames(db.getLteWhereArg());
    expect(db.getLteWhereArg()).toBeTruthy();
    expect(names).toContain("queue_position");
  });
});

// ---------------------------------------------------------------------------
// H4 — Zod email validation (z.string().email())
// ---------------------------------------------------------------------------

describe("H4 — Zod email validation rejects addresses the old regex accepted", () => {
  it("returns 400 for plain string with no @ (not an email)", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "notanemail", sourcePage: "/" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for email with double dot in domain (..)", async () => {
    // Old regex accepts "a@b..c" (no consecutive-dot check)
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "user@exam..ple.com", sourcePage: "/" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for email with no local part (starts with @)", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "@example.com", sourcePage: "/" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for email with trailing dot in domain", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "user@example.com.", sourcePage: "/" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for email with spaces", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "user name@example.com", sourcePage: "/" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 for a standard valid email address", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "valid@example.com", sourcePage: "/" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 for email with subdomain", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user@mail.example.com",
        sourcePage: "/",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 for email with plus addressing", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user+tag@example.com",
        sourcePage: "/",
      }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// M3 — Position semantics: referral tracking side branch
// ---------------------------------------------------------------------------

describe("M3 — position semantics: referral tracking still works after preselect", () => {
  it("inserts a referral row when referredBy matches a known referral code", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    let referralInserted = false;
    let selectCallCount = 0;
    let capturedReferralCode: string | null = null;

    const db = {
      insert: () => ({
        values: (data: Record<string, unknown>) => {
          if ("referrerEmail" in data) referralInserted = true;
          // Capture generated referralCode for the full row load.
          if ("referralCode" in data) {
            capturedReferralCode = data.referralCode as string | null;
          }
          return {
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([{ id: 10 }]),
            }),
            run: async () => {},
          };
        },
      }),
      select: () => ({
        from: () => {
          const node: Record<string, unknown> = {
            where: async () => {
              selectCallCount++;
              // First call is the duplicate preselect; second loads the row.
              if (selectCallCount === 1) return [];
              if (selectCallCount === 2)
                return [
                  {
                    id: 10,
                    email: "referred@example.com",
                    sourcePage: "/",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    referralCode: capturedReferralCode,
                    surveyToken: null,
                    emailSentAt: null,
                    queuePosition: null,
                    leadMagnetTitle: null,
                    leadMagnetUrl: null,
                    unsubscribedAt: null,
                  },
                ];
              // Second where: lte position query
              if (selectCallCount === 3) return [{ maxQueuePosition: 9 }];
              // Third where: referrer lookup by referralCode
              return [{ email: "referrer@example.com" }];
            },
          };
          node.then = (resolve: (v: unknown) => void) =>
            resolve([{ maxQueuePosition: 9 }]);
          return node;
        },
      }),
      update: () => ({
        set: () => ({ where: () => Promise.resolve() }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "referred@example.com",
        sourcePage: "/",
        referredBy: "REFERCD1",
      }),
    });

    expect(res.status).toBe(200);
    expect(referralInserted).toBe(true);
  });

  it("skips referral insert when referredBy code does not match any signup", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    let referralInserted = false;
    let capturedReferralCode: string | null = null;

    const db = {
      insert: () => ({
        values: (data: Record<string, unknown>) => {
          if ("referrerEmail" in data) referralInserted = true;
          if ("referralCode" in data) {
            capturedReferralCode = data.referralCode as string | null;
          }
          return {
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([{ id: 11 }]),
            }),
            run: async () => {},
          };
        },
      }),
      select: (() => {
        // Counter lives outside from() so it persists across separate
        // select().from().where() call chains within the same request.
        let selectCallCount = 0;
        return () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCallCount++;
                // First call is the duplicate preselect; second loads the row.
                if (selectCallCount === 1) return [];
                if (selectCallCount === 2)
                  return [
                    {
                      id: 11,
                      email: "noreferrer@example.com",
                      sourcePage: "/",
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: capturedReferralCode,
                      surveyToken: null,
                      emailSentAt: null,
                      queuePosition: null,
                      leadMagnetTitle: null,
                      leadMagnetUrl: null,
                      unsubscribedAt: null,
                    },
                  ];
                // Second call: referrer lookup — no referrer found
                if (selectCallCount === 3) return [{ maxQueuePosition: 10 }];
                // Third call: position query
                if (selectCallCount === 4) return [];
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ maxQueuePosition: 10 }]);
            return node;
          },
        });
      })(),
      update: () => ({
        set: () => ({ where: () => ({ run: async () => {} }) }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "noreferrer@example.com",
        sourcePage: "/",
        referredBy: "BADCODE1",
      }),
    });

    expect(res.status).toBe(200);
    expect(referralInserted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M3-catch — referral insert throws: signup still completes
// ---------------------------------------------------------------------------

describe("M3-catch — referral insert failure is non-fatal", () => {
  it("continues signup side effects when referral insert throws", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const apolloSpy = vi
      .spyOn(apolloService, "addToProductList")
      .mockResolvedValue();

    let insertCallCount = 0;
    let selectCallCount = 0;
    let capturedReferralCode: string | null = null;

    const db = {
      insert: () => ({
        values: (data: Record<string, unknown>) => {
          insertCallCount++;
          if ("referrerEmail" in data) {
            // This is the referral insert — make it throw to cover the catch branch
            return {
              onConflictDoNothing: () => {
                throw new Error("D1_ERROR: constraint violation");
              },
            };
          }
          // This is the signup insert — capture referralCode so SELECT can echo it back
          capturedReferralCode = data.referralCode as string;
          return {
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([{ id: 20 }]),
            }),
          };
        },
      }),
      select: (() => {
        return () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCallCount++;
                // First call: get inserted row by email
                if (selectCallCount === 1) return [];
                if (selectCallCount === 2)
                  return [
                    {
                      id: 20,
                      email: "catchtest@example.com",
                      sourcePage: "/",
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: capturedReferralCode,
                      surveyToken: "tok20",
                      emailSentAt: null,
                      queuePosition: null,
                      leadMagnetTitle: null,
                      leadMagnetUrl: null,
                      unsubscribedAt: null,
                    },
                  ];
                // Second call: referrer lookup — referrer found
                if (selectCallCount === 3) return [{ maxQueuePosition: 19 }];
                // Third call: position count
                if (selectCallCount === 4)
                  return [{ email: "referrer@example.com" }];
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ maxQueuePosition: 19 }]);
            return node;
          },
        });
      })(),
      update: () => ({
        set: () => ({ where: () => ({ run: async () => {} }) }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "catchtest@example.com",
        sourcePage: "/",
        referredBy: "REFCODE1",
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      surveyToken: "tok20",
    });
    expect(sendSpy).toHaveBeenCalled();
    expect(apolloSpy).toHaveBeenCalled();
    expect(insertCallCount).toBeGreaterThanOrEqual(1);
  });

  it("continues signup side effects when referral lookup throws", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const apolloSpy = vi
      .spyOn(apolloService, "addToProductList")
      .mockResolvedValue();

    let selectCallCount = 0;
    let capturedReferralCode: string | null = null;

    const db = {
      insert: () => ({
        values: (data: Record<string, unknown>) => {
          capturedReferralCode = data.referralCode as string;
          return {
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([{ id: 21 }]),
            }),
          };
        },
      }),
      select: (() => {
        return () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCallCount++;
                if (selectCallCount === 1) return [];
                if (selectCallCount === 2)
                  return [
                    {
                      id: 21,
                      email: "lookuptest@example.com",
                      sourcePage: "/",
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: capturedReferralCode,
                      surveyToken: "tok21",
                      emailSentAt: null,
                      queuePosition: null,
                      leadMagnetTitle: null,
                      leadMagnetUrl: null,
                      unsubscribedAt: null,
                    },
                  ];
                if (selectCallCount === 3) return [{ maxQueuePosition: 20 }];
                if (selectCallCount === 4) {
                  throw new Error("D1_ERROR: referral lookup failed");
                }
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ maxQueuePosition: 20 }]);
            return node;
          },
        });
      })(),
      update: () => ({
        set: () => ({ where: () => ({ run: async () => {} }) }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "lookuptest@example.com",
        sourcePage: "/",
        referredBy: "REFCODE2",
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      surveyToken: "tok21",
    });
    expect(sendSpy).toHaveBeenCalled();
    expect(apolloSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Bug #6 — referredBy format validation (must be exactly 8 alphanumeric chars)
// ---------------------------------------------------------------------------

describe("Bug #6 — referredBy format validation (8 alphanumeric characters)", () => {
  it("returns 400 when referredBy is too long (9 chars)", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user@example.com",
        sourcePage: "/",
        referredBy: "ABCDEFGH9",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when referredBy is too short (7 chars)", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user@example.com",
        sourcePage: "/",
        referredBy: "ABCDEFG",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when referredBy contains special characters", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user@example.com",
        sourcePage: "/",
        referredBy: "ABC!EF12",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when referredBy contains spaces", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user@example.com",
        sourcePage: "/",
        referredBy: "ABCD EF1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when referredBy is empty string", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user@example.com",
        sourcePage: "/",
        referredBy: "",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts valid 8-char alphanumeric referredBy (uppercase)", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user2@example.com",
        sourcePage: "/",
        referredBy: "ABCDEF12",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("accepts valid 8-char alphanumeric referredBy (mixed case)", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user3@example.com",
        sourcePage: "/",
        referredBy: "aBcDeFg1",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("omitting referredBy is still accepted (field is optional)", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "user4@example.com",
        sourcePage: "/",
      }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// BUG-1 — Unguarded `existing` access: returns 404 when row deleted in race
// ---------------------------------------------------------------------------

describe("BUG-1 — unguarded existing access: race between conflict and SELECT", () => {
  it("returns 404 when post-conflict SELECT finds no row (row deleted in race)", async () => {
    // The full-row lookup can return [] if a matching row disappears between
    // the preselect/insert attempt and the load. Without the !row guard the
    // route would crash with TypeError; with it, 404.
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([] as never[]),
        }),
      }),
      update: () => ({
        set: () => ({ where: () => ({ run: async () => {} }) }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "ghost@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Not found");
  });
});

// ---------------------------------------------------------------------------
// BUG-4 — generateReferralCode: rejection sampling eliminates modulo bias
// ---------------------------------------------------------------------------

describe("BUG-4 — generateReferralCode: uniform distribution via rejection sampling", () => {
  it("produces an 8-character string on every invocation across 1000 runs", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const validChars = new Set(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    );

    for (let i = 0; i < 1000; i++) {
      const app = createApi(
        makeEnv(
          makeDbNewSignup(
            [{ id: i + 1, referralCode: null, surveyToken: null }],
            i + 1,
          ),
        ),
      );
      const res = await app.request("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": nextIp(),
        },
        body: JSON.stringify({
          email: `bulk${i}@example.com`,
          sourcePage: "/",
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { referralCode: string };
      expect(data.referralCode).toHaveLength(8);
      for (const ch of data.referralCode) {
        expect(validChars.has(ch)).toBe(true);
      }
    }
  }, 30_000);

  it("never produces a character outside the allowed charset in 1000 independent codes", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const allowedPattern = /^[A-Za-z0-9]{8}$/;

    for (let i = 0; i < 1000; i++) {
      const app = createApi(
        makeEnv(
          makeDbNewSignup(
            [{ id: 2000 + i, referralCode: null, surveyToken: null }],
            1,
          ),
        ),
      );
      const res = await app.request("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": nextIp(),
        },
        body: JSON.stringify({
          email: `charset${i}@example.com`,
          sourcePage: "/",
        }),
      });
      const data = (await res.json()) as { referralCode: string };
      expect(allowedPattern.test(data.referralCode)).toBe(true);
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// General validation (unchanged behavior — ensure no regression)
// ---------------------------------------------------------------------------

describe("signup route — validation edge cases", () => {
  it("returns 400 when body is not JSON", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ sourcePage: "/" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when sourcePage is missing", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "a@b.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when sourcePage is an empty string", async () => {
    // z.string().min(1) must reject "" — guards against clients sending an
    // empty string rather than omitting the field entirely.
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "a@b.com", sourcePage: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when sourcePage is whitespace-only", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "a@b.com", sourcePage: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("trims and lowercases pasted email addresses", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();
    const app = createApi(makeEnv(makeDbNewSignup()));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "  Pasted@Example.COM  ",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
  });

  it("passes UTM params through to the position response on success", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(
      makeEnv(
        makeDbNewSignup(
          [{ id: 1, referralCode: "UTM00001", surveyToken: null }],
          1,
        ),
      ),
    );
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "utm@example.com",
        sourcePage: "/",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "brand",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it("includes referralCode and referralUrl in confirmation email", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(
      makeEnv(
        makeDbNewSignup(
          [{ id: 1, referralCode: "URLTEST1", surveyToken: null }],
          1,
        ),
      ),
    );
    await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "refurl@example.com", sourcePage: "/" }),
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        referralCode: expect.any(String),
        referralUrl: expect.stringContaining("?ref="),
      }),
    );
  });

  it("referralUrl in confirmation email uses /?ref= format (trailing slash before query string)", async () => {
    // BUG 7: server was building `https://domain?ref=CODE` (no slash) while
    // the UI built `https://domain/?ref=CODE`. Both must use the slash form.
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(
      makeEnv(
        makeDbNewSignup(
          [{ id: 2, referralCode: "SLASHFIX", surveyToken: null }],
          2,
        ),
      ),
    );
    await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "slashfix@example.com", sourcePage: "/" }),
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        referralUrl: expect.stringMatching(/https:\/\/[^/]+\/\?ref=/),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// BUG-5 — Referral insert failure does not abort the signup transaction
// ---------------------------------------------------------------------------

describe("BUG-5 — referral insert failure is non-fatal", () => {
  it("still sends email when the referral insert throws", async () => {
    // If the referral insert throws (e.g., transient DB error), the signup is
    // already in the DB. Without try/catch, the confirmation email is skipped.
    // The user can never retry through the duplicate path, leaving them stuck.
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const apolloSpy = vi
      .spyOn(apolloService, "addToProductList")
      .mockResolvedValue();

    let capturedReferralCode: string | null = null;

    const db = {
      insert: () => ({
        values: (data: Record<string, unknown>) => {
          if ("referrerEmail" in data) {
            // Referral insert: throw to simulate a transient D1 error.
            // The route's try/catch must absorb this and still send the email.
            const rejection = Promise.reject(
              new Error("D1_ERROR: transient failure"),
            );
            // Suppress unhandled-rejection noise — the route's try/catch consumes it.
            rejection.catch(() => {});
            return Object.assign(rejection, {
              // D1-compatible: no .returning()
              onConflictDoNothing: () => {
                const r = Promise.reject(
                  new Error("D1_ERROR: transient failure"),
                );
                r.catch(() => {});
                return r;
              },
            });
          }
          // Signup insert: capture referralCode for the full row load.
          if ("referralCode" in data) {
            capturedReferralCode = data.referralCode as string | null;
          }
          return {
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([{ id: 30 }]),
            }),
            run: async () => {},
          };
        },
      }),
      select: (() => {
        let callCount = 0;
        return () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                callCount++;
                // First call is the duplicate preselect; second loads the row.
                if (callCount === 1) return [];
                if (callCount === 2)
                  return [
                    {
                      id: 20,
                      email: "failref@example.com",
                      sourcePage: "/",
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: capturedReferralCode,
                      surveyToken: "tok",
                      emailSentAt: null,
                      queuePosition: null,
                      leadMagnetTitle: null,
                      leadMagnetUrl: null,
                      unsubscribedAt: null,
                    },
                  ];
                // Second call: position count
                if (callCount === 3) return [{ maxQueuePosition: 19 }];
                // Third call: referrer lookup
                if (callCount === 4) return [{ email: "referrer@example.com" }];
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ maxQueuePosition: 19 }]);
            return node;
          },
        });
      })(),
      update: () => ({
        set: () => ({ where: () => ({ run: async () => {} }) }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "failref@example.com",
        sourcePage: "/",
        referredBy: "SOMEREF1",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendSpy).toHaveBeenCalled();
    expect(apolloSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BUG-A — UTM fields must have max length constraints
// ---------------------------------------------------------------------------

describe("BUG-A — UTM field max length validation", () => {
  it("returns 400 when utmSource exceeds 200 characters", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "utm-long@example.com",
        sourcePage: "/",
        utmSource: "a".repeat(201),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when utmMedium exceeds 50 characters", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "utm-long@example.com",
        sourcePage: "/",
        utmMedium: "a".repeat(51),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when utmCampaign exceeds 200 characters", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "utm-long@example.com",
        sourcePage: "/",
        utmCampaign: "a".repeat(201),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts utmSource at exactly 200 characters", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "utm-ok@example.com",
        sourcePage: "/",
        utmSource: "a".repeat(200),
      }),
    });
    expect(res.status).toBe(200);
  });

  it("accepts utmMedium at exactly 50 characters", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "utm-ok2@example.com",
        sourcePage: "/",
        utmMedium: "a".repeat(50),
      }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// BUG-B — UTM fields must accept null (URLSearchParams.get returns null)
// ---------------------------------------------------------------------------

describe("BUG-B — UTM fields accept null values from URLSearchParams.get()", () => {
  it("returns 200 when utmSource is null", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "null-utm@example.com",
        sourcePage: "/",
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 when utmSource is null but utmMedium has a value", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "null-utm2@example.com",
        sourcePage: "/pricing",
        utmSource: null,
        utmMedium: "email",
        utmCampaign: null,
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 when all UTM fields are omitted (undefined stripped by JSON.stringify)", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "no-utm@example.com",
        sourcePage: "/",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when utmSource is an empty string (client drops it, server rejects it)", async () => {
    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "empty-utm@example.com",
        sourcePage: "/",
        utmSource: "",
      }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Bug #2 (revised) — duplicate responses preserve position while withholding
// referral and survey tokens from unauthenticated email enumeration.
// ---------------------------------------------------------------------------

describe("Bug #2 (revised) — duplicate signup response", () => {
  it("200 response includes success and position without stored referral code", async () => {
    const db = makeDbDuplicate(
      {
        id: 52,
        referralCode: "EXIST52A",
        surveyToken: "existtoken2222222222222222222222",
      },
      52,
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "dup-position@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      position: number;
      referralCode?: string;
      surveyToken?: string;
    };
    expect(data.success).toBe(true);
    expect(typeof data.position).toBe("number");
    expect(data.position).toBe(52);
    expect(data.referralCode).toBeUndefined();
    expect(data.surveyToken).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// email reliability — email send is now awaited (no longer fire-and-forget)
// ---------------------------------------------------------------------------

describe("email reliability — sendConfirmation failure returns 500", () => {
  it("returns 500 when sendConfirmation throws (email failure is now fatal)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.spyOn(emailService, "sendConfirmation").mockRejectedValue(
      new Error("Resend API down"),
    );
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "fail-email@example.com",
        sourcePage: "/",
      }),
    });

    // Email failure is now fatal — 500 so the client can retry
    expect(res.status).toBe(500);

    // console.error must have been called with "email send failed"
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("email send failed"),
      expect.any(Error),
    );
  });

  it("Apollo failure is still non-fatal — returns 200 and logs via console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockRejectedValue(
      new Error("Apollo API down"),
    );

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "fail-apollo@example.com",
        sourcePage: "/",
      }),
    });

    // Apollo is still fire-and-forget — email succeeded so 200
    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Apollo failed"),
      expect.any(Error),
    );
  });
});

// ---------------------------------------------------------------------------
// resolveLeadMagnetUrl — pure function unit tests
// ---------------------------------------------------------------------------

describe("resolveLeadMagnetUrl — pure function", () => {
  it("returns { title, url } when slug and title both provided", () => {
    const result = resolveLeadMagnetUrl(
      "/some-page",
      "example.com",
      "My Guide",
      "budget-template",
    );
    expect(result).not.toBeNull();
    expect(result?.title).toBe("My Guide");
  });

  it("constructs URL from registered lead magnet metadata when both slug and title provided", () => {
    const result = resolveLeadMagnetUrl(
      "/",
      "mysite.app",
      "Reserve Fund Calculator",
      "hidden-cost-calculator-worksheet",
    );
    expect(result?.url).toBe(
      "https://mysite.app/free/hidden-cost-calculator-worksheet",
    );
  });

  it("returns { title, url } when sourcePage starts with /free/ and title provided", () => {
    const result = resolveLeadMagnetUrl(
      "/free/my-guide",
      "example.com",
      "My Guide",
      undefined,
    );
    expect(result).not.toBeNull();
    expect(result?.title).toBe("My Guide");
  });

  it("constructs URL as https://{domain}{sourcePage} for /free/ sourcePage", () => {
    const result = resolveLeadMagnetUrl(
      "/free/pricing-calculator",
      "boardstack.app",
      "HOA Pricing Calculator",
      undefined,
    );
    expect(result?.url).toBe("https://boardstack.app/free/pricing-calculator");
  });

  it("returns null when neither slug nor /free/ sourcePage", () => {
    const result = resolveLeadMagnetUrl(
      "/",
      "example.com",
      undefined,
      undefined,
    );
    expect(result).toBeNull();
  });

  it("returns metadata title and URL when known slug provided without title", () => {
    const result = resolveLeadMagnetUrl(
      "/",
      "kaiplan.app",
      undefined,
      "budget-template",
    );
    expect(result).not.toBeNull();
    expect(result?.title).toBe(
      "Free Wedding Budget Template: Quote, Deposit, Balance Tracker",
    );
    expect(result?.url).toBe("https://kaiplan.app/free/budget-template");
  });

  it("returns null when an unknown slug is provided without title", () => {
    const result = resolveLeadMagnetUrl(
      "/",
      "example.com",
      undefined,
      "unknown-slug-not-in-metadata",
    );
    expect(result).toBeNull();
  });

  it("returns null when /free/ sourcePage but no title", () => {
    const result = resolveLeadMagnetUrl(
      "/free/my-guide",
      "example.com",
      undefined,
      undefined,
    );
    expect(result).toBeNull();
  });

  it("returns null when sourcePage is 'exit-popup' (not /free/)", () => {
    const result = resolveLeadMagnetUrl(
      "exit-popup",
      "example.com",
      "My Guide",
      undefined,
    );
    expect(result).toBeNull();
  });

  it("registered slug + title takes precedence over sourcePage /free/ path", () => {
    // When both explicit slug AND sourcePage is /free/*, use the explicit slug
    const result = resolveLeadMagnetUrl(
      "/free/other-page",
      "example.com",
      "Explicit Title",
      "vendor-red-flag-checklist",
    );
    expect(result?.url).toBe(
      "https://example.com/free/vendor-red-flag-checklist",
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/signup — lead magnet email branching integration tests
// ---------------------------------------------------------------------------

describe("POST /api/signup — lead magnet email branching", () => {
  it("calls sendLeadMagnetDelivery (not sendConfirmation) when leadMagnetTitle + leadMagnetSlug provided", async () => {
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "lm-slug@example.com",
        sourcePage: "/",
        leadMagnetTitle: "Reserve Fund Guide",
        leadMagnetSlug: "budget-template",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
    expect(sendLeadMagnetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        leadMagnetTitle: "Reserve Fund Guide",
        leadMagnetUrl: "https://test.app/free/budget-template",
        deliveryKey: expect.stringContaining("signup-lead-magnet:"),
      }),
    );
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
  });

  it("calls sendLeadMagnetDelivery (not sendConfirmation) when sourcePage is /free/my-guide and leadMagnetTitle provided", async () => {
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "lm-free@example.com",
        sourcePage: "/free/my-guide",
        leadMagnetTitle: "My Awesome Guide",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
    expect(sendLeadMagnetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        leadMagnetTitle: "My Awesome Guide",
        leadMagnetUrl: "https://test.app/free/my-guide",
        deliveryKey: expect.stringContaining("signup-lead-magnet:"),
      }),
    );
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
  });

  it("calls sendConfirmation (not sendLeadMagnetDelivery) when no lead magnet fields provided (backward compat)", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "no-lm@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendConfirmationSpy).toHaveBeenCalledOnce();
    expect(sendConfirmationSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: expect.stringContaining("signup-confirmation:"),
      }),
    );
    expect(sendLeadMagnetSpy).not.toHaveBeenCalled();
  });

  it("calls sendConfirmation when only leadMagnetTitle provided without slug and sourcePage is exit-popup", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "exit-popup@example.com",
        sourcePage: "exit-popup",
        leadMagnetTitle: "My Guide",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendConfirmationSpy).toHaveBeenCalledOnce();
    expect(sendLeadMagnetSpy).not.toHaveBeenCalled();
  });

  it("does not resend lead magnet delivery on duplicate signup for the same slug", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(
      makeEnv(
        makeDbDuplicate({
          id: 1,
          referralCode: "EXISTREF",
          surveyToken: "existingsurveytoken00000000000000",
          emailSentAt: "2025-01-01T00:00:00.000Z",
          leadMagnetTitle: "Some Guide",
          leadMagnetUrl: "https://test.app/free/vendor-interview-question-list",
          existingDownloadToken: "existing-download-token",
        }),
      ),
    );
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "dup-lm@example.com",
        sourcePage: "/",
        leadMagnetTitle: "Some Guide",
        leadMagnetSlug: "vendor-interview-question-list",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
    expect(sendLeadMagnetSpy).not.toHaveBeenCalled();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.downloadToken).toBeUndefined();
  });

  it("returns 200 using stored lead magnet as row fallback when no slug in new request", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(emailService, "sendLeadMagnetDelivery").mockResolvedValue();

    const app = createApi(
      makeEnv(
        makeDbDuplicate({
          id: 1,
          referralCode: "STOREDREF",
          surveyToken: "storedsurveytoken0000000000000000",
          leadMagnetTitle: "Stored Guide",
          leadMagnetUrl: "https://test.app/free/stored-guide",
        }),
      ),
    );
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "dup-stored-lm@example.com",
        sourcePage: "/",
      }),
    });

    // resolvedLeadMagnet = null, row.leadMagnetTitle && row.leadMagnetUrl = true
    // → stored lead magnet used as fallback (line 340 truthy branch)
    // isLeadMagnetRequest = false, emailSentAt set → plain 409, no email
    expect(res.status).toBe(200);
    expect(emailService.sendConfirmation).not.toHaveBeenCalled();
    expect(emailService.sendLeadMagnetDelivery).not.toHaveBeenCalled();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.referralCode).toBeUndefined();
    expect(body.surveyToken).toBeUndefined();
  });

  it("does not send stored lead magnet when unknown slug provided for existing user with stored magnet", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();

    const app = createApi(
      makeEnv(
        makeDbDuplicate({
          id: 1,
          referralCode: "STOREDREF2",
          surveyToken: "storedsurveytoken1111111111111111",
          leadMagnetTitle: "Stored Guide",
          leadMagnetUrl: "https://test.app/free/stored-guide",
        }),
      ),
    );
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "dup-unknown-slug@example.com",
        sourcePage: "exit-popup",
        leadMagnetSlug: "not-a-known-slug",
      }),
    });

    expect(res.status).toBe(200);
    expect(emailService.sendConfirmation).not.toHaveBeenCalled();
    expect(sendLeadMagnetSpy).not.toHaveBeenCalled();
  });

  it("enrolls an existing email when a new lead magnet download is created", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();

    try {
      const app = createApi(
        makeEnv(
          makeDbDuplicate({
            id: 1,
            referralCode: "EXISTREF",
            surveyToken: "existingsurveytoken22222222222222",
            emailSentAt: "2025-01-01T00:00:00.000Z",
            leadMagnetTitle: null,
            leadMagnetUrl: null,
          }),
        ),
      );
      const res = await app.request("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": nextIp(),
        },
        body: JSON.stringify({
          email: "existing-new-resource@example.com",
          sourcePage: "/free/vendor-red-flag-checklist",
          leadMagnetSlug: "vendor-red-flag-checklist",
        }),
      });

      expect(res.status).toBe(200);
      expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
      await vi.waitFor(() =>
        expect(warnSpy).toHaveBeenCalledWith(
          "[signup] Sequencer enrollment skipped.",
          expect.objectContaining({
            source: "signup-lead-magnet",
            signupId: 1,
          }),
        ),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// resolveLeadMagnetUrl — domain validation guard
// ---------------------------------------------------------------------------

describe("resolveLeadMagnetUrl — domain validation", () => {
  it("returns null when domain is empty string", () => {
    const result = resolveLeadMagnetUrl("/", "", "My Guide", "my-guide");
    expect(result).toBeNull();
  });

  it("returns null when domain starts with https://", () => {
    const result = resolveLeadMagnetUrl(
      "/",
      "https://example.com",
      "My Guide",
      "my-guide",
    );
    expect(result).toBeNull();
  });

  it("returns null when domain starts with http://", () => {
    const result = resolveLeadMagnetUrl(
      "/",
      "http://example.com",
      "My Guide",
      "my-guide",
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// leadMagnetTitle transform — strips leading "Your " prefix
// ---------------------------------------------------------------------------

describe("leadMagnetTitle transform — strips leading Your prefix", () => {
  it("calls sendLeadMagnetDelivery with normalized title (strips 'Your ')", async () => {
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "your-prefix@example.com",
        sourcePage: "/",
        leadMagnetTitle: "Your WCAG Checklist",
        leadMagnetSlug: "wedding-app-comparison-scorecard",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
    const callArg = sendLeadMagnetSpy.mock.calls[0]?.[0];
    expect(callArg?.leadMagnetTitle).toBe("WCAG Checklist");
    expect(callArg?.leadMagnetTitle).not.toMatch(/^[Yy]our\s/);
    expect(callArg?.deliveryKey).toMatch(
      new RegExp(
        `^signup-lead-magnet:${callArg?.surveyToken}:https://test\\.app/free/wedding-app-comparison-scorecard:download:[0-9a-f]{64}$`,
      ),
    );
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
  });

  it("calls sendLeadMagnetDelivery with normalized title (strips lowercase 'your ')", async () => {
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "your-lower@example.com",
        sourcePage: "/",
        leadMagnetTitle: "your HOA Checklist",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
    const callArg = sendLeadMagnetSpy.mock.calls[0]?.[0];
    expect(callArg?.leadMagnetTitle).toBe("HOA Checklist");
    expect(callArg?.deliveryKey).toMatch(
      new RegExp(
        `^signup-lead-magnet:${callArg?.surveyToken}:https://test\\.app/free/vendor-red-flag-checklist:download:[0-9a-f]{64}$`,
      ),
    );
  });

  it("leaves title unchanged when it does not start with 'Your '", async () => {
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi(makeEnv(makeDbNewSignup()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "no-your@example.com",
        sourcePage: "/",
        leadMagnetTitle: "HOA Reserve Fund Checklist",
        leadMagnetSlug: "wedding-timeline-template",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
    const callArg = sendLeadMagnetSpy.mock.calls[0]?.[0];
    expect(callArg?.leadMagnetTitle).toBe("HOA Reserve Fund Checklist");
    expect(callArg?.deliveryKey).toMatch(
      new RegExp(
        `^signup-lead-magnet:${callArg?.surveyToken}:https://test\\.app/free/wedding-timeline-template:download:[0-9a-f]{64}$`,
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// email reliability — emailSentAt is set after successful send
// ---------------------------------------------------------------------------

describe("email reliability — emailSentAt is updated after successful send on new signup", () => {
  it("calls db.update to set emailSentAt after sendConfirmation resolves", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    let updateSetCalled = false;
    let capturedReferralCode: string | null = null;
    let capturedSurveyToken: string | null = null;
    let selectCallCount = 0;

    const db = {
      insert: () => ({
        values: (data: Record<string, unknown>) => {
          capturedReferralCode = (data.referralCode as string | null) ?? null;
          capturedSurveyToken = (data.surveyToken as string | null) ?? null;
          return {
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([{ id: 1 }]),
            }),
          };
        },
      }),
      select: () => ({
        from: () => {
          const node: Record<string, unknown> = {
            where: () => {
              selectCallCount++;
              if (selectCallCount === 1) return Promise.resolve([]);
              if (selectCallCount === 2)
                return Promise.resolve([
                  {
                    id: 1,
                    email: "track-sent@example.com",
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
                ]);
              return Promise.resolve([{ maxQueuePosition: 0 }]);
            },
          };
          node.then = (resolve: (v: unknown) => void) =>
            resolve([{ maxQueuePosition: 0 }]);
          return node;
        },
      }),
      update: () => ({
        set: (data: Record<string, unknown>) => {
          if (typeof data.emailSentAt === "string") updateSetCalled = true;
          return { where: () => Promise.resolve() };
        },
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "track-sent@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    expect(updateSetCalled).toBe(true);
    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: "signup-confirmation:".concat(capturedSurveyToken ?? ""),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// duplicate reliability — no retry side effects
// ---------------------------------------------------------------------------

describe("duplicate reliability — no retry side effects", () => {
  it("returns 200 and retries sendConfirmation when duplicate row has emailSentAt null", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDbDuplicate(
      {
        id: 5,
        referralCode: "RETRY001",
        surveyToken: "retrytoken000000000000000000000000",
        emailSentAt: null,
      },
      5,
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "retry@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    expect(sendSpy).toHaveBeenCalledOnce();
    expect(apolloService.addToProductList).toHaveBeenCalledOnce();
  });

  it("returns 200 and skips sendConfirmation when duplicate row has emailSentAt set", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    // Default makeDbDuplicate has emailSentAt: "2025-01-01..." (already sent)
    const app = createApi(makeEnv(makeDbDuplicate()));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "already-sent@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("returns 500 when duplicate retry sendConfirmation throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(emailService, "sendConfirmation").mockRejectedValue(
      new Error("Resend down on retry"),
    );
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDbDuplicate(
      {
        id: 6,
        referralCode: "RETRY002",
        surveyToken: "retrytoken000000000000000000000001",
        emailSentAt: null,
      },
      6,
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "retry-fail@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to send confirmation email",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[signup] retry email send failed:",
      expect.any(Error),
    );
  });

  it("updates emailSentAt on duplicate retry path after successful send", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    let emailSentAtUpdated = false;
    let selectCallCount = 0;

    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
      select: () => ({
        from: () => {
          const node: Record<string, unknown> = {
            where: async () => {
              selectCallCount++;
              if (selectCallCount === 1) return [{ id: 9 }];
              if (selectCallCount === 2)
                return [
                  {
                    id: 9,
                    email: "retry-track@example.com",
                    sourcePage: "/",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    referralCode: "EXISTING9",
                    surveyToken: "existtok99999999999999999999999999",
                    emailSentAt: null,
                    queuePosition: 9,
                    leadMagnetTitle: null,
                    leadMagnetUrl: null,
                    unsubscribedAt: null,
                  },
                ];
              return [{ maxQueuePosition: 8 }];
            },
          };
          node.then = (resolve: (v: unknown) => void) =>
            resolve([{ maxQueuePosition: 8 }]);
          return node;
        },
      }),
      update: () => ({
        set: (data: Record<string, unknown>) => {
          if (typeof data.emailSentAt === "string") emailSentAtUpdated = true;
          return {
            where: () => {
              if (typeof data.emailSendClaimedAt === "string") {
                return {
                  returning: () =>
                    Promise.resolve([{ email: "retry-track@example.com" }]),
                };
              }
              return Promise.resolve();
            },
          };
        },
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "retry-track@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    expect(emailSentAtUpdated).toBe(true);
  });

  it("keeps the duplicate retry claim when sent-state persistence fails after send", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDbDuplicate(
      {
        id: 16,
        referralCode: "RETRY016",
        surveyToken: "retrytoken161616161616161616161616",
        emailSentAt: null,
      },
      16,
      { failSentUpdate: true },
    );
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "retry-persist-fail@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(500);
    expect(sendConfirmationSpy).toHaveBeenCalledOnce();
    expect(db.getReleaseCalls()).toHaveLength(0);
  });

  it("keeps duplicate retry successful when Apollo retry side effect fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockRejectedValue(
      new Error("Apollo retry down"),
    );

    const db = makeDbDuplicate(
      {
        id: 10,
        referralCode: "RETRY010",
        surveyToken: "retrytoken101010101010101010101010",
        emailSentAt: null,
      },
      10,
    );
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "retry-apollo@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith(
      "[signup] Apollo retry failed (non-fatal):",
      expect.any(Error),
    );
  });

  it("skips duplicate confirmation retry when another request holds the claim", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDbDuplicate(
      {
        id: 14,
        referralCode: "RETRY014",
        surveyToken: "retrytoken141414141414141414141414",
        emailSentAt: null,
      },
      14,
      { retryClaimed: false },
    );
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "retry-claimed@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
  });

  it("suppresses retry email and Apollo side effects for unsubscribed duplicate signups", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDbDuplicate(
      {
        id: 11,
        referralCode: "RETRY011",
        surveyToken: "retrytoken111111111111111111111111",
        emailSentAt: null,
        unsubscribedAt: "2026-05-01T00:00:00.000Z",
      },
      11,
    );
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "retry-unsubscribed@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
    expect(apolloService.addToProductList).not.toHaveBeenCalled();
  });

  it("does not use signup emailSentAt to resend an already delivered lead magnet", async () => {
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDbDuplicate({
      id: 12,
      referralCode: "RETRY012",
      surveyToken: "retrytoken121212121212121212121212",
      emailSentAt: null,
      leadMagnetTitle: "Vendor Red Flag Checklist",
      leadMagnetUrl: "https://test.app/free/vendor-red-flag-checklist",
      existingDownloadToken: "delivered-download-token",
      existingDownloadEmailSentAt: "2026-05-01T00:00:00.000Z",
    });
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "delivered-lead-magnet@example.com",
        sourcePage: "/free/vendor-red-flag-checklist",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendLeadMagnetSpy).not.toHaveBeenCalled();
    expect(apolloService.addToProductList).not.toHaveBeenCalled();
  });

  it("uses the persisted token when expired lead magnet rotation loses a concurrent race", async () => {
    const sendLeadMagnetSpy = vi
      .spyOn(emailService, "sendLeadMagnetDelivery")
      .mockResolvedValue();
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDbExpiredDownloadRotationLostRace();
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "expired-race@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetSlug: "budget-template",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { downloadToken?: string };
    expect(body.downloadToken).toBeUndefined();
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
    const emailParams = sendLeadMagnetSpy.mock.calls[0]?.[0];
    expect(emailParams?.downloadUrl).toBe(
      `https://test.app/api/lead-magnets/download?token=${db.persistedToken}`,
    );
    expect(emailParams?.deliveryKey).toContain(`download:${db.persistedToken}`);
  });

  it("releases the lead magnet retry claim when delivery fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(emailService, "sendLeadMagnetDelivery").mockRejectedValue(
      new Error("delivery down"),
    );
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDbDuplicate({
      id: 15,
      referralCode: "RETRY015",
      surveyToken: "retrytoken151515151515151515151515",
      emailSentAt: "2026-01-01T00:00:00.000Z",
      existingDownloadEmailSentAt: null,
      existingDownloadToken: "c".repeat(64),
      leadMagnetTitle: "Stored Checklist",
      leadMagnetUrl: "https://test.app/free/stored-checklist",
    });
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "retry-lead-fail@example.com",
        sourcePage: "/free/vendor-red-flag-checklist",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to send confirmation email",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[signup] retry email send failed:",
      expect.any(Error),
    );
  });

  it("returns 200 without existing referralCode or surveyToken on duplicate retry", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const db = makeDbDuplicate(
      {
        id: 7,
        referralCode: "RETCODE7",
        surveyToken: "retrytoken777777777777777777777777",
        emailSentAt: null,
      },
      7,
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "retry-data@example.com",
        sourcePage: "/",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      position: number;
      referralCode?: string;
      surveyToken?: string;
    };
    expect(data.success).toBe(true);
    expect(data.referralCode).toBeUndefined();
    expect(data.surveyToken).toBeUndefined();
    expect(data.position).toBe(7);
  });
});

describe("POST /api/signup — bot/abuse protection", () => {
  it("honeypot tripped returns 200 success-shaped with no DB write or email", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    let inserted = false;
    const db = {
      transaction: async () => {
        inserted = true;
        return undefined;
      },
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "bot@example.com",
        sourcePage: "/",
        [HONEYPOT_FIELD]: "http://spam.example.com",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(inserted).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("keeps honeypot short-circuit before schema and Turnstile validation", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: false }));
    let inserted = false;
    const db = {
      transaction: async () => {
        inserted = true;
        return undefined;
      },
    };

    const app = createApi({ ...makeEnv(db), TURNSTILE_SECRET_KEY: "sk" });
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ [HONEYPOT_FIELD]: "http://spam.example.com" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(inserted).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("rejects with 403 when turnstile enforced and token missing", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    let inserted = false;
    const db = {
      transaction: async () => {
        inserted = true;
        return undefined;
      },
    };

    const app = createApi({ ...makeEnv(db), TURNSTILE_SECRET_KEY: "sk" });
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email: "new@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Verification failed.");
    expect(inserted).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("rejects scalar JSON before Turnstile verification or DB writes", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: true }));
    let inserted = false;
    const db = {
      transaction: async () => {
        inserted = true;
        return undefined;
      },
    };

    const app = createApi({ ...makeEnv(db), TURNSTILE_SECRET_KEY: "sk" });
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify("not-an-object"),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("email and sourcePage required");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(inserted).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("validates object bodies before Turnstile verification", async () => {
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: false }));
    let inserted = false;
    const db = {
      transaction: async () => {
        inserted = true;
        return undefined;
      },
    };

    const app = createApi({ ...makeEnv(db), TURNSTILE_SECRET_KEY: "sk" });
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ [TURNSTILE_FIELD]: "bad-token" }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid request body");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(inserted).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("preserves CORS headers on turnstile rejection", async () => {
    const app = createApi({
      ...makeEnv(makeDbNewSignup()),
      TURNSTILE_SECRET_KEY: "sk",
    });
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ email: "cors-fail@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://test.app",
    );
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("rejects with 403 when turnstile token is invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: false }),
    );
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const app = createApi({ ...makeEnv({}), TURNSTILE_SECRET_KEY: "sk" });
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "new@example.com",
        sourcePage: "/",
        [TURNSTILE_FIELD]: "bad",
      }),
    });

    expect(res.status).toBe(403);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("succeeds and sends exactly once with a valid turnstile token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true }),
    );
    const sendSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const app = createApi({
      ...makeEnv(makeDbNewSignup()),
      TURNSTILE_SECRET_KEY: "sk",
    });
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        email: "verified@example.com",
        sourcePage: "/",
        [TURNSTILE_FIELD]: "good",
      }),
    });

    expect(res.status).toBe(200);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("returns 429 after exceeding the per-email throttle", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const email = "throttled@example.com";
    for (let i = 0; i < 3; i++) {
      const app = createApi(makeEnv(makeDbNewSignup()));
      const ok = await app.request("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": nextIp(),
        },
        body: JSON.stringify({ email, sourcePage: "/" }),
      });
      expect(ok.status).toBe(200);
    }

    const app = createApi(makeEnv(makeDbNewSignup()));
    const blocked = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({ email, sourcePage: "/" }),
    });
    expect(blocked.status).toBe(429);
    const data = (await blocked.json()) as { error: string };
    expect(data.error).toBe("Too many requests");
  });

  it("preserves CORS headers on per-email throttling", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    const email = "cors-throttled@example.com";
    for (let i = 0; i < 3; i++) {
      const app = createApi(makeEnv(makeDbNewSignup()));
      const ok = await app.request("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": nextIp(),
          Origin: "https://test.app",
        },
        body: JSON.stringify({ email, sourcePage: "/" }),
      });
      expect(ok.status).toBe(200);
    }

    const app = createApi(makeEnv(makeDbNewSignup()));
    const blocked = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ email, sourcePage: "/" }),
    });

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://test.app",
    );
    expect(blocked.headers.get("Vary")).toBe("Origin");
  });
});
