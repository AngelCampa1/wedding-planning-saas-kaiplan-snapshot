import { beforeEach, describe, expect, it, vi } from "vitest";
const { resendConstructor } = vi.hoisted(() => ({
  resendConstructor: vi.fn(),
}));
vi.mock("resend", () => ({
  Resend: resendConstructor,
}));
import {
  clearCapturedFeedback,
  clearCapturedPasswordResets,
  cleanupOldEmailOperationalData,
  createEmailService,
  createNoopEmailService,
  getCapturedFeedback,
  getCapturedPasswordResets,
  getDefaultEmailPreferences,
  signMemberInviteToken,
  signEmailPreferencesToken,
  stripHeaderCRLF,
  verifyEmailPreferencesToken,
  verifyMemberInviteToken,
} from "../../src/lib/email";
import type { Database } from "../../src/db/client";
import { createLocalMarketingDb } from "../../src/db/local-marketing-db";
import { emailUnsubscribeToken } from "../../src/db/marketing-schema";
import { eq } from "drizzle-orm";

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

function makeDb(selectResponses: unknown[][] = [[]]) {
  let selectIndex = 0;
  const insertValues = vi
    .fn()
    .mockImplementation((value: unknown) =>
      typeof value === "object" && value !== null && Array.isArray(value)
        ? { returning: vi.fn().mockResolvedValue(value) }
        : { returning: vi.fn().mockResolvedValue([{ id: "token-row-1" }]) },
    );

  const deleteWhere = vi.fn().mockResolvedValue(undefined);

  const db: Record<string, unknown> = {
    select: vi.fn().mockImplementation(() => {
      const rows =
        selectIndex < selectResponses.length
          ? selectResponses[selectIndex]
          : [];
      selectIndex++;
      return makeSelectBuilder(rows);
    }),
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    delete: vi.fn().mockReturnValue({ where: deleteWhere }),
  };

  return {
    db: db as unknown as Database,
    insertValues,
    deleteWhere,
  };
}

const ENV = {
  APP_URL: "https://app.kaiplan.test",
  PUBLIC_WEB_URL: "https://web.kaiplan.test",
  EMAIL_FROM_ADDRESS: "hello@kaiplan.test",
  EMAIL_REPLY_TO_ADDRESS: "reply@kaiplan.test",
  EMAIL_TOKEN_SECRET: "email-secret",
};

describe("email token helpers", () => {
  it("signs and verifies an email preferences token", async () => {
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "token-123",
        email: "guest@example.com",
        weddingId: "wedding-123",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "super-secret",
    );

    const payload = await verifyEmailPreferencesToken(token, "super-secret");

    expect(payload).toMatchObject({
      kid: "v1",
      tokenId: "token-123",
      email: "guest@example.com",
      weddingId: "wedding-123",
      allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
    });
  });

  it("rejects a token with an invalid signature", async () => {
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "token-123",
        email: "guest@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "super-secret",
    );

    await expect(
      verifyEmailPreferencesToken(token, "different-secret"),
    ).rejects.toThrow("Invalid email preferences token.");
  });

  it("rejects expired email preference tokens", async () => {
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "token-123",
        email: "guest@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2000-04-09T00:00:00.000Z",
      },
      "super-secret",
    );

    await expect(
      verifyEmailPreferencesToken(token, "super-secret"),
    ).rejects.toThrow("Email preferences token has expired.");
  });

  it("rejects signed email preference tokens with invalid payload shape", async () => {
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "bad-payload",
        email: "guest@example.com",
        weddingId: null,
        allowedTypes: ["notAPreference"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      } as never,
      "super-secret",
    );

    await expect(
      verifyEmailPreferencesToken(token, "super-secret"),
    ).rejects.toThrow("Invalid email preferences token.");
  });

  it("rejects signed email preference tokens with missing expiration", async () => {
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "missing-expiration",
        email: "guest@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
      } as never,
      "super-secret",
    );

    await expect(
      verifyEmailPreferencesToken(token, "super-secret"),
    ).rejects.toThrow("Invalid email preferences token.");
  });

  it("rejects signed email preference tokens with invalid expiration dates", async () => {
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "invalid-expiration",
        email: "guest@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "not-a-date",
      },
      "super-secret",
    );

    await expect(
      verifyEmailPreferencesToken(token, "super-secret"),
    ).rejects.toThrow("Email preferences token has expired.");
  });

  it("rejects email preference tokens with extra segments", async () => {
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "extra-segment",
        email: "guest@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "super-secret",
    );

    await expect(
      verifyEmailPreferencesToken(`${token}.extra`, "super-secret"),
    ).rejects.toThrow("Invalid email preferences token.");
  });

  it("verifyEmailPreferencesToken uses constant-time comparison (different-length signatures rejected without early-exit leak)", async () => {
    // We can't directly test timing, but we CAN test that the function still
    // correctly rejects when the signature differs — which exercises the
    // constant-time path. A correct HMAC with right secret should verify;
    // any tampered signature should throw.
    const secret = "timing-test-secret";
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "ct-tok",
        email: "a@b.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      secret,
    );

    // Valid token should resolve.
    const payload = await verifyEmailPreferencesToken(token, secret);
    expect(payload.tokenId).toBe("ct-tok");

    // Tamper with last char of the signature part.
    const parts = token.split(".");
    const tamperedSig =
      parts[1].slice(0, -1) + (parts[1].endsWith("a") ? "b" : "a");
    const tamperedToken = `${parts[0]}.${tamperedSig}`;
    await expect(
      verifyEmailPreferencesToken(tamperedToken, secret),
    ).rejects.toThrow("Invalid email preferences token.");
  });

  it("token payload includes kid field for key rotation support", async () => {
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "kid-test",
        email: "kid@example.com",
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      "secret",
    );

    const payload = await verifyEmailPreferencesToken(token, "secret");
    expect(payload.kid).toBe("v1");
  });

  it("verifyEmailPreferencesToken rejects a token with a completely different signature (constant-time path)", async () => {
    const secret = "another-secret";
    const token = await signEmailPreferencesToken(
      {
        kid: "v1",
        tokenId: "ct-tok-2",
        email: "x@y.com",
        weddingId: "w1",
        allowedTypes: ["rsvpConfirmation"],
        expiresAt: "2099-06-01T00:00:00.000Z",
      },
      secret,
    );

    // Replace the signature entirely with a wrong one.
    const [payload] = token.split(".");
    const forgedToken = `${payload}.wrongsignaturevalue`;
    await expect(
      verifyEmailPreferencesToken(forgedToken, secret),
    ).rejects.toThrow("Invalid email preferences token.");
  });

  it("signs and verifies a member invite token", async () => {
    const token = await signMemberInviteToken(
      {
        kid: "member-invite-v1",
        memberId: "member-123",
        weddingId: "wedding-123",
        email: "guest@example.com",
        role: "viewer",
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "super-secret",
    );

    const payload = await verifyMemberInviteToken(token, "super-secret");

    expect(payload).toMatchObject({
      kid: "member-invite-v1",
      memberId: "member-123",
      weddingId: "wedding-123",
      email: "guest@example.com",
      role: "viewer",
    });
  });

  it("rejects member invite tokens with invalid payload shape", async () => {
    const token = await signMemberInviteToken(
      {
        kid: "wrong-kid",
        memberId: "member-123",
        weddingId: "wedding-123",
        email: "guest@example.com",
        role: "viewer",
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "super-secret",
    );

    await expect(
      verifyMemberInviteToken(token, "super-secret"),
    ).rejects.toThrow("Invalid member invite token.");
  });

  it("rejects expired member invite tokens", async () => {
    const token = await signMemberInviteToken(
      {
        kid: "member-invite-v1",
        memberId: "member-123",
        weddingId: "wedding-123",
        email: "guest@example.com",
        role: "viewer",
        expiresAt: "2000-04-09T00:00:00.000Z",
      },
      "super-secret",
    );

    await expect(
      verifyMemberInviteToken(token, "super-secret"),
    ).rejects.toThrow("Member invite token has expired.");
  });

  it("rejects member invite tokens with extra segments", async () => {
    const token = await signMemberInviteToken(
      {
        kid: "member-invite-v1",
        memberId: "member-123",
        weddingId: "wedding-123",
        email: "guest@example.com",
        role: "viewer",
        expiresAt: "2099-04-09T00:00:00.000Z",
      },
      "super-secret",
    );

    await expect(
      verifyMemberInviteToken(`${token}.extra`, "super-secret"),
    ).rejects.toThrow("Invalid member invite token.");
  });
});

describe("email operational cleanup", () => {
  function makeCleanupSelectBuilder(rows: { id: string }[]) {
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn().mockReturnValue(builder);
    builder.where = vi.fn().mockReturnValue(builder);
    builder.limit = vi.fn().mockResolvedValue(rows);
    return builder;
  }

  it("prunes expired unsubscribe tokens from D1", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const db = {
      select: vi
        .fn()
        .mockImplementation(() => makeCleanupSelectBuilder([{ id: "tok-1" }])),
      delete: vi.fn().mockReturnValue({ where }),
    };

    await cleanupOldEmailOperationalData(db as never);

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it("retains used unsubscribe tokens until they expire", async () => {
    const db = createLocalMarketingDb();
    const activeUsedTokenId = crypto.randomUUID();
    const expiredTokenId = crypto.randomUUID();

    await db.insert(emailUnsubscribeToken).values([
      {
        id: activeUsedTokenId,
        email: `used-${crypto.randomUUID()}@example.com`,
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2099-05-29T00:00:00.000Z",
        usedAt: "2026-05-27T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: expiredTokenId,
        email: `expired-${crypto.randomUUID()}@example.com`,
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2000-05-29T00:00:00.000Z",
        usedAt: null,
        createdAt: "2000-05-01T00:00:00.000Z",
      },
    ]);

    await cleanupOldEmailOperationalData(db);

    await expect(
      db
        .select()
        .from(emailUnsubscribeToken)
        .where(eq(emailUnsubscribeToken.id, activeUsedTokenId)),
    ).resolves.toMatchObject([{ id: activeUsedTokenId }]);
    await expect(
      db
        .select()
        .from(emailUnsubscribeToken)
        .where(eq(emailUnsubscribeToken.id, expiredTokenId)),
    ).resolves.toEqual([]);
  });

  it("skips D1 token cleanup when no rows match", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => makeCleanupSelectBuilder([])),
      delete: vi.fn(),
    };

    await cleanupOldEmailOperationalData(db as never);

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe("getDefaultEmailPreferences", () => {
  it("enables every optional email type by default", () => {
    expect(getDefaultEmailPreferences()).toEqual({
      appLifecycle: true,
      memberInvite: true,
      rsvpConfirmation: true,
      rsvpReminder: true,
    });
  });
});

describe("createEmailService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resendConstructor.mockReset();
  });

  it("sends password reset email and records a successful send", async () => {
    const { db, insertValues } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "reset-123" },
          error: null,
        }),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await service.sendPasswordReset({
      user: { email: "user@example.com", name: "User" },
      url: "https://app.kaiplan.test/reset?token=abc",
      token: "abc",
    });

    expect(resend.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ENV.EMAIL_FROM_ADDRESS,
        replyTo: ENV.EMAIL_REPLY_TO_ADDRESS,
        subject: "Reset your Kaiplan password",
        to: ["user@example.com"],
      }),
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        emailType: "passwordReset",
        status: "sent",
        providerMessageId: "reset-123",
      }),
    );
  });

  it("sends email verification email and records a successful send", async () => {
    const { db, insertValues } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "verify-123" },
          error: null,
        }),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await service.sendEmailVerification({
      user: { email: "user@example.com", name: "User" },
      url: "https://app.kaiplan.test/verify-email?token=abc",
      token: "abc",
    });

    expect(resend.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ENV.EMAIL_FROM_ADDRESS,
        replyTo: ENV.EMAIL_REPLY_TO_ADDRESS,
        subject: "Verify your Kaiplan email",
        to: ["user@example.com"],
        html: expect.stringContaining("Verify email"),
      }),
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        emailType: "emailVerification",
        status: "sent",
        providerMessageId: "verify-123",
      }),
    );
  });

  it("logs failed email verification deliveries before rethrowing", async () => {
    const { db, insertValues } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "verification outage" },
        }),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await expect(
      service.sendEmailVerification({
        user: { email: "user@example.com", name: "User" },
        url: "https://app.kaiplan.test/verify-email?token=abc",
        token: "abc",
      }),
    ).rejects.toThrow("verification outage");

    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        emailType: "emailVerification",
        status: "failed",
        errorMessage: "verification outage",
      }),
    );
  });

  it("logs failed password reset deliveries before rethrowing", async () => {
    const { db, insertValues } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "provider outage" },
        }),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await expect(
      service.sendPasswordReset({
        user: { email: "user@example.com", name: "User" },
        url: "https://app.kaiplan.test/reset?token=abc",
        token: "abc",
      }),
    ).rejects.toThrow("provider outage");

    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        emailType: "passwordReset",
        status: "failed",
        errorMessage: "provider outage",
      }),
    );
  });

  it("uses the default provider failure message when resend does not include one", async () => {
    const { db, insertValues } = makeDb([[], [{ name: "Test Wedding" }]]);
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: {},
        }),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await expect(
      service.sendMemberInvite({
        email: "guest@example.com",
        role: "viewer",
        weddingId: "wedding-1",
        memberId: "member-1",
        invitedBy: {
          email: "owner@example.com",
          name: "Owner",
        },
      }),
    ).rejects.toThrow("Email delivery failed.");

    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "guest@example.com",
        emailType: "memberInvite",
        status: "failed",
        errorMessage: "Email delivery failed.",
      }),
    );
  });

  it("sends a member invite through resend and returns delivery metadata", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "resend-123" },
          error: null,
        }),
      },
    };
    const { db } = makeDb([[], [{ name: "Test Wedding" }]]);
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendMemberInvite({
      email: "guest@example.com",
      role: "viewer",
      weddingId: "wedding-1",
      memberId: "member-1",
      invitedBy: {
        email: "owner@example.com",
        name: "Owner",
      },
    });

    expect(result).toMatchObject({
      emailId: "resend-123",
      status: "sent",
      provider: "resend",
      templateKey: "member-invite",
    });
    expect(resend.emails.send).toHaveBeenCalled();
  });

  it("skips member invite delivery when the recipient opted out", async () => {
    const resend = {
      emails: {
        send: vi.fn(),
      },
    };
    const { db } = makeDb([[{ enabled: false }]]);
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendMemberInvite({
      email: "guest@example.com",
      role: "viewer",
      weddingId: "wedding-1",
      memberId: "member-1",
      invitedBy: {
        email: "owner@example.com",
        name: "Owner",
      },
    });

    expect(result).toMatchObject({
      status: "skipped",
      skipped: true,
      error: null,
    });
    expect(resend.emails.send).not.toHaveBeenCalled();
  });

  it("logs failed invite deliveries before rethrowing", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "provider outage" },
        }),
      },
    };
    const { db, insertValues } = makeDb([[], [{ name: "Test Wedding" }]]);
    const service = createEmailService(db, ENV, resend as never);

    await expect(
      service.sendMemberInvite({
        email: "guest@example.com",
        role: "viewer",
        weddingId: "wedding-1",
        memberId: "member-1",
        invitedBy: {
          email: "owner@example.com",
          name: "Owner",
        },
      }),
    ).rejects.toThrow("provider outage");

    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "guest@example.com",
        emailType: "memberInvite",
        status: "failed",
        errorMessage: "provider outage",
      }),
    );
  });

  it("passes weddingName to the member invite template", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "resend-wn-123" },
          error: null,
        }),
      },
    };
    const { db } = makeDb([[], [{ name: "Ava & Sam's Wedding" }]]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendMemberInvite({
      email: "guest@example.com",
      role: "viewer",
      weddingId: "wedding-1",
      memberId: "member-1",
      invitedBy: {
        email: "owner@example.com",
        name: "Owner",
      },
    });

    const sentHtml = resend.emails.send.mock.calls[0][0].html as string;
    expect(sentHtml).toContain("Ava &amp; Sam&#x27;s Wedding");
  });

  it("does not create an unsubscribe token for member invites", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "resend-no-unsub-123" },
          error: null,
        }),
      },
    };
    const { db, insertValues } = makeDb([[], [{ name: "Test Wedding" }]]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendMemberInvite({
      email: "guest@example.com",
      role: "viewer",
      weddingId: "wedding-1",
      memberId: "member-1",
      invitedBy: {
        email: "owner@example.com",
        name: "Owner",
      },
    });

    // The only insert call should be for emailSendLog (recordSend), not for emailUnsubscribeToken
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        emailType: "memberInvite",
        status: "sent",
      }),
    );
  });

  it("sends RSVP confirmations when preferences allow it", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "confirmation-123" },
          error: null,
        }),
      },
    };
    const { db, insertValues } = makeDb([
      [],
      [],
      [{ publishedSlug: "ava-sam-2026" }],
      [{ firstName: "Ava", lastName: "Rivera", rsvpStatus: "accepted" }],
      [],
      [{ name: "Ava & Sam's Wedding", date: "2026-06-07" }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendRsvpConfirmation({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    expect(resend.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Your RSVP is confirmed — Ava & Sam's Wedding",
        to: ["guest@example.com"],
      }),
    );
    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "guest@example.com",
        emailType: "rsvpConfirmation",
        status: "sent",
        providerMessageId: "confirmation-123",
      }),
    );
  });

  it("deletes previous unused unsubscribe tokens for the same email after inserting a new one", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "confirmation-dedup" },
          error: null,
        }),
      },
    };
    const { db, deleteWhere } = makeDb([
      [],
      [],
      [{ publishedSlug: "ava-sam-2026" }],
      [{ firstName: "Ava", lastName: "Rivera", rsvpStatus: "accepted" }],
      [],
      [{ name: "Ava & Sam's Wedding", date: "2026-06-07" }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendRsvpConfirmation({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    // After inserting the new token, old unused tokens for the same email
    // and weddingId must be deleted so they don't accumulate.
    expect(db.delete).toHaveBeenCalledWith(expect.anything());
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("keeps RSVP confirmation successful when token cleanup fails after delivery", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "confirmation-cleanup-fail" },
          error: null,
        }),
      },
    };
    const { db, deleteWhere, insertValues } = makeDb([
      [],
      [],
      [{ publishedSlug: "ava-sam-2026" }],
      [{ firstName: "Ava", lastName: "Rivera", rsvpStatus: "accepted" }],
      [],
      [{ name: "Ava & Sam's Wedding", date: "2026-06-07" }],
    ]);
    deleteWhere.mockRejectedValueOnce(new Error("cleanup failed"));
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = createEmailService(db, ENV, resend as never);

    await expect(
      service.sendRsvpConfirmation({
        weddingId: "wedding-1",
        primaryGuestId: "guest-1",
        guestEmail: "guest@example.com",
        token: "guest-token",
      }),
    ).resolves.toBeUndefined();

    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        emailType: "rsvpConfirmation",
        status: "sent",
        providerMessageId: "confirmation-cleanup-fail",
      }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[email] preference token cleanup failed:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("skips RSVP confirmations when the recipient opted out", async () => {
    const resend = {
      emails: {
        send: vi.fn(),
      },
    };
    const { db } = makeDb([[{ enabled: false }], []]);
    const service = createEmailService(db, ENV, resend as never);

    await expect(
      service.sendRsvpConfirmation({
        weddingId: "wedding-1",
        primaryGuestId: "guest-1",
        guestEmail: "guest@example.com",
        token: "guest-token",
      }),
    ).resolves.toBeUndefined();

    expect(resend.emails.send).not.toHaveBeenCalled();
  });

  it("logs failed RSVP confirmation deliveries before rethrowing", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "provider outage" },
        }),
      },
    };
    const { db, insertValues } = makeDb([
      [],
      [],
      [{ publishedSlug: "ava-sam-2026" }],
      [{ firstName: "Ava", lastName: "Rivera", rsvpStatus: "accepted" }],
      [],
      [{ name: "Ava & Sam's Wedding", date: "2026-06-07" }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    await expect(
      service.sendRsvpConfirmation({
        weddingId: "wedding-1",
        primaryGuestId: "guest-1",
        guestEmail: "guest@example.com",
        token: "guest-token",
      }),
    ).rejects.toThrow("provider outage");

    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "guest@example.com",
        emailType: "rsvpConfirmation",
        status: "failed",
        errorMessage: "provider outage",
      }),
    );
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("sends email with rsvpUrl: null when publishedSlug is null", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "confirmation-456" },
          error: null,
        }),
      },
    };
    const { db } = makeDb([
      [],
      [],
      [{ publishedSlug: null }],
      [{ firstName: "Ava", lastName: "Rivera", rsvpStatus: "accepted" }],
      [],
      [{ name: "Ava & Sam's Wedding", date: "2026-06-07" }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendRsvpConfirmation({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    expect(resend.emails.send).toHaveBeenCalled();
  });

  it("uses publishedSlug in rsvpUrl when present", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "confirmation-789" },
          error: null,
        }),
      },
    };
    const { db } = makeDb([
      [],
      [],
      [{ publishedSlug: "ava-sam-2026" }],
      [{ firstName: "Ava", lastName: "Rivera", rsvpStatus: "accepted" }],
      [],
      [{ name: "Ava & Sam's Wedding", date: "2026-06-07" }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendRsvpConfirmation({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    const sentHtml = resend.emails.send.mock.calls[0][0].html as string;
    expect(sentHtml).toContain("ava-sam-2026");
    expect(sentHtml).toContain("web.kaiplan.test");
  });

  it("includes correct householdSummary with plus-ones", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "confirmation-abc" },
          error: null,
        }),
      },
    };
    const { db } = makeDb([
      [],
      [],
      [{ publishedSlug: "ava-sam-2026" }],
      [{ firstName: "Ava", lastName: "Rivera", rsvpStatus: "accepted" }],
      [{ firstName: "Sam", lastName: "Rivera", rsvpStatus: "pending" }],
      [{ name: "Ava & Sam's Wedding", date: "2026-06-07" }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendRsvpConfirmation({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    const sentHtml = resend.emails.send.mock.calls[0][0].html as string;
    expect(sentHtml).toContain("Ava Rivera");
    expect(sentHtml).toContain("Sam Rivera");
  });

  it("falls back to pending label when guest rsvpStatus is null", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "confirmation-null-status" },
          error: null,
        }),
      },
    };
    const { db } = makeDb([
      [],
      [],
      [{ publishedSlug: null }],
      [{ firstName: "Ava", lastName: "Rivera", rsvpStatus: null }],
      [{ firstName: "Sam", lastName: "Rivera", rsvpStatus: null }],
      [{ name: "Ava & Sam's Wedding", date: null }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendRsvpConfirmation({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    const sentHtml = resend.emails.send.mock.calls[0][0].html as string;
    expect(sentHtml).toContain("Still deciding");
  });

  it("skips RSVP reminders when the guest has no email address", async () => {
    const resend = {
      emails: {
        send: vi.fn(),
      },
    };
    const { db } = makeDb();
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: null,
      token: "token-1",
    });

    expect(result).toEqual({
      primaryGuestId: "guest-1",
      guestEmail: null,
      status: "skippedMissingEmail",
      emailId: null,
      error: null,
    });
    expect(resend.emails.send).not.toHaveBeenCalled();
  });

  it("skips RSVP reminders when the household token is missing", async () => {
    const resend = {
      emails: {
        send: vi.fn(),
      },
    };
    const { db } = makeDb();
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: null,
    });

    expect(result).toEqual({
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      status: "skippedIneligible",
      emailId: null,
      error: null,
    });
  });

  it("skips RSVP reminders when the recipient opted out", async () => {
    const resend = {
      emails: {
        send: vi.fn(),
      },
    };
    const { db } = makeDb([[{ enabled: false }], []]);
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    expect(result).toEqual({
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      status: "skippedOptedOut",
      emailId: null,
      error: null,
    });
    expect(resend.emails.send).not.toHaveBeenCalled();
  });

  it("returns skippedNoWebsite when publishedSlug is null", async () => {
    const resend = {
      emails: {
        send: vi.fn(),
      },
    };
    const { db } = makeDb([[], [], [{ publishedSlug: null }]]);
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    expect(result).toEqual({
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      status: "skippedNoWebsite",
      emailId: null,
      error: null,
    });
    expect(resend.emails.send).not.toHaveBeenCalled();
  });

  it("uses publishedSlug in rsvpUrl when present", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "reminder-slug-123" },
          error: null,
        }),
      },
    };
    const { db } = makeDb([
      [],
      [],
      [{ publishedSlug: "ava-sam-2026" }],
      [{ firstName: "Ava" }],
      [{ name: "Ava & Sam", date: "2026-06-07" }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    expect(result).toMatchObject({
      status: "sent",
    });
    const sentHtml = resend.emails.send.mock.calls[0][0].html as string;
    expect(sentHtml).toContain("ava-sam-2026");
    expect(sentHtml).toContain("web.kaiplan.test");
  });

  it("returns sent RSVP reminder metadata when delivery succeeds", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "reminder-123" },
          error: null,
        }),
      },
    };
    const { db, insertValues } = makeDb([
      [],
      [],
      [{ publishedSlug: "test-wedding-2026" }],
      [{ firstName: "Guest" }],
      [{ name: "Test Wedding", date: null }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    expect(result).toEqual({
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      status: "sent",
      emailId: "reminder-123",
      error: null,
    });
    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "guest@example.com",
        emailType: "rsvpReminder",
        status: "sent",
        providerMessageId: "reminder-123",
      }),
    );
  });

  it("keeps RSVP reminder successful when token cleanup fails after delivery", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "reminder-cleanup-fail" },
          error: null,
        }),
      },
    };
    const { db, deleteWhere } = makeDb([
      [],
      [],
      [{ publishedSlug: "test-wedding-2026" }],
      [{ firstName: "Guest" }],
      [{ name: "Test Wedding", date: null }],
    ]);
    deleteWhere.mockRejectedValueOnce(new Error("cleanup failed"));
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    expect(result).toMatchObject({
      status: "sent",
      emailId: "reminder-cleanup-fail",
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      "[email] preference token cleanup failed:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("returns failed RSVP reminder metadata when delivery fails", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "provider outage" },
        }),
      },
    };
    const { db, insertValues } = makeDb([
      [],
      [],
      [{ publishedSlug: "test-wedding-2026" }],
      [{ firstName: "Guest" }],
      [{ name: "Test Wedding", date: null }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    expect(result).toEqual({
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      status: "failed",
      emailId: null,
      error: "provider outage",
    });
    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "guest@example.com",
        emailType: "rsvpReminder",
        status: "failed",
        errorMessage: "provider outage",
      }),
    );
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("fails lazily when no resend key is configured for live sends", async () => {
    const { db } = makeDb([[], []]);
    const service = createEmailService(db, {
      ...ENV,
      RESEND_API_KEY: undefined,
    });

    await expect(
      service.sendPasswordReset({
        user: { email: "user@example.com", name: "User" },
        url: "https://app.kaiplan.test/reset?token=abc",
        token: "abc",
      }),
    ).rejects.toThrow("RESEND_API_KEY is required to send email.");
  });

  it("constructs a Resend client when a live API key is configured", async () => {
    const liveClient = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "reset-live-123" },
          error: null,
        }),
      },
    };
    resendConstructor.mockImplementation(function mockResendClient() {
      return liveClient;
    });

    const { db } = makeDb();
    const service = createEmailService(db, {
      ...ENV,
      RESEND_API_KEY: "live-key",
    });

    await service.sendPasswordReset({
      user: { email: "user@example.com", name: "User" },
      url: "https://app.kaiplan.test/reset?token=abc",
      token: "abc",
    });

    expect(resendConstructor).toHaveBeenCalledWith("live-key");
    expect(liveClient.emails.send).toHaveBeenCalled();
  });

  it("records successful sends even when the provider omits a message id", async () => {
    const { db, insertValues } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await service.sendPasswordReset({
      user: { email: "user@example.com", name: "User" },
      url: "https://app.kaiplan.test/reset?token=abc",
      token: "abc",
    });

    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        emailType: "passwordReset",
        status: "sent",
        providerMessageId: null,
      }),
    );
  });

  it("normalizes non-error password reset failures before rethrowing", async () => {
    const { db, insertValues } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockRejectedValue("provider outage"),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await expect(
      service.sendPasswordReset({
        user: { email: "user@example.com", name: "User" },
        url: "https://app.kaiplan.test/reset?token=abc",
        token: "abc",
      }),
    ).rejects.toThrow("Email delivery failed.");

    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        emailType: "passwordReset",
        status: "failed",
        errorMessage: "Email delivery failed.",
      }),
    );
  });

  it("normalizes non-error RSVP reminder failures", async () => {
    const { db, insertValues } = makeDb([
      [],
      [],
      [{ publishedSlug: "test-wedding-2026" }],
      [{ firstName: "Guest" }],
      [{ name: "Test Wedding", date: null }],
    ]);
    const resend = {
      emails: {
        send: vi.fn().mockRejectedValue("provider outage"),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    const result = await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    expect(result).toEqual({
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      status: "failed",
      emailId: null,
      error: "Email delivery failed.",
    });
    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "guest@example.com",
        emailType: "rsvpReminder",
        status: "failed",
        errorMessage: "Email delivery failed.",
      }),
    );
  });

  it("sends a trial ending reminder and records the send", async () => {
    const { db, insertValues } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "trial-ending-123" },
          error: null,
        }),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await service.sendTrialEndingReminder({
      email: "trial@example.com",
      name: "Alex",
      planName: "Pro",
      trialStartedOn: "April 20, 2026",
      chargeOn: "May 20, 2026",
      amountLabel: "$35.00/month",
      manageBillingUrl: "https://app.kaiplan.test/settings",
    });

    const callArgs = resend.emails.send.mock.calls[0]?.[0] as {
      subject: string;
      html: string;
      to: string[];
    };
    expect(callArgs.to).toEqual(["trial@example.com"]);
    expect(callArgs.subject).toBe("Your Pro trial ends on May 20, 2026");
    expect(callArgs.html).toContain("trial started on <!-- -->April 20, 2026");
    expect(callArgs.html).toContain(
      "we&#x27;ll automatically charge <!-- -->$35.00/month",
    );
    expect(callArgs.html).toContain("https://app.kaiplan.test/settings");
    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "trial@example.com",
        emailType: "trialEndingReminder",
        status: "sent",
        providerMessageId: "trial-ending-123",
      }),
    );
  });

  it("sends a subscribe nudge with List-Unsubscribe headers", async () => {
    const { db, insertValues } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "subscribe-123" },
          error: null,
        }),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await service.sendSubscribeNudge({
      email: "subscribe@example.com",
      name: "Alex",
      stepKey: "subscribe-day-4",
      subjectFocus: "guest list",
      body: "Your guest list can become the source of truth.",
      ctaLabel: "Start your trial",
      subscribeUrl: "https://app.kaiplan.test/subscribe",
      manageEmailPrefsUrl:
        "https://app.kaiplan.test/email-preferences?token=abc",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      headers?: Record<string, string>;
      subject: string;
    };
    expect(callArgs.subject).toBe("Keep your guest list moving in Kaiplan");
    expect(callArgs.headers?.["List-Unsubscribe"]).toBe(
      "<https://app.kaiplan.test/api/public/email/preferences/abc>",
    );
    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "subscribe@example.com",
        emailType: "subscribe-day-4",
        status: "sent",
        providerMessageId: "subscribe-123",
      }),
    );
  });

  it("uses the API origin for one-click unsubscribe headers when app and API origins differ", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "subscribe-123" },
          error: null,
        }),
      },
    };
    const service = createEmailService(
      db,
      {
        ...ENV,
        APP_URL: "https://my.kaiplan.app",
        BETTER_AUTH_URL: "https://api.kaiplan.app",
      },
      resend as never,
    );

    await service.sendSubscribeNudge({
      email: "subscribe@example.com",
      name: "Alex",
      stepKey: "subscribe-day-4",
      subjectFocus: "guest list",
      body: "Your guest list can become the source of truth.",
      ctaLabel: "Start your trial",
      subscribeUrl: "https://my.kaiplan.app/subscribe",
      manageEmailPrefsUrl:
        "https://my.kaiplan.app/email-preferences?token=abc",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      headers?: Record<string, string>;
    };
    expect(callArgs.headers?.["List-Unsubscribe"]).toBe(
      "<https://api.kaiplan.app/api/public/email/preferences/abc>",
    );
  });

  it("sends a trial activation nudge with List-Unsubscribe headers", async () => {
    const { db, insertValues } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "trial-activation-123" },
          error: null,
        }),
      },
    };
    const service = createEmailService(db, ENV, resend as never);

    await service.sendTrialActivationNudge({
      email: "trial@example.com",
      name: "Alex",
      stepKey: "trial-day-10",
      featureFocus: "vendor planning",
      body: "Compare quotes while your trial is open.",
      ctaLabel: "Open vendors",
      dashboardUrl: "https://app.kaiplan.test/vendors",
      manageEmailPrefsUrl:
        "https://app.kaiplan.test/email-preferences?token=abc",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      headers?: Record<string, string>;
      subject: string;
    };
    expect(callArgs.subject).toBe(
      "Try vendor planning while your trial is open",
    );
    expect(callArgs.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(callArgs.headers?.["List-Unsubscribe"]).toBe(
      "<https://app.kaiplan.test/api/public/email/preferences/abc>",
    );
    expect(insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "trial@example.com",
        emailType: "trial-day-10",
        status: "sent",
        providerMessageId: "trial-activation-123",
      }),
    );
  });
});

describe("createNoopEmailService", () => {
  beforeEach(() => {
    clearCapturedPasswordResets();
  });

  it("returns undefined for password reset sends and captures the reset url", async () => {
    const service = createNoopEmailService();

    await expect(
      service.sendPasswordReset({
        user: { email: "user@example.com", name: "User" },
        url: "https://app.kaiplan.test/reset?token=abc",
        token: "abc",
      }),
    ).resolves.toBeUndefined();

    const captured = getCapturedPasswordResets();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      email: "user@example.com",
      url: "https://app.kaiplan.test/reset?token=abc",
      token: "abc",
    });

    clearCapturedPasswordResets();
    expect(getCapturedPasswordResets()).toHaveLength(0);
  });

  it("returns skipped metadata for invite sends", async () => {
    const service = createNoopEmailService();

    await expect(
      service.sendMemberInvite({
        email: "guest@example.com",
        role: "viewer",
        weddingId: "wedding-1",
        memberId: "member-1",
        invitedBy: { email: "owner@example.com", name: "Owner" },
      }),
    ).resolves.toMatchObject({
      status: "skipped",
      skipped: true,
    });
  });

  it("returns undefined for email verification sends", async () => {
    const service = createNoopEmailService();

    await expect(
      service.sendEmailVerification({
        user: { email: "user@example.com", name: "User" },
        url: "https://app.kaiplan.test/verify-email?token=abc",
        token: "abc",
      }),
    ).resolves.toBeUndefined();
  });

  it("returns undefined for RSVP confirmation sends", async () => {
    const service = createNoopEmailService();

    await expect(
      service.sendRsvpConfirmation({
        weddingId: "wedding-1",
        primaryGuestId: "guest-1",
        guestEmail: "guest@example.com",
        token: "guest-token",
      }),
    ).resolves.toBeUndefined();
  });

  it("returns sent reminder metadata when both email and token are present", async () => {
    const service = createNoopEmailService();

    await expect(
      service.sendRsvpReminder({
        weddingId: "wedding-1",
        primaryGuestId: "guest-1",
        guestEmail: "guest@example.com",
        token: "guest-token",
      }),
    ).resolves.toEqual({
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      status: "sent",
      emailId: null,
      error: null,
    });
  });

  it("returns skipped reminder metadata when input is incomplete", async () => {
    const service = createNoopEmailService();

    await expect(
      service.sendRsvpReminder({
        weddingId: "wedding-1",
        primaryGuestId: "guest-1",
        guestEmail: null,
        token: null,
      }),
    ).resolves.toEqual({
      primaryGuestId: "guest-1",
      guestEmail: null,
      status: "skippedMissingEmail",
      emailId: null,
      error: null,
    });
  });

  it("sendFeedback on noop service resolves without throwing", async () => {
    const service = createNoopEmailService();
    await expect(
      service.sendFeedback({ message: "test feedback" }),
    ).resolves.toBeUndefined();
  });

  it("sendFeedback on noop service captures the submission", async () => {
    clearCapturedFeedback();
    const service = createNoopEmailService();
    await service.sendFeedback({
      message: "my feedback",
      email: "user@example.com",
      pageUrl: "https://app.kaiplan.test/dashboard",
    });
    const captured = getCapturedFeedback();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      message: "my feedback",
      email: "user@example.com",
      pageUrl: "https://app.kaiplan.test/dashboard",
    });
  });

  it("returns undefined for trial ending reminders", async () => {
    const service = createNoopEmailService();

    await expect(
      service.sendTrialEndingReminder({
        email: "trial@example.com",
        name: "Alex",
        planName: "Pro",
        trialStartedOn: "April 20, 2026",
        chargeOn: "May 20, 2026",
        amountLabel: "$35.00/month",
        manageBillingUrl: "https://app.kaiplan.test/settings",
      }),
    ).resolves.toBeUndefined();
  });

  it("returns undefined for lifecycle nudges", async () => {
    const service = createNoopEmailService();

    await expect(
      service.sendSubscribeNudge({
        email: "subscribe@example.com",
        name: "Alex",
        stepKey: "subscribe-day-1",
        subjectFocus: "wedding plan",
        body: "Start planning.",
        ctaLabel: "Start trial",
        subscribeUrl: "https://app.kaiplan.test/subscribe",
        manageEmailPrefsUrl:
          "https://app.kaiplan.test/email-preferences?token=abc",
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.sendTrialActivationNudge({
        email: "trial@example.com",
        name: "Alex",
        stepKey: "trial-day-2",
        featureFocus: "guest planning",
        body: "Try guests.",
        ctaLabel: "Open guests",
        dashboardUrl: "https://app.kaiplan.test/guests",
        manageEmailPrefsUrl:
          "https://app.kaiplan.test/email-preferences?token=abc",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("createEmailService - sendFeedback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resendConstructor.mockReset();
  });

  it("calls sendMessage with correct subject prefix and replyTo set to sender email", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: "fb-1" }, error: null }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    await service.sendFeedback({
      message: "Love the guest list feature!",
      email: "user@example.com",
      pageUrl: "https://app.kaiplan.test/guests",
    });

    expect(resend.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["operator@ventoralabs.com"],
        subject: expect.stringContaining("[Kaiplan feedback]"),
        replyTo: "user@example.com",
      }),
    );
  });

  it("omits replyTo when no email provided", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: "fb-2" }, error: null }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    await service.sendFeedback({ message: "Just a quick note" });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      replyTo?: string;
      html: string;
      subject: string;
    };
    expect(callArgs.replyTo).toBeUndefined();
    expect(callArgs.html).toContain("not provided");
  });

  it("includes message and page URL in the email body", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: "fb-3" }, error: null }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    await service.sendFeedback({
      message: "The budget module is amazing",
      pageUrl: "https://app.kaiplan.test/budget",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as { html: string };
    expect(callArgs.html).toContain("The budget module is amazing");
    expect(callArgs.html).toContain("https://app.kaiplan.test/budget");
  });

  it("truncates long messages in the subject line to 60 chars", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: "fb-4" }, error: null }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    const longMessage = "A".repeat(100);
    await service.sendFeedback({ message: longMessage });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      subject: string;
    };
    const subjectPart = callArgs.subject.replace("[Kaiplan feedback] ", "");
    expect(subjectPart.length).toBeLessThanOrEqual(60);
  });

  it("M6: strips CR/LF from subject (does not HTML-encode angle brackets — HTML encoding in subjects produces visible &lt;)", async () => {
    // M6 uses stripHeaderCRLF on the subject to prevent header injection.
    // HTML encoding is intentionally NOT applied to the subject because it
    // would render as literal "&lt;script&gt;" in the recipient's email client.
    // Angle brackets are harmless in the Subject header — only CR/LF are dangerous.
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi
          .fn()
          .mockResolvedValue({ data: { id: "fb-esc" }, error: null }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    await service.sendFeedback({ message: "<script>alert('xss')</script>" });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      subject: string;
    };
    // Subject must not contain CR/LF (header injection prevention).
    expect(callArgs.subject).not.toMatch(/[\r\n]/);
    // The subject line includes [Kaiplan feedback] prefix.
    expect(callArgs.subject).toContain("[Kaiplan feedback]");
  });

  it("throws when FEEDBACK_RECIPIENT_EMAIL is not configured", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi.fn(),
      },
    };
    const env = { ...ENV };
    const service = createEmailService(db, env, resend as never);
    await expect(service.sendFeedback({ message: "test" })).rejects.toThrow(
      "FEEDBACK_RECIPIENT_EMAIL is not configured.",
    );
  });

  it("throws when resend returns an error for sendFeedback", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "resend outage" },
        }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    await expect(service.sendFeedback({ message: "test" })).rejects.toThrow(
      "resend outage",
    );
  });

  it("escapes HTML special characters in message, email, and pageUrl", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi
          .fn()
          .mockResolvedValue({ data: { id: "fb-escape" }, error: null }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    await service.sendFeedback({
      message: "<script>alert('xss')</script>",
      email: "user<test>@example.com",
      pageUrl: "https://example.com/<path>",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as { html: string };
    expect(callArgs.html).toContain("&lt;script&gt;");
    expect(callArgs.html).toContain("alert(&#x27;xss&#x27;)");
    expect(callArgs.html).toContain("&lt;/script&gt;");
    expect(callArgs.html).not.toContain("<script>");
    expect(callArgs.html).toContain("user&lt;test&gt;@example.com");
    expect(callArgs.html).toContain("https://example.com/&lt;path&gt;");
  });

  it("converts newlines in message to <br> after HTML escaping", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi
          .fn()
          .mockResolvedValue({ data: { id: "fb-newline" }, error: null }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    await service.sendFeedback({
      message: "line1\n<b>line2</b>",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as { html: string };
    expect(callArgs.html).toContain("line1<br>&lt;b&gt;line2&lt;/b&gt;");
  });

  it("M6: sendFeedback strips CR/LF from subject to prevent header injection", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi
          .fn()
          .mockResolvedValue({ data: { id: "fb-crlf" }, error: null }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    await service.sendFeedback({
      message: "injected\r\nBcc: attacker@evil.com",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      subject: string;
    };
    // CR/LF must be stripped — no raw newlines in the subject header.
    expect(callArgs.subject).not.toMatch(/[\r\n]/);
  });

  it("M6: sendFeedback strips CR/LF from replyTo when email contains injection attempt", async () => {
    const { db } = makeDb();
    const resend = {
      emails: {
        send: vi
          .fn()
          .mockResolvedValue({ data: { id: "fb-crlf-rt" }, error: null }),
      },
    };
    const env = {
      ...ENV,
      FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
    };
    const service = createEmailService(db, env, resend as never);
    await service.sendFeedback({
      message: "hello",
      email: "attacker@evil.com\r\nBcc: other@evil.com",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      replyTo?: string;
    };
    if (callArgs.replyTo !== undefined) {
      expect(callArgs.replyTo).not.toMatch(/[\r\n]/);
    }
  });
});

describe("stripHeaderCRLF helper", () => {
  it("M6: replaces CR with a space", () => {
    expect(stripHeaderCRLF("hello\rworld")).toBe("hello world");
  });

  it("M6: replaces LF with a space", () => {
    expect(stripHeaderCRLF("hello\nworld")).toBe("hello world");
  });

  it("M6: replaces CRLF sequence with spaces", () => {
    expect(stripHeaderCRLF("header: value\r\nBcc: attacker@evil.com")).toBe(
      "header: value  Bcc: attacker@evil.com",
    );
  });

  it("M6: returns a string without CR/LF unchanged", () => {
    expect(stripHeaderCRLF("normal subject")).toBe("normal subject");
  });
});

describe("createEmailService - M7 List-Unsubscribe headers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resendConstructor.mockReset();
  });

  it("M7: RSVP confirmation includes List-Unsubscribe headers for Gmail bulk-sender compliance", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "confirmation-unsub" },
          error: null,
        }),
      },
    };
    const { db } = makeDb([
      [],
      [],
      [{ publishedSlug: "ava-sam-2026" }],
      [{ firstName: "Ava", lastName: "Rivera", rsvpStatus: "accepted" }],
      [],
      [{ name: "Ava & Sam's Wedding", date: "2026-06-07" }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendRsvpConfirmation({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      headers?: Record<string, string>;
    };
    // The manage-preferences URL is built from the token stored in the DB
    // (insertValues mock returns { id: "token-row-1" }). When the token is
    // present, List-Unsubscribe must be set.
    expect(callArgs.headers).toBeDefined();
    expect(callArgs.headers?.["List-Unsubscribe"]).toMatch(/^<https?:/);
    expect(callArgs.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("M7: RSVP reminder includes List-Unsubscribe headers for Gmail bulk-sender compliance", async () => {
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: { id: "reminder-unsub" },
          error: null,
        }),
      },
    };
    const { db } = makeDb([
      [],
      [],
      [{ publishedSlug: "ava-sam-2026" }],
      [{ firstName: "Ava" }],
      [{ name: "Ava & Sam", date: "2026-06-07" }],
    ]);
    const service = createEmailService(db, ENV, resend as never);

    await service.sendRsvpReminder({
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guestEmail: "guest@example.com",
      token: "guest-token",
    });

    const callArgs = resend.emails.send.mock.calls[0][0] as {
      headers?: Record<string, string>;
    };
    expect(callArgs.headers).toBeDefined();
    expect(callArgs.headers?.["List-Unsubscribe"]).toMatch(/^<https?:/);
    expect(callArgs.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });
});
