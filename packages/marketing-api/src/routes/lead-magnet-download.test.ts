import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { signups, leadMagnetDownloads } from "../db/schema";
import { makeDb, clearRateLimit } from "../integration/setup";
import { createApi } from "../app";
import { createLocalOutbox } from "../integration/local-outbox";
import type { ApiEnv } from "../app";

async function makeAppWithDb(overrides: Partial<ApiEnv> = {}): Promise<{
  app: ReturnType<typeof createApi>;
  db: Awaited<ReturnType<typeof makeDb>>;
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
    E2E_MODE: "true",
    LOCAL_OUTBOX: createLocalOutbox(),
    ...overrides,
    _db: db as unknown as ApiEnv["_db"],
  };
  const app = createApi(env);
  return { app, db };
}

const TOKEN_A = "a".repeat(64);
const TOKEN_EXPIRED = "b".repeat(64);

describe("GET /api/lead-magnets/download", () => {
  beforeEach(() => {
    clearRateLimit();
  });

  it("returns 400 when token is missing", async () => {
    const { app } = await makeAppWithDb();
    const res = await app.request("/api/lead-magnets/download");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_token");
  });

  it("returns 400 when token has wrong length", async () => {
    const { app } = await makeAppWithDb();
    const res = await app.request("/api/lead-magnets/download?token=abc123");
    expect(res.status).toBe(400);
  });

  it("returns 400 when token has non-hex characters", async () => {
    const { app } = await makeAppWithDb();
    const res = await app.request(
      `/api/lead-magnets/download?token=${"g".repeat(64)}`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when token has uppercase hex (lowercase-only policy)", async () => {
    const { app } = await makeAppWithDb();
    const res = await app.request(
      `/api/lead-magnets/download?token=${"A".repeat(64)}`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when token is well-formed but unknown", async () => {
    const { app } = await makeAppWithDb();
    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns a generic 500 when token lookup fails", async () => {
    const app = createApi({
      DB: null as unknown as D1Database,
      PRODUCT_NAME: "Kaiplan",
      PRODUCT_DOMAIN: "kaiplan.app",
      PRODUCT_LOGO_URL: "https://kaiplan.app/logo-light.svg",
      PRODUCT_BRAND_COLOR: "#B0432A",
      PRODUCT_ACCENT_COLOR: "#3A4A2C",
      CALENDAR_URL: "https://cal.com/kaiplan",
      EMAIL_FROM: "Angel Campa <angel.campa@kaiplan.app>",
      ALLOWED_ORIGIN: "https://kaiplan.app",
      _db: {
        select: () => {
          throw new Error("D1_ERROR: lead magnet lookup failed");
        },
      } as unknown as ApiEnv["_db"],
    });

    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "internal_error" });
  });

  it("returns 410 when the token has expired", async () => {
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values({
      email: "exp@example.com",
      sourcePage: "/",
      referralCode: "EXPCODE1",
      surveyToken: "s".repeat(32),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await db.insert(leadMagnetDownloads).values({
      signupEmail: "exp@example.com",
      leadMagnetSlug: "budget-template",
      downloadToken: TOKEN_EXPIRED,
      expiresAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_EXPIRED}`,
    );
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("expired");
  });

  it("does not redirect to the public static PDF fallback when R2 is absent", async () => {
    const { app, db } = await makeAppWithDb();
    await db.insert(signups).values({
      email: "dl@example.com",
      sourcePage: "/",
      referralCode: "DLCODE01",
      surveyToken: "t".repeat(32),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await db.insert(leadMagnetDownloads).values({
      signupEmail: "dl@example.com",
      leadMagnetSlug: "budget-template",
      downloadToken: TOKEN_A,
      expiresAt: future,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("asset_storage_unavailable");
    expect(res.headers.get("location")).toBeNull();

    const [row] = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.downloadToken, TOKEN_A));
    expect(row!.downloadCount).toBe(0);
    expect(row!.downloadedAt).toBeNull();

    const res2 = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
      { redirect: "manual" },
    );
    expect(res2.status).toBe(503);
    const [row2] = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.downloadToken, TOKEN_A));
    expect(row2!.downloadCount).toBe(0);
    expect(row2!.downloadedAt).toBeNull();
  });

  it("streams the PDF from R2 when binding is configured and E2E is off", async () => {
    const pdfBody = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const r2: ApiEnv["LEAD_MAGNETS_R2"] = {
      get: async (key: string) => {
        expect(key).toBe("budget-template.pdf");
        return {
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(pdfBody);
              controller.close();
            },
          }),
        } as unknown as R2ObjectBody;
      },
    } as unknown as R2Bucket;

    const { app, db } = await makeAppWithDb({
      E2E_MODE: "false",
      LEAD_MAGNETS_R2: r2,
    });
    await db.insert(signups).values({
      email: "r2@example.com",
      sourcePage: "/",
      referralCode: "R2CODE01",
      surveyToken: "r".repeat(32),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await db.insert(leadMagnetDownloads).values({
      signupEmail: "r2@example.com",
      leadMagnetSlug: "budget-template",
      downloadToken: TOKEN_A,
      expiresAt: future,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="budget-template.pdf"',
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, noarchive");

    const [row] = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.downloadToken, TOKEN_A));
    expect(row!.downloadCount).toBe(1);
    expect(row!.downloadedAt).not.toBeNull();
  });

  it("returns 503 and does not update counters when R2 fetch fails", async () => {
    const r2 = {
      get: async () => {
        throw new Error("R2 unavailable");
      },
    } as unknown as R2Bucket;
    const { app, db } = await makeAppWithDb({
      E2E_MODE: "false",
      LEAD_MAGNETS_R2: r2,
    });
    await db.insert(signups).values({
      email: "r2-fail@example.com",
      sourcePage: "/",
      referralCode: "R2FAIL01",
      surveyToken: "q".repeat(32),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await db.insert(leadMagnetDownloads).values({
      signupEmail: "r2-fail@example.com",
      leadMagnetSlug: "budget-template",
      downloadToken: TOKEN_A,
      expiresAt: future,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "asset_storage_unavailable",
    });
    const [row] = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.downloadToken, TOKEN_A));
    expect(row!.downloadCount).toBe(0);
    expect(row!.downloadedAt).toBeNull();
  });

  it("returns a generic 500 when download counter update fails", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const app = createApi({
      DB: null as unknown as D1Database,
      PRODUCT_NAME: "Kaiplan",
      PRODUCT_DOMAIN: "kaiplan.app",
      PRODUCT_LOGO_URL: "https://kaiplan.app/logo-light.svg",
      PRODUCT_BRAND_COLOR: "#B0432A",
      PRODUCT_ACCENT_COLOR: "#3A4A2C",
      CALENDAR_URL: "https://cal.com/kaiplan",
      EMAIL_FROM: "Angel Campa <angel.campa@kaiplan.app>",
      ALLOWED_ORIGIN: "https://kaiplan.app",
      LEAD_MAGNETS_R2: {
        get: async () =>
          ({
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
                controller.close();
              },
            }),
          }) as unknown as R2ObjectBody,
      } as unknown as R2Bucket,
      _db: {
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([
                {
                  id: 123,
                  signupEmail: "counter-fail@example.com",
                  leadMagnetSlug: "budget-template",
                  downloadToken: TOKEN_A,
                  expiresAt: future,
                  downloadCount: 0,
                },
              ]),
          }),
        }),
        update: () => {
          throw new Error("D1_ERROR: counter update failed");
        },
      } as unknown as ApiEnv["_db"],
    });

    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "internal_error" });
  });

  it("returns 404 when the token row disappears before the counter update", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const app = createApi({
      DB: null as unknown as D1Database,
      PRODUCT_NAME: "Kaiplan",
      PRODUCT_DOMAIN: "kaiplan.app",
      PRODUCT_LOGO_URL: "https://kaiplan.app/logo-light.svg",
      PRODUCT_BRAND_COLOR: "#B0432A",
      PRODUCT_ACCENT_COLOR: "#3A4A2C",
      CALENDAR_URL: "https://cal.com/kaiplan",
      EMAIL_FROM: "Angel Campa <angel.campa@kaiplan.app>",
      ALLOWED_ORIGIN: "https://kaiplan.app",
      LEAD_MAGNETS_R2: {
        get: async () =>
          ({
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
                controller.close();
              },
            }),
          }) as unknown as R2ObjectBody,
      } as unknown as R2Bucket,
      _db: {
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([
                {
                  id: 123,
                  signupEmail: "revoked-download@example.com",
                  leadMagnetSlug: "budget-template",
                  downloadToken: TOKEN_A,
                  expiresAt: future,
                  downloadCount: 0,
                },
              ]),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve([]),
            }),
          }),
        }),
      } as unknown as ApiEnv["_db"],
    });

    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });

  it("increments repeated downloads without replacing the first download time", async () => {
    const r2: ApiEnv["LEAD_MAGNETS_R2"] = {
      get: async () =>
        ({
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
              controller.close();
            },
          }),
        }) as unknown as R2ObjectBody,
    } as unknown as R2Bucket;
    const { app, db } = await makeAppWithDb({
      E2E_MODE: "false",
      LEAD_MAGNETS_R2: r2,
    });
    await db.insert(signups).values({
      email: "repeat-download@example.com",
      sourcePage: "/",
      referralCode: "RPTDL001",
      surveyToken: "d".repeat(32),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const firstDownloadedAt = "2026-05-01T00:00:00.000Z";
    await db.insert(leadMagnetDownloads).values({
      signupEmail: "repeat-download@example.com",
      leadMagnetSlug: "budget-template",
      downloadToken: TOKEN_A,
      expiresAt: future,
      downloadedAt: firstDownloadedAt,
      downloadCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
    );

    expect(res.status).toBe(200);
    const [row] = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.downloadToken, TOKEN_A));
    expect(row!.downloadCount).toBe(2);
    expect(row!.downloadedAt).toBe(firstDownloadedAt);
  });

  it("captures a PostHog event on successful download when POSTHOG_API_KEY is set", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock;

    try {
      const r2: ApiEnv["LEAD_MAGNETS_R2"] = {
        get: async () =>
          ({
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
                controller.close();
              },
            }),
          }) as unknown as R2ObjectBody,
      } as unknown as R2Bucket;
      const { app, db } = await makeAppWithDb({
        E2E_MODE: "false",
        LEAD_MAGNETS_R2: r2,
        POSTHOG_API_KEY: "phc_test_key",
      });
      await db.insert(signups).values({
        email: "ph@example.com",
        sourcePage: "/",
        referralCode: "PHCODE01",
        surveyToken: "p".repeat(32),
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      const future = new Date(Date.now() + 86_400_000).toISOString();
      await db.insert(leadMagnetDownloads).values({
        signupEmail: "ph@example.com",
        leadMagnetSlug: "budget-template",
        downloadToken: TOKEN_A,
        expiresAt: future,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      const res = await app.request(
        `/api/lead-magnets/download?token=${TOKEN_A}`,
        { redirect: "manual" },
      );
      expect(res.status).toBe(200);

      // Let the fire-and-forget capture resolve.
      for (let i = 0; i < 10; i++) await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));

      const captureCall = fetchMock.mock.calls.find(
        (call) => call[0] === "https://us.i.posthog.com/capture/",
      );
      expect(captureCall).toBeDefined();
      const body = JSON.parse(
        (captureCall![1] as RequestInit).body as string,
      ) as {
        api_key: string;
        event: string;
        properties: { slug: string; downloadCount: number; expired: boolean };
        distinct_id: string;
      };
      expect(body.api_key).toBe("phc_test_key");
      expect(body.event).toBe("lead_magnet_pdf_downloaded");
      expect(body.properties).toEqual({
        slug: "budget-template",
        downloadCount: 1,
        expired: false,
      });
      // distinct_id should be a hash, not a raw email.
      expect(body.distinct_id).not.toContain("@");
      expect(body.distinct_id).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });

  it("does not call PostHog when POSTHOG_API_KEY is not set", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock;

    try {
      const r2: ApiEnv["LEAD_MAGNETS_R2"] = {
        get: async () =>
          ({
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
                controller.close();
              },
            }),
          }) as unknown as R2ObjectBody,
      } as unknown as R2Bucket;
      const { app, db } = await makeAppWithDb({
        E2E_MODE: "false",
        LEAD_MAGNETS_R2: r2,
      });
      await db.insert(signups).values({
        email: "nokey@example.com",
        sourcePage: "/",
        referralCode: "NOKEYCD1",
        surveyToken: "n".repeat(32),
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      const future = new Date(Date.now() + 86_400_000).toISOString();
      await db.insert(leadMagnetDownloads).values({
        signupEmail: "nokey@example.com",
        leadMagnetSlug: "budget-template",
        downloadToken: TOKEN_A,
        expiresAt: future,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      await app.request(`/api/lead-magnets/download?token=${TOKEN_A}`, {
        redirect: "manual",
      });

      for (let i = 0; i < 10; i++) await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));

      const captureCall = fetchMock.mock.calls.find(
        (call) => call[0] === "https://us.i.posthog.com/capture/",
      );
      expect(captureCall).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });

  it("returns 404 when R2 returns null for the asset", async () => {
    const r2 = {
      get: async () => null,
    } as unknown as R2Bucket;
    const { app, db } = await makeAppWithDb({
      E2E_MODE: "false",
      LEAD_MAGNETS_R2: r2,
    });
    await db.insert(signups).values({
      email: "missing@example.com",
      sourcePage: "/",
      referralCode: "MISSCD01",
      surveyToken: "m".repeat(32),
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await db.insert(leadMagnetDownloads).values({
      signupEmail: "missing@example.com",
      leadMagnetSlug: "budget-template",
      downloadToken: TOKEN_A,
      expiresAt: future,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      `/api/lead-magnets/download?token=${TOKEN_A}`,
    );
    expect(res.status).toBe(404);
    const [row] = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.downloadToken, TOKEN_A));
    expect(row!.downloadCount).toBe(0);
    expect(row!.downloadedAt).toBeNull();
  });
});
