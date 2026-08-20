import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "./db/client";
import { isE2eAllowed } from "./lib/e2e-gate";
import { buildAuthenticatedMutationOrigins } from "./lib/runtime";
import { sql } from "drizzle-orm";
import { subscription } from "./db/schema";

type AuthEnv = {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  APP_URL: string;
  PUBLIC_WEB_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  E2E_MODE?: string;
  ENVIRONMENT?: string;
};

type CreateAuthOptions = {
  sendPasswordReset?: (input: {
    user: { email: string; name?: string | null };
    url: string;
    token: string;
  }) => Promise<void>;
  sendEmailVerification?: (input: {
    user: { email: string; name?: string | null };
    url: string;
    token: string;
  }) => Promise<void>;
};

export function createAuth(
  db: Database,
  env: AuthEnv,
  options: CreateAuthOptions = {},
) {
  const socialProviders =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined;
  const requireEmailVerification = !isE2eAllowed(env);

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: buildAuthenticatedMutationOrigins(env),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification,
      sendResetPassword: options.sendPasswordReset
        ? async ({ user, url, token }) =>
            options.sendPasswordReset?.({ user, url, token })
        : undefined,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url, token }) =>
        options.sendEmailVerification?.({ user, url, token }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const now = new Date();
            await db
              .insert(subscription)
              .values({
                userId: createdUser.id,
                plan: "free",
                status: "trialing",
                trialStartedAt: now,
                billingGateRequiredAt: null,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: subscription.userId,
                set: {
                  // Preserve the original trial start if one is already set so
                  // that retries (e.g. social provider re-create) don't reset
                  // the trial clock or downgrade an existing paid status.
                  trialStartedAt: sql`COALESCE(${subscription.trialStartedAt}, ${now})`,
                  updatedAt: now,
                },
              });
          },
        },
      },
    },
    socialProviders,
  });
}

export type Auth = ReturnType<typeof createAuth>;
