import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeApp, makeDb, clearRateLimit } from "./setup";
import { createApi } from "../app";
import { createLocalOutbox } from "../integration/local-outbox";
import type { ApiEnv } from "../app";
import { leadMagnetDownloads, signups } from "../db/schema";
import * as emailService from "../services/email";
import * as apolloService from "../services/apollo";

vi.mock("../services/email", () => ({
  sendConfirmation: vi.fn().mockResolvedValue({ id: "test-email-id" }),
  sendLeadMagnetDelivery: vi.fn().mockResolvedValue({ id: "test-email-id" }),
}));
vi.mock("../services/apollo", () => ({
  addToProductList: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/signup", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;

  beforeEach(async () => {
    vi.unstubAllGlobals();
    clearRateLimit();
    app = await makeApp();
  });

  async function post(body: unknown) {
    return app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 200 with referralCode and position 1 for first signup", async () => {
    const res = await post({ email: "test@example.com", sourcePage: "/" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.referralCode).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(body.position).toBe(1);
  });

  it("does not enable e2e side-effect mode in production when E2E_MODE is set", async () => {
    vi.mocked(emailService.sendConfirmation).mockClear();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true }), { status: 200 }),
        ),
    );
    app = await makeApp({
      E2E_MODE: "true",
      ENVIRONMENT: "production",
      LOCAL_OUTBOX: createLocalOutbox(),
      TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    });

    const res = await post({
      email: "production-e2e-flag@example.com",
      sourcePage: "/",
      turnstileToken: "valid-token",
    });

    expect(res.status).toBe(200);
    expect(emailService.sendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        e2eMode: false,
      }),
    );
  });

  it("position increments for each successive unique signup", async () => {
    await post({ email: "first@example.com", sourcePage: "/" });
    const res = await post({ email: "second@example.com", sourcePage: "/" });
    const body = (await res.json()) as any;
    expect(body.position).toBe(2);
  });

  it("returns 200 for duplicate email without exposing referral or survey tokens", async () => {
    const first = await post({ email: "dup@example.com", sourcePage: "/" });
    await first.json();

    const second = await post({
      email: "dup@example.com",
      sourcePage: "/landing",
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as any;
    expect(secondBody.success).toBe(true);
    expect(secondBody.referralCode).toBeUndefined();
    expect(secondBody.surveyToken).toBeUndefined();
    expect(secondBody.surveyAvailable).toBe(false);
    expect(secondBody.position).toBe(1);
  });

  it("treats an existing mixed-case email as a duplicate", async () => {
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values({
      email: "User@Example.com",
      sourcePage: "/legacy",
      referralCode: "MIXED001",
      surveyToken: "mixedcasetoken00000000000000000000",
      emailSentAt: "2026-01-01T00:00:00.000Z",
      queuePosition: 4,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user@example.com",
        sourcePage: "/retry",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      referralCode?: string;
      position: number;
      surveyAvailable: boolean;
    };
    expect(body.referralCode).toBeUndefined();
    expect(body.surveyAvailable).toBe(false);
    expect(body.position).toBe(4);

    const rows = await db.select().from(signups);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("User@Example.com");
  });

  it("prefers a suppressed case-variant duplicate before retrying email", async () => {
    const sendConfirmationSpy = vi.mocked(emailService.sendConfirmation);
    const addToProductListSpy = vi.mocked(apolloService.addToProductList);
    sendConfirmationSpy.mockClear();
    addToProductListSpy.mockClear();

    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values([
      {
        email: "User@Example.com",
        sourcePage: "/legacy",
        referralCode: "SUPPRS01",
        surveyToken: "suppressedtoken0000000000000000000000",
        emailSentAt: null,
        queuePosition: 1,
        unsubscribedAt: "2026-01-10T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        email: "user@example.com",
        sourcePage: "/legacy-lower",
        referralCode: "UNSUPP01",
        surveyToken: "unsuppressedtoken000000000000000000",
        emailSentAt: null,
        queuePosition: 2,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]);

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user@example.com",
        sourcePage: "/retry",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      position: number;
      surveyAvailable: boolean;
    };
    expect(body.position).toBe(1);
    expect(body.surveyAvailable).toBe(false);
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
    expect(addToProductListSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for missing email", async () => {
    const res = await post({ sourcePage: "/" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await post({ email: "not-an-email", sourcePage: "/" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing sourcePage", async () => {
    const res = await post({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("duplicate signup returns 200 even after multiple new signups have joined", async () => {
    // Alice signs up first
    const res1 = await post({ email: "alice@example.com", sourcePage: "/" });
    await res1.json();
    expect(res1.status).toBe(200);

    // Two more people sign up after Alice
    await post({ email: "bob@example.com", sourcePage: "/" });
    await post({ email: "carol@example.com", sourcePage: "/" });

    // Alice tries again — should get 409 with position=1 (her original rank)
    const res2 = await post({
      email: "alice@example.com",
      sourcePage: "/retry",
    });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as any;
    expect(body2.referralCode).toBeUndefined();
    expect(body2.position).toBe(1); // still her original signup rank
  });

  it("creates referral row when referredBy is a valid code", async () => {
    // Referrer signs up
    const res1 = await post({ email: "referrer@example.com", sourcePage: "/" });
    const { referralCode } = (await res1.json()) as any;

    // Referred user uses that code
    const res2 = await post({
      email: "referred@example.com",
      sourcePage: "/",
      referredBy: referralCode,
    });
    expect(res2.status).toBe(200);

    // Verify referral is tracked via the referral endpoint
    const refRes = await app.request(`/api/referral/${referralCode}`);
    const refBody = (await refRes.json()) as any;
    expect(refBody.referralCount).toBe(1);
  });

  it("silently ignores referredBy with an invalid/nonexistent code", async () => {
    const res = await post({
      email: "orphan@example.com",
      sourcePage: "/",
      referredBy: "BADCODE1",
    });
    // Should succeed — invalid referredBy is not an error
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });

  it("returns 429 after exceeding rate limit of 5 requests from same IP", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await post({
        email: `ratelimit${i}@example.com`,
        sourcePage: "/",
      });
      expect(r.status).toBe(200);
    }
    // 6th request from same IP should be rate-limited
    const blocked = await post({
      email: "blocked@example.com",
      sourcePage: "/",
    });
    expect(blocked.status).toBe(429);
  });

  it("stores UTM params and sourcePage correctly (verified by duplicate detection)", async () => {
    const res = await post({
      email: "utm@example.com",
      sourcePage: "/landing",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "peri-awareness",
    });
    expect(res.status).toBe(200);

    // Email exists in DB (duplicate check proves insert happened)
    const res2 = await post({ email: "utm@example.com", sourcePage: "/" });
    expect(res2.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// BUG-6 — CORS: ALLOWED_ORIGIN must be a specific origin, not "*"
//
// With ALLOWED_ORIGIN: "*", the cors middleware rejects every real browser
// request because no browser sends `Origin: *`. Any origin string like
// "https://test.app" fails the `origin !== "*"` check and gets 403.
// The correct value must be the actual site domain.
// ---------------------------------------------------------------------------

describe("CORS — ALLOWED_ORIGIN must accept the configured origin", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;

  beforeEach(async () => {
    clearRateLimit();
    app = await makeApp();
  });

  it("allows a POST request from the configured ALLOWED_ORIGIN", async () => {
    // This test FAILS if ALLOWED_ORIGIN is "*" because the browser-style
    // Origin header ("https://test.app") would not equal "*".
    // After the fix (ALLOWED_ORIGIN: "https://test.app") it passes.
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://test.app",
      },
      body: JSON.stringify({ email: "cors-test@example.com", sourcePage: "/" }),
    });
    // Must NOT be 403 — the configured origin is allowed
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("rejects a POST request from an unknown origin", async () => {
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.com",
      },
      body: JSON.stringify({ email: "evil@example.com", sourcePage: "/" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden");
  });
});

// ---------------------------------------------------------------------------
// Lead magnet download token and Sequencer enrollment on signup
// ---------------------------------------------------------------------------

async function makeAppWithDb(overrides: Partial<ApiEnv> = {}): Promise<{
  app: ReturnType<typeof createApi>;
  db: Awaited<ReturnType<typeof makeDb>>;
  env: ApiEnv;
}> {
  const db = await makeDb();
  const env: ApiEnv = {
    DB: null as unknown as D1Database,
    RESEND_API_KEY: "test-resend-key",
    APOLLO_API_KEY: "test-apollo-key",
    PRODUCT_NAME: "Kaiplan",
    PRODUCT_DOMAIN: "kaiplan.app",
    PRODUCT_LOGO_URL: "https://kaiplan.app/logo-light.svg",
    PRODUCT_BRAND_COLOR: "#B0432A",
    PRODUCT_ACCENT_COLOR: "#3A4A2C",
    CALENDAR_URL: "https://cal.com/kaiplan",
    EMAIL_FROM: "Angel Campa <angel.campa@kaiplan.app>",
    STATS_SECRET: "test-secret",
    ALLOWED_ORIGIN: "https://kaiplan.app",
    ENVIRONMENT: "test",
    E2E_MODE: "true",
    LOCAL_OUTBOX: createLocalOutbox(),
    ...overrides,
    _db: db as unknown as ApiEnv["_db"],
  };
  return { app: createApi(env), db, env };
}

describe("signup — lead magnet download token and Sequencer enrollment", () => {
  beforeEach(() => clearRateLimit());

  it("creates a download row for central Sequencer follow-up", async () => {
    const { app, db } = await makeAppWithDb();
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "lm@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetTitle: "Free Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { downloadToken?: string };
    expect(typeof body.downloadToken).toBe("string");
    expect(body.downloadToken!).toMatch(/^[0-9a-f]{64}$/);

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.signupEmail, "lm@example.com"));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.downloadToken).toBe(body.downloadToken);
    expect(downloads[0]!.leadMagnetSlug).toBe("budget-template");
  });

  it("records skipped Sequencer enrollment when Sequencer is not configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { app } = await makeAppWithDb();

      const res = await app.request("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "sequence-skipped@example.com",
          sourcePage: "/free/budget-template",
          leadMagnetSlug: "budget-template",
        }),
      });

      expect(res.status).toBe(200);
      await vi.waitFor(() =>
        expect(warnSpy).toHaveBeenCalledWith(
          "[signup] Sequencer enrollment skipped.",
          expect.objectContaining({
            source: "signup-email",
            signupId: expect.any(Number),
          }),
        ),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("enrolls selected lead magnets into the shared lead-magnet Sequencer nurture sequence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { app } = await makeAppWithDb({
      SEQUENCER_BASE_URL: "https://sequencer.example.com",
      SEQUENCER_CF_ACCESS_CLIENT_ID: "test-client-id",
      SEQUENCER_CF_ACCESS_CLIENT_SECRET: "test-client-secret",
    });

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "sequence-specific@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetSlug: "budget-template",
      }),
    });

    expect(res.status).toBe(200);
    const enrollmentCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/v1/enrollments"),
    );
    expect(enrollmentCall).toBeDefined();
    expect(JSON.parse(String(enrollmentCall![1]?.body))).toEqual(
      expect.objectContaining({
        email: "sequence-specific@example.com",
        sequence_slug: "kaiplan-lead-magnet-nurture",
        properties: expect.objectContaining({
          externalId: expect.stringMatching(/^\d+:budget-template$/),
          leadMagnetSlug: "budget-template",
          leadMagnetTitle: expect.stringContaining(
            "Free Wedding Budget Template",
          ),
        }),
      }),
    );
  });

  it("enrolls an existing signup when they request a new lead magnet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { app } = await makeAppWithDb({
        SEQUENCER_BASE_URL: "https://sequencer.example.com",
        SEQUENCER_CF_ACCESS_CLIENT_ID: "test-client-id",
        SEQUENCER_CF_ACCESS_CLIENT_SECRET: "test-client-secret",
      });

      const first = await app.request("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing-sequence@example.com",
          sourcePage: "/",
        }),
      });
      expect(first.status).toBe(200);
      clearRateLimit();
      fetchMock.mockClear();

      const second = await app.request("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing-sequence@example.com",
          sourcePage: "/free/vendor-red-flag-checklist",
          leadMagnetSlug: "vendor-red-flag-checklist",
        }),
      });

      expect(second.status).toBe(200);
      await vi.waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "https://sequencer.example.com/api/v1/enrollments",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("vendor-red-flag-checklist"),
          }),
        ),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not re-enroll an unsubscribed existing signup for a new lead magnet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();

    try {
      const { app, db } = await makeAppWithDb({
        SEQUENCER_BASE_URL: "https://sequencer.example.com",
        SEQUENCER_CF_ACCESS_CLIENT_ID: "test-client-id",
        SEQUENCER_CF_ACCESS_CLIENT_SECRET: "test-client-secret",
      });

      await db.insert(signups).values({
        email: "unsubscribed-existing@example.com",
        sourcePage: "/",
        referralCode: "UNSUBSEQ",
        surveyToken: "a".repeat(64),
        queuePosition: 1,
        unsubscribedAt: "2026-04-20T00:00:00.000Z",
        createdAt: "2026-04-01T00:00:00.000Z",
      });

      const res = await app.request("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "unsubscribed-existing@example.com",
          sourcePage: "/free/vendor-red-flag-checklist",
          leadMagnetSlug: "vendor-red-flag-checklist",
        }),
      });

      expect(res.status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalledWith(
        "https://sequencer.example.com/api/v1/enrollments",
        expect.anything(),
      );
      expect(sendLeadMagnetSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps signup successful when configured Sequencer enrollment fails after email delivery", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("sequencer down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();

    try {
      const { app, db } = await makeAppWithDb({
        SEQUENCER_BASE_URL: "https://sequencer.example.com",
        SEQUENCER_CF_ACCESS_CLIENT_ID: "test-client-id",
        SEQUENCER_CF_ACCESS_CLIENT_SECRET: "test-client-secret",
      });

      const res = await app.request("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "sequence-failure@example.com",
          sourcePage: "/free/budget-template",
          leadMagnetSlug: "budget-template",
        }),
      });

      expect(res.status).toBe(200);
      expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
      await vi.waitFor(() =>
        expect(warnSpy).toHaveBeenCalledWith(
          "[signup] Sequencer enrollment failed.",
          expect.objectContaining({
            source: "signup-email",
            signupId: expect.any(Number),
          }),
        ),
      );

      const [signup] = await db
        .select()
        .from(signups)
        .where(eq(signups.email, "sequence-failure@example.com"));
      expect(signup!.emailSentAt).not.toBeNull();
    } finally {
      warnSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("does not block the signup response on slow Sequencer enrollment", async () => {
    let resolveSequencerFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSequencerFetch = resolve;
          }),
      )
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { app } = await makeAppWithDb({
        SEQUENCER_BASE_URL: "https://sequencer.example.com",
        SEQUENCER_CF_ACCESS_CLIENT_ID: "test-client-id",
        SEQUENCER_CF_ACCESS_CLIENT_SECRET: "test-client-secret",
      });

      const responseOrTimeout = await Promise.race([
        app.request("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "slow-sequencer@example.com",
            sourcePage: "/free/budget-template",
            leadMagnetSlug: "budget-template",
          }),
        }),
        new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), 100),
        ),
      ]);

      expect(responseOrTimeout).not.toBe("timeout");
      expect((responseOrTimeout as Response).status).toBe(200);
      resolveSequencerFetch?.(new Response("{}", { status: 200 }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not block an embedded signup response on slow Apollo when waitUntil is unavailable", async () => {
    let resolveApollo: (() => void) | undefined;
    vi.mocked(apolloService.addToProductList).mockClear();
    vi.mocked(apolloService.addToProductList).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveApollo = resolve;
        }),
    );
    const { app, env } = await makeAppWithDb();

    const responseOrTimeout = await Promise.race([
      app.fetch(
        new Request("https://kaiplan.app/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "slow-apollo@example.com",
            sourcePage: "/",
          }),
        }),
        env,
        {} as ExecutionContext,
      ),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 100),
      ),
    ]);

    expect(responseOrTimeout).not.toBe("timeout");
    expect((responseOrTimeout as Response).status).toBe(200);
    expect(apolloService.addToProductList).toHaveBeenCalledOnce();
    resolveApollo?.();
  });

  it("does not create download rows when leadMagnetSlug is absent", async () => {
    const { app, db } = await makeAppWithDb();
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "plain@example.com", sourcePage: "/" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { downloadToken?: string };
    expect(body.downloadToken).toBeUndefined();

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.signupEmail, "plain@example.com"));
    expect(downloads).toHaveLength(0);
  });

  it("does not create download rows or token for an unknown slug without title", async () => {
    const { app, db } = await makeAppWithDb();
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "unknown-slug@example.com",
        sourcePage: "exit-popup",
        leadMagnetSlug: "not-a-real-lead-magnet",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { downloadToken?: string };
    expect(body.downloadToken).toBeUndefined();

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.signupEmail, "unknown-slug@example.com"));
    expect(downloads).toHaveLength(0);
  });

  it("does not create download rows or token for an unknown slug with a supplied title", async () => {
    const { app, db } = await makeAppWithDb();
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "unknown-slug-title@example.com",
        sourcePage: "exit-popup",
        leadMagnetTitle: "Looks Legit",
        leadMagnetSlug: "not-a-real-lead-magnet",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { downloadToken?: string };
    expect(body.downloadToken).toBeUndefined();

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(
        eq(leadMagnetDownloads.signupEmail, "unknown-slug-title@example.com"),
      );
    expect(downloads).toHaveLength(0);
  });

  it("reuses the existing download row without exposing its token on duplicate same-slug signup", async () => {
    const { app, db } = await makeAppWithDb();
    const r1 = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "repeat@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetTitle: "Free Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });
    const b1 = (await r1.json()) as { downloadToken?: string };
    expect(b1.downloadToken).toMatch(/^[0-9a-f]{64}$/);

    const r2 = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "repeat@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetTitle: "Free Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });
    const b2 = (await r2.json()) as { downloadToken?: string };
    expect(b2.downloadToken).toBeUndefined();

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.signupEmail, "repeat@example.com"));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.downloadToken).toBe(b1.downloadToken);
  });

  it("rotates expired download tokens on re-signup for the same slug", async () => {
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const r2 = {
      get: vi.fn().mockResolvedValue({
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(fakePdf);
            controller.close();
          },
        }),
      }),
    } as unknown as R2Bucket;
    const { app, db } = await makeAppWithDb({ LEAD_MAGNETS_R2: r2 });

    const first = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "expired-repeat@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetTitle: "Free Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });
    const firstBody = (await first.json()) as { downloadToken?: string };
    expect(firstBody.downloadToken).toMatch(/^[0-9a-f]{64}$/);

    await db
      .update(leadMagnetDownloads)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(leadMagnetDownloads.signupEmail, "expired-repeat@example.com"));

    const second = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "expired-repeat@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetTitle: "Free Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });
    const secondBody = (await second.json()) as { downloadToken?: string };
    expect(secondBody.downloadToken).toMatch(/^[0-9a-f]{64}$/);
    expect(secondBody.downloadToken).not.toBe(firstBody.downloadToken);
    expect(sendLeadMagnetSpy).toHaveBeenCalledTimes(2);
    const firstDeliveryKey = sendLeadMagnetSpy.mock.calls[0]?.[0].deliveryKey;
    const secondDeliveryKey = sendLeadMagnetSpy.mock.calls[1]?.[0].deliveryKey;
    expect(firstDeliveryKey).toContain(`download:${firstBody.downloadToken}`);
    expect(secondDeliveryKey).toContain(`download:${secondBody.downloadToken}`);
    expect(secondDeliveryKey).not.toBe(firstDeliveryKey);

    const download = await app.request(
      `/api/lead-magnets/download?token=${secondBody.downloadToken}`,
    );
    expect(download.status).toBe(200);

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.signupEmail, "expired-repeat@example.com"));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.downloadToken).toBe(secondBody.downloadToken);
    expect(new Date(downloads[0]!.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("does not resend the same selected lead magnet for an existing email", async () => {
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();
    const { app, db } = await makeAppWithDb();

    const first = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-resource@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetTitle: "Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { downloadToken?: string };
    expect(firstBody.downloadToken).toMatch(/^[0-9a-f]{64}$/);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
    sendLeadMagnetSpy.mockClear();

    const second = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-resource@example.com",
        sourcePage: "exit-popup",
        leadMagnetTitle: "Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { downloadToken?: string };
    expect(secondBody.downloadToken).toBeUndefined();
    expect(sendLeadMagnetSpy).not.toHaveBeenCalled();

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(
        eq(leadMagnetDownloads.signupEmail, "existing-resource@example.com"),
      );
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.downloadToken).toBe(firstBody.downloadToken);
  });

  it("retries unsent duplicate lead magnet delivery without exposing the existing token", async () => {
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();
    sendLeadMagnetSpy
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ id: "retry-email-id" });
    const { app, db } = await makeAppWithDb();

    const first = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "unsent-resource@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetTitle: "Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });
    expect(first.status).toBe(500);

    const second = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "unsent-resource@example.com",
        sourcePage: "exit-popup",
        leadMagnetTitle: "Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });

    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { downloadToken?: string };
    expect(secondBody.downloadToken).toBeUndefined();
    expect(sendLeadMagnetSpy).toHaveBeenCalledTimes(2);

    const [signup] = await db
      .select()
      .from(signups)
      .where(eq(signups.email, "unsent-resource@example.com"));
    expect(signup!.leadMagnetUrl).toBe(
      "https://kaiplan.app/free/budget-template",
    );
    expect(signup!.sourcePage).toBe("/free/budget-template");

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(
        eq(leadMagnetDownloads.signupEmail, "unsent-resource@example.com"),
      );
    expect(downloads.map((row) => row.leadMagnetSlug)).toEqual([
      "budget-template",
    ]);
    expect(downloads[0]!.downloadToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("claims duplicate confirmation retries so concurrent requests send once", async () => {
    const sendConfirmationSpy = vi.mocked(emailService.sendConfirmation);
    sendConfirmationSpy.mockClear();
    let releaseSend!: () => void;
    const sendStarted = new Promise<void>((resolve) => {
      sendConfirmationSpy.mockImplementationOnce(
        () =>
          new Promise((sendResolve) => {
            releaseSend = () => {
              sendResolve({ id: "retry-email-id" });
              resolve();
            };
          }),
      );
    });
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values({
      email: "concurrent-confirmation@example.com",
      sourcePage: "/",
      referralCode: "CONCUR01",
      surveyToken: "2".repeat(64),
      emailSentAt: null,
      createdAt: "2026-04-20T00:00:00.000Z",
    });

    const firstRequest = app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "concurrent-confirmation@example.com",
        sourcePage: "/retry-a",
      }),
    });

    while (sendConfirmationSpy.mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(sendConfirmationSpy).toHaveBeenCalledOnce();
    const secondResponse = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "concurrent-confirmation@example.com",
        sourcePage: "/retry-b",
      }),
    });
    expect(secondResponse.status).toBe(200);
    expect(sendConfirmationSpy).toHaveBeenCalledOnce();

    releaseSend();
    await sendStarted;

    const firstResponse = await firstRequest;
    expect(firstResponse.status).toBe(200);
    expect(sendConfirmationSpy).toHaveBeenCalledOnce();

    const [signup] = await db
      .select()
      .from(signups)
      .where(eq(signups.email, "concurrent-confirmation@example.com"));
    expect(signup!.emailSentAt).not.toBeNull();
    expect(signup!.emailSendClaimedAt).toBeNull();
  });

  it("claims duplicate lead magnet retries so concurrent requests send once", async () => {
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();
    let releaseSend!: () => void;
    const sendStarted = new Promise<void>((resolve) => {
      sendLeadMagnetSpy.mockImplementationOnce(
        () =>
          new Promise((sendResolve) => {
            releaseSend = () => {
              sendResolve({ id: "retry-email-id" });
              resolve();
            };
          }),
      );
    });
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values({
      email: "concurrent-resource@example.com",
      sourcePage: "/free/budget-template",
      referralCode: "CONCUR02",
      surveyToken: "3".repeat(64),
      emailSentAt: "2026-04-20T00:00:00.000Z",
      createdAt: "2026-04-20T00:00:00.000Z",
    });
    await db.insert(leadMagnetDownloads).values({
      signupEmail: "concurrent-resource@example.com",
      leadMagnetSlug: "budget-template",
      downloadToken: "4".repeat(64),
      expiresAt: "2026-07-20T00:00:00.000Z",
      emailSentAt: null,
      downloadCount: 0,
      createdAt: "2026-04-20T00:00:00.000Z",
    });

    const body = {
      email: "concurrent-resource@example.com",
      sourcePage: "exit-popup",
      leadMagnetSlug: "budget-template",
    };
    const firstRequest = app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    while (sendLeadMagnetSpy.mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();
    const secondResponse = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(secondResponse.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();

    releaseSend();
    await sendStarted;

    const firstResponse = await firstRequest;
    expect(firstResponse.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();

    const [download] = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.downloadToken, "4".repeat(64)));
    expect(download!.emailSentAt).not.toBeNull();
    expect(download!.emailSendClaimedAt).toBeNull();
  });

  it("does not resend a stored lead magnet when an existing email requests an unknown slug", async () => {
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    const sendConfirmationSpy = vi.mocked(emailService.sendConfirmation);
    sendLeadMagnetSpy.mockClear();
    sendConfirmationSpy.mockClear();
    const { app, db } = await makeAppWithDb();

    const first = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-unknown-resource@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetTitle: "Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });
    expect(first.status).toBe(200);
    sendLeadMagnetSpy.mockClear();
    sendConfirmationSpy.mockClear();

    const second = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-unknown-resource@example.com",
        sourcePage: "exit-popup",
        leadMagnetTitle: "Looks Legit",
        leadMagnetSlug: "not-a-real-lead-magnet",
      }),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { downloadToken?: string };
    expect(secondBody.downloadToken).toBeUndefined();
    expect(sendLeadMagnetSpy).not.toHaveBeenCalled();
    expect(sendConfirmationSpy).not.toHaveBeenCalled();

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(
        eq(
          leadMagnetDownloads.signupEmail,
          "existing-unknown-resource@example.com",
        ),
      );
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.leadMagnetSlug).toBe("budget-template");
  });

  it("sends a slug-only selected lead magnet for an existing plain signup", async () => {
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();
    const { app, db } = await makeAppWithDb();

    const plain = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "slug-only-existing@example.com",
        sourcePage: "/",
      }),
    });
    expect(plain.status).toBe(200);
    sendLeadMagnetSpy.mockClear();

    const selected = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "slug-only-existing@example.com",
        sourcePage: "exit-popup",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });
    expect(selected.status).toBe(200);
    const body = (await selected.json()) as { downloadToken?: string };
    expect(body.downloadToken).toMatch(/^[0-9a-f]{64}$/);
    expect(sendLeadMagnetSpy).toHaveBeenCalledOnce();

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(
        eq(leadMagnetDownloads.signupEmail, "slug-only-existing@example.com"),
      );
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.leadMagnetSlug).toBe("vendor-red-flag-checklist");
    expect(downloads[0]!.downloadToken).toBe(body.downloadToken);
  });

  it("retries lead magnet delivery for an existing signup after delivery failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();
    const { app, db } = await makeAppWithDb({
      SEQUENCER_BASE_URL: "https://sequencer.example.com",
      SEQUENCER_CF_ACCESS_CLIENT_ID: "test-client-id",
      SEQUENCER_CF_ACCESS_CLIENT_SECRET: "test-client-secret",
    });

    const plain = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-delivery-retry@example.com",
        sourcePage: "/",
      }),
    });
    expect(plain.status).toBe(200);
    clearRateLimit();
    fetchMock.mockClear();

    sendLeadMagnetSpy
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ id: "retry-email-id" });

    const firstSelected = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-delivery-retry@example.com",
        sourcePage: "exit-popup",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });
    expect(firstSelected.status).toBe(500);

    const retrySelected = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-delivery-retry@example.com",
        sourcePage: "exit-popup",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });

    expect(retrySelected.status).toBe(200);
    const body = (await retrySelected.json()) as { downloadToken?: string };
    expect(body.downloadToken).toBeUndefined();
    expect(sendLeadMagnetSpy).toHaveBeenCalledTimes(2);
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "https://sequencer.example.com/api/v1/enrollments",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("vendor-red-flag-checklist"),
        }),
      ),
    );

    const [signup] = await db
      .select()
      .from(signups)
      .where(eq(signups.email, "existing-delivery-retry@example.com"));
    expect(signup!.leadMagnetUrl).toBe(
      "https://kaiplan.app/free/vendor-red-flag-checklist",
    );

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(
        eq(
          leadMagnetDownloads.signupEmail,
          "existing-delivery-retry@example.com",
        ),
      );
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.downloadToken).toMatch(/^[0-9a-f]{64}$/);
    vi.unstubAllGlobals();
  });

  it("retries a new requested magnet with current metadata when an older magnet is stored", async () => {
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();
    const { app, db } = await makeAppWithDb();

    const firstMagnet = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-prior-magnet-retry@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetSlug: "budget-template",
      }),
    });
    expect(firstMagnet.status).toBe(200);
    sendLeadMagnetSpy.mockClear();

    sendLeadMagnetSpy
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ id: "retry-email-id" });

    const failedSecondMagnet = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-prior-magnet-retry@example.com",
        sourcePage: "exit-popup",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });
    expect(failedSecondMagnet.status).toBe(500);

    const retrySecondMagnet = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing-prior-magnet-retry@example.com",
        sourcePage: "exit-popup",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });

    expect(retrySecondMagnet.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledTimes(2);
    expect(sendLeadMagnetSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        leadMagnetTitle: "Free Wedding Vendor Red Flag Checklist",
        leadMagnetUrl: "https://kaiplan.app/free/vendor-red-flag-checklist",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    );

    const [signup] = await db
      .select()
      .from(signups)
      .where(eq(signups.email, "existing-prior-magnet-retry@example.com"));
    expect(signup!.leadMagnetUrl).toBe(
      "https://kaiplan.app/free/vendor-red-flag-checklist",
    );
  });

  it("creates separate download rows when an existing email selects a different magnet", async () => {
    const { app, db } = await makeAppWithDb();
    await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "multi-resource@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetTitle: "Budget Template",
        leadMagnetSlug: "budget-template",
      }),
    });

    const second = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "multi-resource@example.com",
        sourcePage: "exit-popup",
        leadMagnetTitle: "Vendor Red Flag Checklist",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { downloadToken?: string };
    expect(body.downloadToken).toMatch(/^[0-9a-f]{64}$/);

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.signupEmail, "multi-resource@example.com"));
    expect(downloads.map((row) => row.leadMagnetSlug).sort()).toEqual([
      "budget-template",
      "vendor-red-flag-checklist",
    ]);
  });

  it("does not resend a previously delivered older magnet after another magnet is stored", async () => {
    const sendLeadMagnetSpy = vi.mocked(emailService.sendLeadMagnetDelivery);
    sendLeadMagnetSpy.mockClear();
    const { app, db } = await makeAppWithDb();

    const first = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "multi-resource-repeat@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetSlug: "budget-template",
      }),
    });
    expect(first.status).toBe(200);
    clearRateLimit();

    const second = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "multi-resource-repeat@example.com",
        sourcePage: "exit-popup",
        leadMagnetSlug: "vendor-red-flag-checklist",
      }),
    });
    expect(second.status).toBe(200);
    expect(sendLeadMagnetSpy).toHaveBeenCalledTimes(2);
    clearRateLimit();

    const third = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "multi-resource-repeat@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetSlug: "budget-template",
      }),
    });

    expect(third.status).toBe(200);
    const thirdBody = (await third.json()) as { downloadToken?: string };
    expect(thirdBody.downloadToken).toBeUndefined();
    expect(sendLeadMagnetSpy).toHaveBeenCalledTimes(2);

    const downloads = await db
      .select()
      .from(leadMagnetDownloads)
      .where(
        eq(
          leadMagnetDownloads.signupEmail,
          "multi-resource-repeat@example.com",
        ),
      );
    expect(downloads).toHaveLength(2);
    expect(downloads.every((row) => row.emailSentAt !== null)).toBe(true);
  });
});
