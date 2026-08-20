/**
 * Unit tests for survey route — covers three bugs:
 *
 *   BUG 1  Survey double-submission: route must return 409 if surveyCompleted === 1
 *   BUG 4  Unbounded answers array: route must return 400 if answers.length > 20
 */

import { describe, it, expect } from "vitest";
import { createApi } from "../app";
import type { ApiEnv } from "../app";

// ---------------------------------------------------------------------------
// IP helpers — each test gets a unique IP to avoid the shared rate-limit Map
// ---------------------------------------------------------------------------

let ipCounter = 500;
function nextIp(): string {
  ipCounter += 1;
  return `10.30.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
}

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

/**
 * Makes a DB mock for the survey route.
 *
 * @param surveyCompleted - value of the signup row's surveyCompleted column (0 or 1)
 * @param signupExists    - whether a signup row is returned for the given email
 */
function makeDb(surveyCompleted: 0 | 1, signupExists = true) {
  return {
    select: () => ({
      from: () => ({
        where: () =>
          Promise.resolve(
            signupExists
              ? [{ id: 1, email: "test@example.com", surveyCompleted }]
              : [],
          ),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  };
}

function makeEnv(dbOverride: unknown): ApiEnv {
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
    _db: dbOverride as ApiEnv["_db"],
  };
}

const VALID_ANSWERS = [
  { questionId: "role", answer: "developer" },
  { questionId: "tool", answer: "spreadsheets" },
  { questionId: "pain", answer: "scheduling" },
];

// ---------------------------------------------------------------------------
// BUG 1 — Survey idempotency: 409 when surveyCompleted === 1
// ---------------------------------------------------------------------------

describe("BUG 1 — survey idempotency", () => {
  it("returns 409 when surveyCompleted is already 1", async () => {
    const app = createApi(makeEnv(makeDb(1)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: VALID_ANSWERS,
      }),
    });

    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Survey already completed");
  });

  it("does not insert any survey_responses when already completed", async () => {
    let insertCalled = false;
    const db = {
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: 1, email: "done@example.com", surveyCompleted: 1 },
            ]),
        }),
      }),
      insert: () => {
        insertCalled = true;
        return { values: () => Promise.resolve() };
      },
      update: () => ({
        set: () => ({ where: () => Promise.resolve() }),
      }),
    };

    const app = createApi(makeEnv(db));
    await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: VALID_ANSWERS,
      }),
    });

    expect(insertCalled).toBe(false);
  });

  it("returns 200 when surveyCompleted is 0 (first submission)", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: VALID_ANSWERS,
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it("returns 200 when the atomic completion claim returns a claimed row", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: 1, email: "claimed@example.com", surveyCompleted: 0 },
            ]),
        }),
      }),
      transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => Promise.resolve([{ id: 1 }]),
              }),
            }),
          }),
          insert: () => ({
            values: () => Promise.resolve(),
          }),
        }),
      insert: () => ({
        values: () => Promise.resolve(),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: VALID_ANSWERS,
      }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 409 when the atomic completion claim updates no rows", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: 1, email: "race@example.com", surveyCompleted: 0 },
            ]),
        }),
      }),
      transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => Promise.resolve([]),
              }),
            }),
          }),
          insert: () => ({
            values: () => Promise.resolve(),
          }),
        }),
      insert: () => ({
        values: () => Promise.resolve(),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
    };

    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: VALID_ANSWERS,
      }),
    });

    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Survey already completed");
  });
});

// ---------------------------------------------------------------------------
// BUG 4 — Unbounded answers array: reject when answers.length > 20
// ---------------------------------------------------------------------------

describe("BUG 4 — max answers limit", () => {
  it("returns 400 when answers array exceeds 20 items", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      questionId: `q${i}`,
      answer: `answer${i}`,
    }));

    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: tooMany,
      }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Too many answers");
  });

  it("returns 400 for exactly 21 answers (boundary: max is 20)", async () => {
    const twentyOne = Array.from({ length: 21 }, (_, i) => ({
      questionId: `q${i}`,
      answer: `a${i}`,
    }));

    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: twentyOne,
      }),
    });

    expect(res.status).toBe(400);
  });

  it("accepts exactly 20 answers (at the limit)", async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({
      questionId: `q${i}`,
      answer: `a${i}`,
    }));

    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: twenty,
      }),
    });

    expect(res.status).toBe(200);
  });

  it("does not hit DB when answers are over the limit", async () => {
    let dbHit = false;
    const db = {
      select: () => {
        dbHit = true;
        return { from: () => ({ where: () => Promise.resolve([]) }) };
      },
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    };

    const tooMany = Array.from({ length: 25 }, (_, i) => ({
      questionId: `q${i}`,
      answer: `a${i}`,
    }));

    const app = createApi(makeEnv(db));
    await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: tooMany,
      }),
    });

    expect(dbHit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BUG-4 — catch branch: concurrent-insert unique constraint + non-constraint errors
// ---------------------------------------------------------------------------

describe("BUG-4 — catch branch on insert failure", () => {
  function makeDbWithInsertError(
    throwValue: unknown,
    retryReadCompleted: 0 | 1 = 0,
  ) {
    let selectCount = 0;
    return {
      select: () => ({
        from: () => ({
          where: () => {
            selectCount += 1;
            return Promise.resolve([
              {
                id: 1,
                email: "test@example.com",
                surveyCompleted:
                  selectCount === 1 ? 0 : retryReadCompleted,
              },
            ]);
          },
        }),
      }),
      insert: () => ({
        values: () => Promise.reject(throwValue),
      }),
      update: () => ({
        set: () => ({ where: () => Promise.resolve() }),
      }),
    };
  }

  it("returns 409 when insert throws a non-Error unique constraint string", async () => {
    // Covers the `String(err)` branch (err instanceof Error === false)
    const db = makeDbWithInsertError(
      "unique constraint failed: survey_responses.signup_email",
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: "tok", answers: VALID_ANSWERS }),
    });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Survey already completed");
  });

  it("returns 404 when insert throws a foreign key constraint error (Error object)", async () => {
    const db = makeDbWithInsertError(
      new Error("FOREIGN KEY constraint failed"),
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: "tok", answers: VALID_ANSWERS }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid or expired survey token");
  });

  it("returns 404 when insert throws a foreign_key constraint string (non-Error)", async () => {
    const db = makeDbWithInsertError(
      "FOREIGN_KEY constraint failed: survey_responses.signup_email",
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: "tok", answers: VALID_ANSWERS }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Invalid or expired survey token");
  });

  it("returns retryable 503 when the atomic survey transaction hits sqlite_busy", async () => {
    const db = makeDbWithInsertError(
      new Error("SQLITE_BUSY: database is locked"),
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: "tok", answers: VALID_ANSWERS }),
    });

    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Please retry survey submission");
  });

  it("retries a transient sqlite_busy transaction and submits successfully", async () => {
    let attempts = 0;
    const tx = {
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
      insert: () => ({
        values: () => Promise.resolve(),
      }),
    };
    const db = {
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: 1,
                email: "retry@example.com",
                surveyCompleted: 0,
              },
            ]),
        }),
      }),
      transaction: async (fn: (txArg: typeof tx) => Promise<unknown>) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("SQLITE_BUSY: database is locked");
        }
        return fn(tx);
      },
      insert: () => ({
        values: () => Promise.resolve(),
      }),
      update: () => ({
        set: () => ({ where: () => Promise.resolve() }),
      }),
    };
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: "tok", answers: VALID_ANSWERS }),
    });

    expect(res.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it("returns 409 on sqlite_busy when the retry check sees the survey completed", async () => {
    const db = makeDbWithInsertError(
      new Error("SQLITE_BUSY: database is locked"),
      1,
    );
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: "tok", answers: VALID_ANSWERS }),
    });

    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Survey already completed");
  });

  it("returns retryable 503 when the sqlite_busy completion check also fails", async () => {
    let selectCount = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            selectCount += 1;
            if (selectCount > 1) {
              return Promise.reject(new Error("D1_ERROR: read failed"));
            }
            return Promise.resolve([
              {
                id: 1,
                email: "read-failure@example.com",
                surveyCompleted: 0,
              },
            ]);
          },
        }),
      }),
      insert: () => ({
        values: () => Promise.reject(new Error("SQLITE_BUSY: database is locked")),
      }),
      update: () => ({
        set: () => ({ where: () => Promise.resolve() }),
      }),
    };
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: "tok", answers: VALID_ANSWERS }),
    });

    expect(res.status).toBe(503);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Please retry survey submission");
  });

  it("re-throws when insert throws an Error unrelated to unique constraints", async () => {
    // Covers the throw-err path (line 81) — non-constraint DB errors bubble up as 500
    const db = makeDbWithInsertError(new Error("D1_ERROR: disk full"));
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: "tok", answers: VALID_ANSWERS }),
    });
    expect(res.status).toBe(500);
  });

  it("returns a generic 500 when survey token lookup fails", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () =>
            Promise.reject(new Error("D1_ERROR: survey lookup failed")),
        }),
      }),
      insert: () => ({
        values: () => Promise.resolve(),
      }),
      update: () => ({
        set: () => ({ where: () => Promise.resolve() }),
      }),
    };
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: "tok", answers: VALID_ANSWERS }),
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to submit survey" });
  });
});

// ---------------------------------------------------------------------------
// BUG-2 — Max length on questionId / answer strings
// ---------------------------------------------------------------------------

describe("BUG-2 — max length on questionId and answer strings", () => {
  it("returns 400 when questionId is 101 chars", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "q".repeat(101), answer: "ok" }],
      }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe(
      "Each answer must have questionId (<=100 chars) and answer (<=2000 chars) strings",
    );
  });

  it("returns 400 when answer is 2001 chars", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "role", answer: "a".repeat(2001) }],
      }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe(
      "Each answer must have questionId (<=100 chars) and answer (<=2000 chars) strings",
    );
  });

  it("returns 200 when questionId is exactly 100 chars", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "q".repeat(100), answer: "ok" }],
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 when answer is exactly 2000 chars", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "role", answer: "a".repeat(2000) }],
      }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Existing validation — regression guard
// ---------------------------------------------------------------------------

describe("survey route — existing validation (regression guard)", () => {
  it("returns 400 when body is not JSON", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when surveyToken is missing", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ answers: VALID_ANSWERS }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when answers is empty array", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when an answer item is missing questionId", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ answer: "foo" }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when an answer is whitespace-only", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "role", answer: "   " }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("trims surveyToken, questionId, and answer before lookup and insert", async () => {
    let insertedValues: unknown;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            return Promise.resolve([
              { id: 1, email: "test@example.com", surveyCompleted: 0 },
            ]);
          },
        }),
      }),
      insert: () => ({
        values: (values: unknown) => {
          insertedValues = values;
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    };
    const app = createApi(makeEnv(db));

    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "  valid-token  ",
        answers: [{ questionId: "  role  ", answer: "  developer  " }],
      }),
    });

    expect(res.status).toBe(200);
    expect(insertedValues).toEqual([
      expect.objectContaining({
        questionId: "role",
        answer: "developer",
      }),
    ]);
  });

  it("returns 404 when surveyToken does not match any signup", async () => {
    const app = createApi(makeEnv(makeDb(0, false)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "invalid-or-expired-token",
        answers: VALID_ANSWERS,
      }),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// BUG-3 — surveyToken typeof validation (truthy non-string should return 400)
// ---------------------------------------------------------------------------

describe("BUG-3 — surveyToken typeof validation", () => {
  it("returns 400 when surveyToken is a number (truthy but not a string)", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: 42, answers: VALID_ANSWERS }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("surveyToken required");
  });

  it("returns 400 when surveyToken is true (truthy but not a string)", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({ surveyToken: true, answers: VALID_ANSWERS }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("surveyToken required");
  });

  it("returns 400 when surveyToken is an object", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: { token: "abc" },
        answers: VALID_ANSWERS,
      }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// BUG-5 — Duplicate questionId in answers: must return 400, not 409
// ---------------------------------------------------------------------------

describe("BUG-5 — duplicate questionId in answers", () => {
  it("returns 400 when two answers share the same questionId", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [
          { questionId: "role", answer: "developer" },
          { questionId: "role", answer: "manager" },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns correct error message for duplicate questionId", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [
          { questionId: "role", answer: "developer" },
          { questionId: "role", answer: "manager" },
        ],
      }),
    });
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Duplicate questionId in answers");
  });

  it("does not hit DB when duplicate questionIds are present", async () => {
    let dbHit = false;
    const db = {
      select: () => {
        dbHit = true;
        return { from: () => ({ where: () => Promise.resolve([]) }) };
      },
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    };

    const app = createApi(makeEnv(db));
    await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [
          { questionId: "pain", answer: "a" },
          { questionId: "pain", answer: "b" },
        ],
      }),
    });

    expect(dbHit).toBe(false);
  });

  it("accepts answers with all distinct questionIds", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [
          { questionId: "role", answer: "developer" },
          { questionId: "tool", answer: "spreadsheets" },
          { questionId: "pain", answer: "scheduling" },
        ],
      }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// BUG-4b — Empty string answers: questionId and answer must be non-empty
// ---------------------------------------------------------------------------

describe("BUG-4b — empty string answer validation", () => {
  it("returns 400 when questionId is an empty string", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "", answer: "developer" }],
      }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe(
      "Each answer must have questionId (<=100 chars) and answer (<=2000 chars) strings",
    );
  });

  it("returns 400 when answer is an empty string", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "role", answer: "" }],
      }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe(
      "Each answer must have questionId (<=100 chars) and answer (<=2000 chars) strings",
    );
  });

  it("returns 200 when questionId and answer are both non-empty", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "role", answer: "developer" }],
      }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// BUG-C — surveyToken max length validation
// ---------------------------------------------------------------------------

describe("BUG-C — surveyToken max length", () => {
  it("returns 400 when surveyToken exceeds 128 characters", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "a".repeat(129),
        answers: VALID_ANSWERS,
      }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("surveyToken too long");
  });

  it("accepts surveyToken at exactly 128 characters", async () => {
    const app = createApi(makeEnv(makeDb(0)));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "a".repeat(128),
        answers: VALID_ANSWERS,
      }),
    });
    // Will be 404 (token doesn't match any signup) but NOT 400
    expect(res.status).not.toBe(400);
  });

  it("does not hit DB when surveyToken is too long", async () => {
    let dbHit = false;
    const db = {
      select: () => {
        dbHit = true;
        return { from: () => ({ where: () => Promise.resolve([]) }) };
      },
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    };

    const app = createApi(makeEnv(db));
    await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "x".repeat(200),
        answers: VALID_ANSWERS,
      }),
    });

    expect(dbHit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BUG-6 - surveyCompleted claim and answer insert are atomic
// ---------------------------------------------------------------------------

describe("BUG-6 - atomic survey completion transaction", () => {
  function makeDbWithTransactionalInsertError() {
    let inserted = false;
    let transactionStarted = false;
    let transactionFailed = false;
    let rootUpdateCalled = false;
    let rootInsertCalled = false;

    const tx = {
      insert: () => ({
        values: () => {
          inserted = true;
          return Promise.reject(new Error("D1_ERROR: disk full"));
        },
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    };

    return {
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: 1, email: "test@example.com", surveyCompleted: 0 },
            ]),
        }),
      }),
      transaction: async (fn: (txArg: typeof tx) => Promise<unknown>) => {
        transactionStarted = true;
        try {
          return await fn(tx);
        } catch (err) {
          transactionFailed = true;
          throw err;
        }
      },
      insert: () => {
        rootInsertCalled = true;
        return { values: () => Promise.resolve() };
      },
      update: () => ({
        set: () => ({
          where: () => {
            rootUpdateCalled = true;
            return Promise.resolve();
          },
        }),
      }),
      wasInserted: () => inserted,
      wasTransactionStarted: () => transactionStarted,
      wasTransactionFailed: () => transactionFailed,
      wasRootUpdateCalled: () => rootUpdateCalled,
      wasRootInsertCalled: () => rootInsertCalled,
    };
  }

  it("returns 500 and keeps completion claim inside the failed transaction", async () => {
    const db = makeDbWithTransactionalInsertError();
    const app = createApi(makeEnv(db));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: VALID_ANSWERS,
      }),
    });
    expect(res.status).toBe(500);
    expect(db.wasInserted()).toBe(true);
    expect(db.wasTransactionStarted()).toBe(true);
    expect(db.wasTransactionFailed()).toBe(true);
    expect(db.wasRootUpdateCalled()).toBe(false);
    expect(db.wasRootInsertCalled()).toBe(false);
  });

  it("does not expose the DB error to the client when answer insert fails", async () => {
    const app = createApi(makeEnv(makeDbWithTransactionalInsertError()));
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIp(),
        Origin: "https://test.app",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: VALID_ANSWERS,
      }),
    });
    expect(res.status).toBe(500);
    // Must not expose internal error details
    const data = (await res.json()) as Record<string, unknown>;
    expect(String(data.error)).not.toContain("disk full");
  });
});
