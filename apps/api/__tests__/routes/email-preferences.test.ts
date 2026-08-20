import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Auth } from "../../src/auth";
import type { Database } from "../../src/db/client";
import {
  emailPreferencesRoutes,
  publicEmailPreferencesRoutes,
} from "../../src/routes/email-preferences";
import * as emailModule from "../../src/lib/email";
import { signEmailPreferencesToken } from "../../src/lib/email";

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  emailVerified: true,
};

function makeAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: TEST_USER, session: {} }),
    },
  } as unknown as Auth;
}

function makeUnauthAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  } as unknown as Auth;
}

function makeSelectBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};
  builder.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (error: unknown) => unknown,
  ) => Promise.resolve(resolveWith).then(onFulfilled, onRejected);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.from = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue({
    then: (fn: (rows: unknown) => unknown) => Promise.resolve(fn(resolveWith)),
  });
  return builder;
}

function makeWriteBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};
  builder.values = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(resolveWith),
  });
  builder.set = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(resolveWith),
    }),
  });
  builder.where = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(resolveWith),
  });
  builder.returning = vi.fn().mockResolvedValue(resolveWith);
  return builder;
}

function makeDb(
  selectResponses: unknown[][] = [[]],
  writeResult: unknown[] = [],
) {
  let selectIndex = 0;
  const db: Record<string, unknown> = {};
  db.select = vi.fn().mockImplementation(() => {
    const rawRows =
      selectIndex < selectResponses.length ? selectResponses[selectIndex] : [];
    const rows = rawRows.map((row) => {
      if (
        row &&
        typeof row === "object" &&
        "id" in row &&
        "allowedTypes" in row &&
        !("expiresAt" in row)
      ) {
        return { ...row, expiresAt: "2099-04-09T00:00:00.000Z" };
      }

      return row;
    });
    selectIndex++;
    return makeSelectBuilder(rows);
  });
  db.insert = vi.fn().mockReturnValue(makeWriteBuilder(writeResult));
  db.update = vi.fn().mockReturnValue(makeWriteBuilder(writeResult));
  db.delete = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(writeResult),
  });
  db.transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: db.select,
        insert: db.insert,
        update: db.update,
        delete: db.delete,
        transaction: db.transaction,
      }),
    );
  return db as unknown as Database;
}

function makeApp(db: Database, auth: Auth) {
  const app = new Hono();
  app.route("/email/preferences", emailPreferencesRoutes(db, auth));
  app.route("/public/email/preferences", publicEmailPreferencesRoutes(db));
  return app;
}

async function req(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  body?: unknown,
  env: Record<string, unknown> = {},
) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body:
        body !== undefined
          ? typeof body === "string"
            ? body
            : JSON.stringify(body)
          : undefined,
    }),
    env as never,
  );
}

describe("emailPreferencesRoutes", () => {
  it("returns 401 when not authenticated", async () => {
    const app = makeApp(makeDb(), makeUnauthAuth());
    const res = await req(app, "GET", "/email/preferences");
    expect(res.status).toBe(401);
  });

  it("returns default preferences for the signed-in user", async () => {
    const app = makeApp(makeDb([[]]), makeAuth());
    const res = await req(app, "GET", "/email/preferences");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: TEST_USER.email,
      preferences: {
        appLifecycle: true,
        memberInvite: true,
        rsvpConfirmation: true,
        rsvpReminder: true,
      },
    });
  });

  it("ignores unknown preference types when merging stored preferences", async () => {
    const app = makeApp(
      makeDb([
        [
          {
            email: TEST_USER.email,
            weddingId: null,
            preferenceType: "memberInvite",
            enabled: false,
          },
          {
            email: TEST_USER.email,
            weddingId: null,
            preferenceType: "unknownPreference",
            enabled: false,
          },
        ],
      ]),
      makeAuth(),
    );
    const res = await req(app, "GET", "/email/preferences");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: TEST_USER.email,
      preferences: {
        appLifecycle: true,
        memberInvite: false,
        rsvpConfirmation: true,
        rsvpReminder: true,
      },
    });
  });

  it("updates authenticated preferences", async () => {
    const rows = [
      {
        email: TEST_USER.email,
        weddingId: null,
        preferenceType: "memberInvite",
        enabled: false,
      },
      {
        email: TEST_USER.email,
        weddingId: null,
        preferenceType: "rsvpConfirmation",
        enabled: true,
      },
      {
        email: TEST_USER.email,
        weddingId: null,
        preferenceType: "rsvpReminder",
        enabled: false,
      },
    ];
    const db = makeDb([rows], rows);
    const app = makeApp(db, makeAuth());
    const res = await req(app, "PATCH", "/email/preferences", {
      preferences: {
        memberInvite: false,
        rsvpConfirmation: true,
        rsvpReminder: false,
      },
    });

    expect(res.status).toBe(200);
    expect(db.transaction).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({
      email: TEST_USER.email,
      preferences: {
        appLifecycle: true,
        memberInvite: false,
        rsvpConfirmation: true,
        rsvpReminder: false,
      },
    });
  });

  it("returns 400 for invalid authenticated preference payloads", async () => {
    const app = makeApp(makeDb([[]]), makeAuth());
    const res = await req(app, "PATCH", "/email/preferences", {
      preferences: {
        memberInvite: "nope",
      },
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON authenticated preference updates", async () => {
    const db = makeDb([[]]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "PATCH", "/email/preferences", "{");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 400 for non-object JSON authenticated preference updates", async () => {
    const db = makeDb([[]]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "PATCH", "/email/preferences", "null");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "JSON request body must be an object",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("publicEmailPreferencesRoutes", () => {
  it("returns preferences for a valid token", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-123",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const rows = [
      {
        email: "guest@example.com",
        weddingId: "wedding-1",
        preferenceType: "rsvpConfirmation",
        enabled: false,
      },
      {
        email: "guest@example.com",
        weddingId: "wedding-1",
        preferenceType: "rsvpReminder",
        enabled: true,
      },
    ];
    const tokenRows = [
      {
        id: "token-123",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
      },
    ];
    // writeResult is used by the tx.update().set().where().returning() call
    // that atomically marks the token as used. A non-empty result means success.
    const claimedToken = { id: "token-123", usedAt: new Date() };
    const app = makeApp(
      makeDb([tokenRows, [], rows], [claimedToken]),
      makeAuth(),
    );
    const res = await req(
      app,
      "GET",
      `/public/email/preferences/${token}`,
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "guest@example.com",
      allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
      preferences: {
        appLifecycle: true,
        memberInvite: true,
        rsvpConfirmation: false,
        rsvpReminder: true,
      },
    });
  });

  it("rejects a signed token when storage is bound to a different email", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-bound-email",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-bound-email",
        email: "other@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation"],
      },
    ];
    const app = makeApp(makeDb([tokenRows]), makeAuth());

    const res = await req(
      app,
      "GET",
      `/public/email/preferences/${token}`,
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(404);
  });

  it("rejects a signed token when the stored token row has expired", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-expired-storage",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-expired-storage",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation"],
        expiresAt: "2000-04-09T00:00:00.000Z",
      },
    ];
    const app = makeApp(makeDb([tokenRows]), makeAuth());

    const res = await req(
      app,
      "GET",
      `/public/email/preferences/${token}`,
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Email preferences token not found.",
    });
  });

  it("merges global preferences before partial wedding-scoped preferences", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-partial-scope",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-partial-scope",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        usedAt: null,
      },
    ];
    const globalRows = [
      {
        email: "guest@example.com",
        weddingId: null,
        preferenceType: "rsvpConfirmation",
        enabled: false,
      },
    ];
    const weddingRows = [
      {
        email: "guest@example.com",
        weddingId: "wedding-1",
        preferenceType: "rsvpReminder",
        enabled: true,
      },
    ];
    const app = makeApp(
      makeDb([tokenRows, globalRows, weddingRows]),
      makeAuth(),
    );

    const res = await req(
      app,
      "GET",
      `/public/email/preferences/${token}`,
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "guest@example.com",
      allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
      preferences: {
        appLifecycle: true,
        memberInvite: true,
        rsvpConfirmation: false,
        rsvpReminder: true,
      },
    });
  });

  it("returns member-invite preference access for a member invite token", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-456",
        email: "planner@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const rows = [
      {
        email: "planner@example.com",
        weddingId: null,
        preferenceType: "memberInvite",
        enabled: false,
      },
    ];
    const tokenRows = [
      {
        id: "token-456",
        email: "planner@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
        usedAt: null,
      },
    ];
    const claimedToken = { id: "token-456", usedAt: new Date() };
    const app = makeApp(makeDb([tokenRows, rows], [claimedToken]), makeAuth());
    const res = await req(
      app,
      "GET",
      `/public/email/preferences/${token}`,
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "planner@example.com",
      allowedTypes: ["memberInvite"],
      preferences: {
        appLifecycle: true,
        memberInvite: false,
        rsvpConfirmation: true,
        rsvpReminder: true,
      },
    });
  });

  it("falls back to global preferences when wedding-scoped preferences are missing", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-789",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-789",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        usedAt: null,
      },
    ];
    const globalRows = [
      {
        email: "guest@example.com",
        weddingId: null,
        preferenceType: "rsvpReminder",
        enabled: false,
      },
    ];
    const claimedToken = { id: "token-789", usedAt: new Date() };
    const app = makeApp(
      makeDb([tokenRows, globalRows, []], [claimedToken]),
      makeAuth(),
    );
    const res = await req(
      app,
      "GET",
      `/public/email/preferences/${token}`,
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "guest@example.com",
      allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
      preferences: {
        appLifecycle: true,
        memberInvite: true,
        rsvpConfirmation: true,
        rsvpReminder: false,
      },
    });
  });

  it("updates preferences for a valid public token", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-123",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const rows = [
      {
        email: "guest@example.com",
        weddingId: "wedding-1",
        preferenceType: "rsvpConfirmation",
        enabled: false,
      },
      {
        email: "guest@example.com",
        weddingId: "wedding-1",
        preferenceType: "rsvpReminder",
        enabled: false,
      },
    ];
    const tokenRows = [
      {
        id: "token-123",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
      },
    ];
    const app = makeApp(makeDb([tokenRows, [], rows], rows), makeAuth());
    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "guest@example.com",
      allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
      preferences: {
        appLifecycle: true,
        memberInvite: true,
        rsvpConfirmation: false,
        rsvpReminder: false,
      },
    });
  });

  it("returns 400 for non-object JSON public preference updates", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-null-body",
        email: "guest@example.com",
        weddingId: null,
        allowedTypes: ["rsvpConfirmation"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const db = makeDb([[]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      "[]",
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "JSON request body must be an object",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON public preference updates", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-malformed-body",
        email: "guest@example.com",
        weddingId: null,
        allowedTypes: ["rsvpConfirmation"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const db = makeDb([[]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      '{"preferences":',
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("allows public manage-preference tokens to update more than once before expiry", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-reusable",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-reusable",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpReminder"],
        usedAt: new Date("2026-04-08T10:00:00.000Z"),
      },
    ];
    const db = makeDb([tokenRows, [], [], tokenRows, [], []]);
    const app = makeApp(db, makeAuth());

    const first = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          appLifecycle: true,
          memberInvite: true,
          rsvpConfirmation: true,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );
    const second = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          appLifecycle: true,
          memberInvite: true,
          rsvpConfirmation: true,
          rsvpReminder: true,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      preferences: { rsvpReminder: true },
    });
  });

  it("handles one-click unsubscribe POSTs by disabling allowed preference types", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-one-click",
        email: "Guest@Example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-one-click",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        usedAt: null,
      },
    ];
    const db = makeDb([tokenRows, [], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/email/preferences/${token}`,
      "List-Unsubscribe=One-Click",
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      email: "guest@example.com",
      preferences: {
        rsvpConfirmation: false,
        rsvpReminder: false,
      },
    });
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it("rejects malformed one-click unsubscribe tokens with a 400", async () => {
    const app = makeApp(makeDb(), makeAuth());
    const res = await req(
      app,
      "POST",
      "/public/email/preferences/not-a-real-token",
      "List-Unsubscribe=One-Click",
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid email preferences token.",
    });
  });

  it("rejects one-click unsubscribe POSTs without the one-click body", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-one-click-bad-body",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-one-click-bad-body",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpReminder"],
        usedAt: null,
      },
    ];
    const db = makeDb([tokenRows]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/email/preferences/${token}`,
      "not-one-click",
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid one-click unsubscribe request.",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when one-click token storage is missing", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-one-click-missing-storage",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const db = makeDb([[]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/email/preferences/${token}`,
      "List-Unsubscribe=One-Click",
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Email preferences token not found.",
    });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 404 when a one-click token is removed before preferences write", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-one-click-revoked-before-write",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const db = makeDb([[]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/email/preferences/${token}`,
      "List-Unsubscribe=One-Click",
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Email preferences token not found.",
    });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("preserves global fallback opt-outs when public updates touch only allowed wedding-scoped types", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-partial-update",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-partial-update",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpReminder"],
        usedAt: null,
      },
    ];
    const globalRows = [
      {
        email: "guest@example.com",
        weddingId: null,
        preferenceType: "rsvpConfirmation",
        enabled: false,
      },
    ];
    const weddingRows = [
      {
        email: "guest@example.com",
        weddingId: "wedding-1",
        preferenceType: "rsvpReminder",
        enabled: true,
      },
    ];
    const claimedToken = { id: "token-partial-update", usedAt: new Date() };
    const db = makeDb([tokenRows, globalRows, weddingRows], [claimedToken]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          appLifecycle: true,
          memberInvite: true,
          rsvpConfirmation: true,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "guest@example.com",
      allowedTypes: ["rsvpReminder"],
      preferences: {
        appLifecycle: true,
        memberInvite: true,
        rsvpConfirmation: false,
        rsvpReminder: false,
      },
    });
    const insertBuilder = (db.insert as ReturnType<typeof vi.fn>).mock
      .results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const insertedRows = insertBuilder.values.mock.calls[0]?.[0] as Array<{
      preferenceType: string;
      weddingId: string | null;
    }>;
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      preferenceType: "rsvpReminder",
      weddingId: "wedding-1",
    });
  });

  it("updates only app lifecycle preferences from lifecycle links", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-lifecycle",
        email: "planner@example.com",
        weddingId: null,
        allowedTypes: ["appLifecycle"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-lifecycle",
        email: "planner@example.com",
        weddingId: null,
        allowedTypes: ["appLifecycle"],
      },
    ];
    const rows = [
      {
        email: "planner@example.com",
        weddingId: null,
        preferenceType: "memberInvite",
        enabled: false,
      },
      {
        email: "planner@example.com",
        weddingId: null,
        preferenceType: "rsvpReminder",
        enabled: false,
      },
      {
        email: "planner@example.com",
        weddingId: null,
        preferenceType: "appLifecycle",
        enabled: true,
      },
    ];
    const claimedToken = { id: "token-lifecycle", usedAt: new Date() };
    const app = makeApp(makeDb([tokenRows, rows], [claimedToken]), makeAuth());
    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          appLifecycle: false,
          memberInvite: true,
          rsvpConfirmation: true,
          rsvpReminder: true,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "planner@example.com",
      allowedTypes: ["appLifecycle"],
      preferences: {
        appLifecycle: false,
        memberInvite: false,
        rsvpConfirmation: true,
        rsvpReminder: false,
      },
    });
  });

  it("returns current preferences without writing rows when a public token has no allowed types", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-empty-allowed",
        email: "planner@example.com",
        weddingId: null,
        allowedTypes: [],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-empty-allowed",
        email: "planner@example.com",
        weddingId: null,
        allowedTypes: [],
        usedAt: null,
      },
    ];
    const globalRows = [
      {
        email: "planner@example.com",
        weddingId: null,
        preferenceType: "memberInvite",
        enabled: false,
      },
    ];
    const claimedToken = { id: "token-empty-allowed", usedAt: new Date() };
    const db = makeDb([tokenRows, globalRows], [claimedToken]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          appLifecycle: false,
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "planner@example.com",
      allowedTypes: [],
      preferences: {
        appLifecycle: true,
        memberInvite: false,
        rsvpConfirmation: true,
        rsvpReminder: true,
      },
    });
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("ignores updates to disallowed preference types in the public flow", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-777",
        email: "planner@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-777",
        email: "planner@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
      },
    ];
    const app = makeApp(makeDb([tokenRows], [{}]), makeAuth());
    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          memberInvite: false,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "planner@example.com",
      allowedTypes: ["memberInvite"],
      preferences: {
        appLifecycle: true,
        memberInvite: false,
        rsvpConfirmation: true,
        rsvpReminder: true,
      },
    });
  });

  it("returns 404 when a valid public token no longer exists in storage", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-999",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const app = makeApp(makeDb([[]]), makeAuth());
    const res = await req(
      app,
      "GET",
      `/public/email/preferences/${token}`,
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Email preferences token not found.",
    });
  });

  it("returns 400 for invalid public preference payloads", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-invalid-body",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-invalid-body",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
      },
    ];
    const app = makeApp(makeDb([tokenRows]), makeAuth());
    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          rsvpConfirmation: "nope",
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when a valid public token no longer exists during update", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-not-found-during-update",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const app = makeApp(makeDb([[]]), makeAuth());
    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Email preferences token not found.",
    });
  });

  it("returns 404 when a public token is removed before update writes", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-revoked-before-update",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const db = makeDb([[]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          appLifecycle: true,
          memberInvite: true,
          rsvpConfirmation: true,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Email preferences token not found.",
    });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("allows lookup after a public token has been used", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-123",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const usedTokenRows = [
      {
        id: "token-123",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        usedAt: new Date("2026-04-08T10:00:00.000Z"),
      },
    ];
    const app = makeApp(makeDb([usedTokenRows]), makeAuth());
    const res = await req(
      app,
      "GET",
      `/public/email/preferences/${token}`,
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "guest@example.com",
      allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
      preferences: {
        appLifecycle: true,
        memberInvite: true,
        rsvpConfirmation: true,
        rsvpReminder: true,
      },
    });
  });

  it("returns 400 when token verification fails with a non-error value during update", async () => {
    const verifySpy = vi
      .spyOn(emailModule, "verifyEmailPreferencesToken")
      .mockRejectedValueOnce("bad token");

    const app = makeApp(makeDb(), makeAuth());
    const res = await req(
      app,
      "PATCH",
      "/public/email/preferences/not-a-real-token",
      {
        preferences: {
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid email preferences token.",
    });

    verifySpy.mockRestore();
  });

  it("returns 400 when token verification fails with an Error during update", async () => {
    const app = makeApp(makeDb(), makeAuth());
    const res = await req(
      app,
      "PATCH",
      "/public/email/preferences/not-a-real-token",
      {
        preferences: {
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid email preferences token.",
    });
  });

  it("returns 400 when token verification fails with a non-error value during lookup", async () => {
    const verifySpy = vi
      .spyOn(emailModule, "verifyEmailPreferencesToken")
      .mockRejectedValueOnce("bad token");

    const app = makeApp(makeDb(), makeAuth());
    const res = await req(
      app,
      "GET",
      "/public/email/preferences/not-a-real-token",
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid email preferences token.",
    });

    verifySpy.mockRestore();
  });

  it("returns 400 when one-click token verification fails with a non-error value", async () => {
    const verifySpy = vi
      .spyOn(emailModule, "verifyEmailPreferencesToken")
      .mockRejectedValueOnce("bad token");

    const app = makeApp(makeDb(), makeAuth());
    const res = await req(
      app,
      "POST",
      "/public/email/preferences/not-a-real-token",
      "List-Unsubscribe=One-Click",
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid email preferences token.",
    });

    verifySpy.mockRestore();
  });

  it("does not claim public tokens during update", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-used-during-update",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-used-during-update",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        usedAt: null,
      },
    ];
    const db = makeDb([tokenRows], []) as unknown as Record<string, unknown>;
    const app = makeApp(db as unknown as Database, makeAuth());
    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates preferences even when the token was previously used", async () => {
    const token = await signEmailPreferencesToken(
      {
        tokenId: "token-used-inside-transaction",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "email-secret",
    );
    const tokenRows = [
      {
        id: "token-used-inside-transaction",
        email: "guest@example.com",
        weddingId: "wedding-1",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        usedAt: null,
      },
    ];
    const db = makeDb([tokenRows, [], []]);
    const app = makeApp(db, makeAuth());
    const res = await req(
      app,
      "PATCH",
      `/public/email/preferences/${token}`,
      {
        preferences: {
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      },
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      preferences: {
        rsvpConfirmation: false,
        rsvpReminder: false,
      },
    });
  });

  it("rejects malformed public tokens with a 400", async () => {
    const app = makeApp(makeDb(), makeAuth());
    const res = await req(
      app,
      "GET",
      "/public/email/preferences/not-a-real-token",
      undefined,
      { EMAIL_TOKEN_SECRET: "email-secret" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid email preferences token.",
    });
  });
});
