import { describe, it, expect, vi } from "vitest";

// Mock better-auth and its drizzle adapter before importing createAuth
vi.mock("better-auth", () => ({
  betterAuth: vi.fn().mockReturnValue({ api: { getSession: vi.fn() } }),
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn().mockReturnValue({}),
}));

import { createAuth } from "../src/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "../src/db/client";

const ENV = {
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:8787",
  APP_URL: "http://localhost:3000",
  PUBLIC_WEB_URL: "http://localhost:4321",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
};

const MOCK_DB = {} as unknown as Database;
const SEND_PASSWORD_RESET = vi.fn();
const SEND_EMAIL_VERIFICATION = vi.fn();

describe("createAuth", () => {
  it("returns an auth instance", () => {
    const auth = createAuth(MOCK_DB, ENV, {
      sendPasswordReset: SEND_PASSWORD_RESET,
    });
    expect(auth).toBeDefined();
    expect(auth).toHaveProperty("api");
  });

  it("calls betterAuth with correct config", () => {
    createAuth(MOCK_DB, ENV, {
      sendPasswordReset: SEND_PASSWORD_RESET,
    });

    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: ENV.BETTER_AUTH_SECRET,
        baseURL: ENV.BETTER_AUTH_URL,
        trustedOrigins: [ENV.APP_URL],
      }),
    );
  });

  it("deduplicates trusted origins when app and public web URLs match", () => {
    createAuth(MOCK_DB, {
      ...ENV,
      PUBLIC_WEB_URL: ENV.APP_URL,
    });

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    expect(callArgs?.trustedOrigins).toEqual([ENV.APP_URL]);
  });

  it("calls drizzleAdapter with the database and pg provider", () => {
    createAuth(MOCK_DB, ENV, {
      sendPasswordReset: SEND_PASSWORD_RESET,
    });

    expect(drizzleAdapter).toHaveBeenCalledWith(MOCK_DB, { provider: "pg" });
  });

  it("configures email/password and Google social provider", () => {
    createAuth(MOCK_DB, ENV, {
      sendPasswordReset: SEND_PASSWORD_RESET,
      sendEmailVerification: SEND_EMAIL_VERIFICATION,
    });

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    expect(callArgs?.emailAndPassword?.enabled).toBe(true);
    expect(callArgs?.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(callArgs?.emailAndPassword?.sendResetPassword).toEqual(
      expect.any(Function),
    );
    expect(callArgs?.emailVerification?.sendOnSignUp).toBe(true);
    expect(callArgs?.emailVerification?.sendVerificationEmail).toEqual(
      expect.any(Function),
    );
    expect(callArgs?.socialProviders?.google).toEqual({
      clientId: ENV.GOOGLE_CLIENT_ID,
      clientSecret: ENV.GOOGLE_CLIENT_SECRET,
    });
  });

  it("omits Google auth when OAuth credentials are missing", () => {
    createAuth(MOCK_DB, {
      ...ENV,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    });

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    expect(callArgs?.socialProviders).toBeUndefined();
  });

  it("omits password reset delivery when no handler is provided", () => {
    createAuth(MOCK_DB, ENV);

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    expect(callArgs?.emailAndPassword?.sendResetPassword).toBeUndefined();
  });

  it("forwards password reset payloads to the provided handler", async () => {
    const sendPasswordReset = vi.fn().mockResolvedValue(undefined);
    createAuth(MOCK_DB, ENV, { sendPasswordReset });

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    await callArgs?.emailAndPassword?.sendResetPassword?.({
      user: { email: "user@example.com", name: "Test User" },
      url: "https://app.kaiplan.test/reset",
      token: "token-123",
    });

    expect(sendPasswordReset).toHaveBeenCalledWith({
      user: { email: "user@example.com", name: "Test User" },
      url: "https://app.kaiplan.test/reset",
      token: "token-123",
    });
  });

  it("forwards email verification payloads to the provided handler", async () => {
    const sendEmailVerification = vi.fn().mockResolvedValue(undefined);
    createAuth(MOCK_DB, ENV, { sendEmailVerification });

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    await callArgs?.emailVerification?.sendVerificationEmail?.({
      user: { email: "user@example.com", name: "Test User" },
      url: "https://app.kaiplan.test/verify-email",
      token: "token-123",
    });

    expect(sendEmailVerification).toHaveBeenCalledWith({
      user: { email: "user@example.com", name: "Test User" },
      url: "https://app.kaiplan.test/verify-email",
      token: "token-123",
    });
  });

  it("M8: enforces a minimum password length of 12 characters", () => {
    createAuth(MOCK_DB, ENV, {
      sendPasswordReset: SEND_PASSWORD_RESET,
    });

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    expect(callArgs?.emailAndPassword?.minPasswordLength).toBe(12);
  });

  it("requires and configures email verification", () => {
    createAuth(MOCK_DB, ENV, {
      sendPasswordReset: SEND_PASSWORD_RESET,
      sendEmailVerification: SEND_EMAIL_VERIFICATION,
    });

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    expect(callArgs?.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(callArgs?.emailVerification?.sendOnSignUp).toBe(true);
    expect(callArgs?.emailVerification?.sendVerificationEmail).toEqual(
      expect.any(Function),
    );
  });

  it("allows the local e2e harness to sign in synthetic users without email verification", () => {
    createAuth(
      MOCK_DB,
      { ...ENV, E2E_MODE: "true", ENVIRONMENT: "test" },
      {
        sendPasswordReset: SEND_PASSWORD_RESET,
        sendEmailVerification: SEND_EMAIL_VERIFICATION,
      },
    );

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    expect(callArgs?.emailAndPassword?.requireEmailVerification).toBe(false);
    expect(callArgs?.emailVerification?.sendOnSignUp).toBe(true);
  });

  it("still requires email verification if E2E_MODE is accidentally set outside test environments", () => {
    createAuth(
      MOCK_DB,
      { ...ENV, E2E_MODE: "true", ENVIRONMENT: "production" },
      {
        sendPasswordReset: SEND_PASSWORD_RESET,
        sendEmailVerification: SEND_EMAIL_VERIFICATION,
      },
    );

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    expect(callArgs?.emailAndPassword?.requireEmailVerification).toBe(true);
  });

  it("creates a trialing placeholder subscription row after a user is created", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({
      onConflictDoUpdate,
    });
    const db = {
      insert: vi.fn().mockReturnValue({
        values,
      }),
    } as unknown as Database;

    createAuth(db, ENV);

    const callArgs = vi.mocked(betterAuth).mock.calls.at(-1)?.[0];
    await callArgs?.databaseHooks?.user?.create?.after?.({
      id: "user-123",
    });

    expect(db.insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        plan: "free",
        status: "trialing",
        trialStartedAt: expect.any(Date),
        billingGateRequiredAt: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          // trialStartedAt uses a COALESCE SQL expression to preserve the
          // original trial start date on retry (not a plain Date).
          trialStartedAt: expect.anything(),
          updatedAt: expect.any(Date),
        }),
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.not.objectContaining({
          status: expect.anything(),
        }),
      }),
    );
  });
});
