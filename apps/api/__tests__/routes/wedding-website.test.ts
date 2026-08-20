import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Auth } from "../../src/auth";
import type { Database } from "../../src/db/client";
import {
  publicWeddingWebsiteRoutes,
  weddingWebsiteRoutes,
} from "../../src/routes/wedding-website";
import { RateLimiter } from "../../src/lib/rate-limit";

type MockEmailService = {
  sendPasswordReset: ReturnType<typeof vi.fn>;
  sendMemberInvite: ReturnType<typeof vi.fn>;
  sendRsvpConfirmation: ReturnType<typeof vi.fn>;
  sendRsvpReminder: ReturnType<typeof vi.fn>;
};

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  emailVerified: true,
};

const WEDDING_ROW = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "My Wedding",
  date: "2026-06-15",
  budgetCents: 500000,
  currency: "USD",
  timezone: "America/New_York",
  createdBy: TEST_USER.id,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const MEMBER_ROW = {
  id: "member-uuid-1",
  weddingId: WEDDING_ROW.id,
  userId: TEST_USER.id,
  role: "owner" as const,
  invitedEmail: null,
  acceptedAt: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
};

const OTHER_WEBSITE_ROW = {
  id: "website-2",
  weddingId: "00000000-0000-4000-8000-000000000102",
  template: "modern",
  slug: "shared-slug",
  publishedSlug: "shared-slug",
  draftContent: {},
  publishedContent: {},
  publishedTemplate: "modern",
  publishedAt: new Date("2026-04-01"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const PUBLISHED_WEBSITE_ROW = {
  id: "website-1",
  weddingId: WEDDING_ROW.id,
  template: "classic",
  slug: "anna-and-lee",
  publishedSlug: "anna-and-lee",
  draftContent: {
    hero: { title: "Anna & Lee" },
    story: { title: "Our Story" },
    venue: { name: "The Palm House" },
    registry: { title: "Registry" },
    rsvp: { visible: true },
    heroImage: null,
  },
  publishedContent: {
    hero: { title: "Anna & Lee" },
    story: { title: "Our Story" },
    venue: { name: "The Palm House" },
    registry: { title: "Registry" },
    rsvp: { visible: true },
    heroImage: null,
  },
  publishedTemplate: "classic",
  publishedAt: new Date("2026-04-08"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const PUBLISHED_ARCHIVED_WEBSITE_ROW = {
  ...PUBLISHED_WEBSITE_ROW,
  weddingStatus: "archived",
};

const PRIMARY_GUEST = {
  id: "00000000-0000-4000-8000-000000000001",
  weddingId: WEDDING_ROW.id,
  primaryGuestId: null,
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.com",
  phone: null,
  side: "partner1",
  groupName: "Family",
  dietaryTags: ["vegetarian"],
  dietaryNotes: null,
  rsvpStatus: "pending",
  sortOrder: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const PLUS_ONE_GUEST = {
  id: "00000000-0000-4000-8000-000000000002",
  weddingId: WEDDING_ROW.id,
  primaryGuestId: PRIMARY_GUEST.id,
  firstName: "Bob",
  lastName: "Smith",
  email: null,
  phone: null,
  side: "partner1",
  groupName: null,
  dietaryTags: [],
  dietaryNotes: null,
  rsvpStatus: "accepted",
  sortOrder: 1,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const HOUSEHOLD_TOKEN = {
  token: "550e8400-e29b-41d4-a716-446655440100",
  weddingId: WEDDING_ROW.id,
  primaryGuestId: PRIMARY_GUEST.id,
  createdAt: new Date("2026-04-01"),
  updatedAt: new Date("2026-04-01"),
};

const CREATED_HOUSEHOLD_TOKEN = {
  token: "550e8400-e29b-41d4-a716-446655440101",
  weddingId: WEDDING_ROW.id,
  primaryGuestId: PRIMARY_GUEST.id,
  createdAt: new Date("2026-04-08"),
  updatedAt: new Date("2026-04-08"),
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
  builder.innerJoin = vi.fn().mockReturnValue(builder);
  builder.leftJoin = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue({
    then: (fn: (rows: unknown) => unknown) => Promise.resolve(fn(resolveWith)),
  });
  return builder;
}

function makeWriteBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};
  const valuesResult: Record<string, unknown> = {
    returning: vi.fn().mockResolvedValue(resolveWith),
    onConflictDoUpdate: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(resolveWith),
    }),
  };
  builder.values = vi.fn().mockReturnValue(valuesResult);
  builder.set = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(resolveWith),
    }),
  });
  builder.where = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockResolvedValue(resolveWith);
  return builder;
}

function makeDb(
  selectResponses: unknown[][] = [[]],
  writeResult: unknown[] = [],
): Database {
  let selectIndex = 0;
  const db: Record<string, unknown> = {};
  db.select = vi.fn().mockImplementation(() => {
    const rows =
      selectIndex < selectResponses.length ? selectResponses[selectIndex] : [];
    selectIndex++;
    return makeSelectBuilder(rows);
  });
  db.insert = vi.fn().mockReturnValue(makeWriteBuilder(writeResult));
  db.update = vi.fn().mockReturnValue(makeWriteBuilder(writeResult));
  db.execute = vi.fn().mockResolvedValue(undefined);
  db.delete = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(writeResult),
    }),
  });
  db.transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: db.select,
        insert: db.insert,
        update: db.update,
        delete: db.delete,
        execute: db.execute,
      }),
    );
  return db as unknown as Database;
}

function makeEmailService(): MockEmailService {
  return {
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    sendMemberInvite: vi.fn(),
    sendRsvpConfirmation: vi.fn().mockResolvedValue(undefined),
    sendRsvpReminder: vi.fn().mockResolvedValue({
      primaryGuestId: PRIMARY_GUEST.id,
      guestEmail: PRIMARY_GUEST.email,
      status: "sent",
      emailId: "email-456",
      error: null,
    }),
  };
}

function makeApp(db: Database, auth: Auth, emailService = makeEmailService()) {
  const app = new Hono();
  app.route("/weddings", weddingWebsiteRoutes(db, auth, emailService as never));
  app.route("/public", publicWeddingWebsiteRoutes(db, emailService as never));
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
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    env as never,
  );
}

async function malformedJsonReq(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  env: Record<string, unknown> = {},
) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: '{"invalid":',
    }),
    env as never,
  );
}

async function rawJsonReq(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  body: string,
  env: Record<string, unknown> = {},
) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body,
    }),
    env as never,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("weddingWebsiteRoutes", () => {
  it("returns 401 when not authenticated", async () => {
    const app = makeApp(makeDb(), makeUnauthAuth());
    const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/website`);
    expect(res.status).toBe(401);
  });

  it("returns 402 when the wedding owner does not have website access", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [
          {
            userId: TEST_USER.id,
            plan: "free",
            status: "inactive",
          },
        ],
      ],
      [{ id: PRIMARY_GUEST.id }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/website`);

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      feature: "weddingWebsite",
    });
  });

  it("returns 402 when the wedding owner has active starter access", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [
        {
          userId: TEST_USER.id,
          plan: "starter",
          status: "active",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/website`);

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      feature: "weddingWebsite",
      plan: "starter",
      status: "active",
    });
  });

  it("returns 200 with null when no website draft exists yet", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/weddings/${WEDDING_ROW.id}/website`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("deletes a website draft for writers", async () => {
    const draftOnlyRow = {
      ...PUBLISHED_WEBSITE_ROW,
      publishedSlug: null,
      publishedTemplate: null,
      publishedContent: null,
      publishedAt: null,
    };
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [draftOnlyRow],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      ],
      [{ id: "website-1" }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}/website`);

    expect(res.status).toBe(204);
    expect(db.delete).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it("preserves a published website when deleting only the draft", async () => {
    const draftContent = {
      ...PUBLISHED_WEBSITE_ROW.draftContent,
      hero: { title: "Changed Draft Title" },
    };
    const publishedRowWithDraftChanges = {
      ...PUBLISHED_WEBSITE_ROW,
      slug: "changed-draft-slug",
      template: "modern" as const,
      draftContent,
    };
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [publishedRowWithDraftChanges],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      ],
      [{ id: "website-1" }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}/website`);

    expect(res.status).toBe(204);
    expect(db.delete).not.toHaveBeenCalled();
    const firstUpdateBuilder = (db.update as ReturnType<typeof vi.fn>).mock
      .results[0].value as { set: ReturnType<typeof vi.fn> };
    expect(firstUpdateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: PUBLISHED_WEBSITE_ROW.publishedSlug,
        template: PUBLISHED_WEBSITE_ROW.publishedTemplate,
        draftContent: PUBLISHED_WEBSITE_ROW.publishedContent,
      }),
    );
  });

  it("uses transaction-time publication state when deleting a draft", async () => {
    const transactionUpdateBuilder = makeWriteBuilder([{ id: "website-1" }]);
    const transactionDelete = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "deleted-stale-draft" }]),
      }),
    });
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [
          {
            ...PUBLISHED_WEBSITE_ROW,
            publishedSlug: null,
            publishedTemplate: null,
            publishedContent: null,
            publishedAt: null,
          },
        ],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      ],
      [{ id: "website-1" }],
    );
    (db as any).transaction = vi.fn().mockImplementation(async (fn) =>
      fn({
        select: vi
          .fn()
          .mockReturnValue(makeSelectBuilder([PUBLISHED_WEBSITE_ROW])),
        update: vi.fn().mockReturnValue(transactionUpdateBuilder),
        delete: transactionDelete,
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    );
    const app = makeApp(db, makeAuth());

    const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}/website`);

    expect(res.status).toBe(204);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDelete).not.toHaveBeenCalled();
    expect(transactionUpdateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: PUBLISHED_WEBSITE_ROW.publishedSlug,
        template: PUBLISHED_WEBSITE_ROW.publishedTemplate,
        draftContent: PUBLISHED_WEBSITE_ROW.publishedContent,
      }),
    );
  });

  it("returns 404 when a website draft delete matches no rows", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "DELETE", `/weddings/${WEDDING_ROW.id}/website`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Website draft not found.",
    });
  });

  it("rejects invalid slugs", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/website`, {
      slug: "Admin",
      template: "classic",
      content: {
        hero: { title: "Anna & Lee" },
        story: { title: "Our Story" },
        venue: { name: "The Palm House" },
        registry: { title: "Registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
    });

    expect(res.status).toBe(400);
  });

  it("rejects duplicate slugs at route level", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [OTHER_WEBSITE_ROW],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/website`, {
      slug: "shared-slug",
      template: "classic",
      content: {
        hero: { title: "Anna & Lee" },
        story: { title: "Our Story" },
        venue: { name: "The Palm House" },
        registry: { title: "Registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
    });

    expect(res.status).toBe(409);
  });

  it("returns 200 with upsert semantics when saving a website draft", async () => {
    const createdDraft = {
      id: "website-1",
      weddingId: WEDDING_ROW.id,
      template: "classic",
      slug: "anna-and-lee",
      publishedSlug: null,
      draftContent: {
        hero: { title: "Anna & Lee" },
        story: { title: "Our Story" },
        venue: { name: "The Palm House" },
        registry: { title: "Registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
      publishedContent: null,
      publishedTemplate: null,
      publishedAt: null,
      createdAt: new Date("2026-04-01"),
      updatedAt: new Date("2026-04-01"),
    };
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [],
      ],
      [createdDraft],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(app, "POST", `/weddings/${WEDDING_ROW.id}/website`, {
      slug: "anna-and-lee",
      template: "classic",
      content: {
        hero: { title: "Anna & Lee" },
        story: { title: "Our Story" },
        venue: { name: "The Palm House" },
        registry: { title: "Registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
    });

    expect(res.status).toBe(200);
  });

  it("rejects draft hero image URLs outside the Cloudflare Images delivery base", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website`,
      {
        slug: "anna-and-lee",
        template: "classic",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "The Palm House" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: {
            imageId: "cloudflare-image-1",
            url: "https://cdn.example.com/image.jpg",
            alt: "Hero",
            mimeType: "image/jpeg",
          },
        },
      },
      {
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error:
        "Hero image URL must use the configured Cloudflare Images delivery domain.",
    });
  });

  it("rejects patched draft hero image URLs outside the Cloudflare Images delivery base", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/website`,
      {
        slug: "anna-and-lee",
        template: "classic",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "The Palm House" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: {
            imageId: "cloudflare-image-1",
            url: "https://cdn.example.com/image.jpg",
            alt: "Hero",
            mimeType: "image/jpeg",
          },
        },
      },
      {
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error:
        "Hero image URL must use the configured Cloudflare Images delivery domain.",
    });
  });

  it("rejects draft hero images with unsupported MIME metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website`,
      {
        slug: "anna-and-lee",
        template: "classic",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "The Palm House" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: {
            imageId: "cloudflare-image-1",
            url: "https://imagedelivery.net/hash/cloudflare-image-1/public",
            alt: "Hero",
            mimeType: "image/gif",
          },
        },
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Unsupported image type",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects patched draft hero images with unsupported MIME metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/website`,
      {
        slug: "anna-and-lee",
        template: "classic",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "The Palm House" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: {
            imageId: "cloudflare-image-1",
            url: "https://imagedelivery.net/hash/cloudflare-image-1/public",
            alt: "Hero",
            mimeType: "image/gif",
          },
        },
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Unsupported image type",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects draft hero images when Cloudflare metadata has an unsupported content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        result: {
          metadata: {
            weddingId: WEDDING_ROW.id,
            purpose: "wedding-website-hero",
            contentType: "image/gif",
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const draftContent = {
      hero: { title: "Anna & Lee" },
      story: { title: "Our Story" },
      venue: { name: "The Palm House" },
      registry: { title: "Registry" },
      rsvp: { visible: true },
      heroImage: {
        imageId: "cloudflare-image-1",
        url: "https://imagedelivery.net/hash/cloudflare-image-1/public",
        alt: "Hero",
      },
    };
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [],
      ],
      [
        {
          ...PUBLISHED_WEBSITE_ROW,
          publishedAt: null,
          publishedContent: null,
          publishedSlug: null,
          draftContent,
        },
      ],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website`,
      {
        slug: "anna-and-lee",
        template: "classic",
        content: draftContent,
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Unsupported image type",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts draft hero image URLs from the configured Cloudflare Images delivery base", async () => {
    const createdDraft = {
      id: "website-1",
      weddingId: WEDDING_ROW.id,
      template: "classic",
      slug: "anna-and-lee",
      publishedSlug: null,
      draftContent: {
        hero: { title: "Anna & Lee" },
        story: { title: "Our Story" },
        venue: { name: "The Palm House" },
        registry: { title: "Registry" },
        rsvp: { visible: true },
        heroImage: {
          imageId: "cloudflare-image-1",
          url: "https://imagedelivery.net/hash/cloudflare-image-1/public",
          alt: "Hero",
          mimeType: "image/jpeg",
        },
      },
      publishedContent: null,
      publishedTemplate: null,
      publishedAt: null,
      createdAt: new Date("2026-04-01"),
      updatedAt: new Date("2026-04-01"),
    };
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [],
      ],
      [createdDraft],
    );
    const app = makeApp(db, makeAuth());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          result: {
            meta: {
              weddingId: WEDDING_ROW.id,
              purpose: "wedding-website-hero",
            },
          },
        }),
      }),
    );

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website`,
      {
        slug: "anna-and-lee",
        template: "classic",
        content: createdDraft.draftContent,
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(200);
  });

  it("rejects draft hero image URLs that belong to a different wedding", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          result: {
            meta: {
              weddingId: "00000000-0000-4000-8000-000000000102",
              purpose: "wedding-website-hero",
            },
          },
        }),
      }),
    );

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website`,
      {
        slug: "anna-and-lee",
        template: "classic",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "The Palm House" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: {
            imageId: "cloudflare-image-1",
            url: "https://imagedelivery.net/hash/cloudflare-image-1/public",
            alt: "Hero",
            mimeType: "image/jpeg",
          },
        },
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Hero image does not belong to this wedding.",
    });
  });

  it("does not let request body weddingId override hero image ownership validation", async () => {
    const otherWeddingId = "00000000-0000-4000-8000-000000000102";
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [],
      ],
      [
        {
          ...PUBLISHED_WEBSITE_ROW,
          publishedAt: null,
          publishedContent: null,
          publishedSlug: null,
        },
      ],
    );
    const app = makeApp(db, makeAuth());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          result: {
            meta: {
              weddingId: otherWeddingId,
              purpose: "wedding-website-hero",
            },
          },
        }),
      }),
    );

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website`,
      {
        weddingId: otherWeddingId,
        slug: "anna-and-lee",
        template: "classic",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "The Palm House" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: {
            imageId: "cloudflare-image-1",
            url: "https://imagedelivery.net/hash/cloudflare-image-1/public",
            alt: "Hero",
            mimeType: "image/jpeg",
          },
        },
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Hero image does not belong to this wedding.",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does not let patched body weddingId override hero image ownership validation", async () => {
    const otherWeddingId = "00000000-0000-4000-8000-000000000102";
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [],
      ],
      [
        {
          ...PUBLISHED_WEBSITE_ROW,
          publishedAt: null,
          publishedContent: null,
          publishedSlug: null,
        },
      ],
    );
    const app = makeApp(db, makeAuth());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          result: {
            meta: {
              weddingId: otherWeddingId,
              purpose: "wedding-website-hero",
            },
          },
        }),
      }),
    );

    const res = await req(
      app,
      "PATCH",
      `/weddings/${WEDDING_ROW.id}/website`,
      {
        weddingId: otherWeddingId,
        slug: "anna-and-lee",
        template: "classic",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "The Palm House" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: {
            imageId: "cloudflare-image-1",
            url: "https://imagedelivery.net/hash/cloudflare-image-1/public",
            alt: "Hero",
            mimeType: "image/jpeg",
          },
        },
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Hero image does not belong to this wedding.",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("checks slug availability for the wedding website editor", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [OTHER_WEBSITE_ROW],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/website/slug-availability?slug=shared-slug`,
    );

    expect(res.status).toBe(200);
    // Response must only contain { available } — no tenant-leaking fields
    await expect(res.json()).resolves.toEqual({ available: false });
  });

  it("returns 400 for null JSON bodies when saving website drafts", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website`,
      "null",
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "JSON request body must be an object",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates a household RSVP token for a primary guest", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [PRIMARY_GUEST],
        [],
      ],
      [CREATED_HOUSEHOLD_TOKEN],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/household-rsvp-token`,
      {
        primaryGuestId: PRIMARY_GUEST.id,
      },
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      token: CREATED_HOUSEHOLD_TOKEN.token,
      weddingId: WEDDING_ROW.id,
      primaryGuestId: PRIMARY_GUEST.id,
    });
  });

  it("returns 400 for malformed JSON when creating household RSVP tokens", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await malformedJsonReq(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/household-rsvp-token`,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not record website feature use when household RSVP token creation fails validation", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/household-rsvp-token`,
      {
        primaryGuestId: "00000000-0000-4000-8000-000000000999",
      },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Primary guest not found.",
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("looks up an existing household RSVP token for a primary guest", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [PRIMARY_GUEST],
      [HOUSEHOLD_TOKEN],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/website/household-rsvp-token/${PRIMARY_GUEST.id}`,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      token: HOUSEHOLD_TOKEN.token,
      weddingId: WEDDING_ROW.id,
      primaryGuestId: PRIMARY_GUEST.id,
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not expose household RSVP bearer tokens to viewers", async () => {
    const viewerMemberRow = { ...MEMBER_ROW, role: "viewer" as const };
    const db = makeDb([[viewerMemberRow]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/website/household-rsvp-token/${PRIMARY_GUEST.id}`,
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Viewers cannot modify the wedding website.",
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns a hero image upload intent for the editor", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        result: {
          id: "cloudflare-image-1",
          uploadURL: "https://upload.example.com/direct",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/hero-image-upload-intent`,
      {
        contentType: "image/jpeg",
        filename: "hero.jpg",
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
        CLOUDFLARE_IMAGES_DIRECT_UPLOAD_TTL_SECONDS: "900",
      },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      imageId: "cloudflare-image-1",
      uploadUrl: "https://upload.example.com/direct",
      imageUrl: "https://imagedelivery.net/hash/cloudflare-image-1/public",
    });
  });

  it("returns 503 when Cloudflare Images is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/hero-image-upload-intent`,
      {
        contentType: "image/jpeg",
        filename: "hero.jpg",
      },
      {},
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Wedding website hero image upload is not available.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON on hero image upload intent requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await malformedJsonReq(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/hero-image-upload-intent`,
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 400 when an unsupported content type is submitted for hero image upload", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/hero-image-upload-intent`,
      {
        contentType: "application/pdf",
        filename: "malicious.pdf",
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Unsupported image type" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each(["image/jpeg", "image/png", "image/webp", "image/avif"])(
    "accepts allowed content type %s for hero image upload",
    async (contentType) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          result: {
            id: "cf-img-id",
            uploadURL: "https://upload.example.com/direct",
          },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const db = makeDb([
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      ]);
      const app = makeApp(db, makeAuth());

      const res = await req(
        app,
        "POST",
        `/weddings/${WEDDING_ROW.id}/website/hero-image-upload-intent`,
        {
          contentType,
          filename: "hero.jpg",
        },
        {
          CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
          CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
          CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
        },
      );

      expect(res.status).toBe(200);
    },
  );

  it("returns 400 when GIF is submitted for hero image upload", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/hero-image-upload-intent`,
      {
        contentType: "image/gif",
        filename: "animated.gif",
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Unsupported image type",
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("propagates error when createHeroImageUploadIntent throws (not swallowed)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network failure"));
    vi.stubGlobal("fetch", fetchMock);

    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/hero-image-upload-intent`,
      {
        contentType: "image/jpeg",
        filename: "hero.jpg",
      },
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    // Should propagate as 500, not silently return a "not configured" 500
    expect(res.status).toBe(500);
    const text = await res.text();
    // Error is propagated, not swallowed as a generic "not configured" message
    expect(text).not.toContain("Hero image upload intent is not configured.");
  });

  it("rejects publish when a draft slug has become unavailable", async () => {
    const draftRow = {
      id: "website-1",
      weddingId: WEDDING_ROW.id,
      template: "classic",
      slug: "shared-slug",
      publishedSlug: null,
      draftContent: {
        hero: { title: "Draft Anna & Lee" },
        story: { title: "Draft story" },
        venue: { name: "Draft venue" },
        registry: { title: "Draft registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
      publishedContent: null,
      publishedTemplate: null,
      publishedAt: null,
      createdAt: new Date("2026-04-01"),
      updatedAt: new Date("2026-04-01"),
    };
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [draftRow],
      [OTHER_WEBSITE_ROW],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/publish`,
    );

    expect(res.status).toBe(409);
  });

  it("publishWebsiteDraft runs the slug-conflict check and update atomically in a transaction", async () => {
    const draftRow = {
      id: "website-1",
      weddingId: WEDDING_ROW.id,
      template: "classic",
      slug: "anna-and-lee",
      publishedSlug: null,
      draftContent: {
        hero: { title: "Draft" },
        story: { title: "Draft story" },
        venue: { name: "Draft venue" },
        registry: { title: "Draft registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
      publishedContent: null,
      publishedTemplate: null,
      publishedAt: null,
      createdAt: new Date("2026-04-01"),
      updatedAt: new Date("2026-04-01"),
    };
    const publishedRow = {
      ...draftRow,
      publishedSlug: "anna-and-lee",
      publishedTemplate: "classic",
      publishedAt: new Date("2026-04-08"),
    };
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [draftRow],
        [],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [publishedRow],
      ],
      [publishedRow],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/publish`,
    );
    expect(res.status).toBe(200);
    await Promise.resolve();
    await Promise.resolve();
    // The publish logic must run inside a transaction
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("rejects publish when a stored draft has a non-Cloudflare hero image URL", async () => {
    const draftRow = {
      id: "website-1",
      weddingId: WEDDING_ROW.id,
      template: "classic",
      slug: "anna-and-lee",
      publishedSlug: null,
      draftContent: {
        hero: { title: "Draft" },
        story: { title: "Draft story" },
        venue: { name: "Draft venue" },
        registry: { title: "Draft registry" },
        rsvp: { visible: true },
        heroImage: {
          imageId: "cloudflare-image-1",
          url: "https://cdn.example.com/image.jpg",
          alt: "Hero",
          mimeType: "image/jpeg",
        },
      },
      publishedContent: null,
      publishedTemplate: null,
      publishedAt: null,
      createdAt: new Date("2026-04-01"),
      updatedAt: new Date("2026-04-01"),
    };
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [draftRow],
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/publish`,
      undefined,
      {
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error:
        "Hero image URL must use the configured Cloudflare Images delivery domain.",
    });
  });

  it("rejects publish when a stored draft hero image belongs to another wedding", async () => {
    const draftRow = {
      id: "website-1",
      weddingId: WEDDING_ROW.id,
      template: "classic",
      slug: "anna-and-lee",
      publishedSlug: null,
      draftContent: {
        hero: { title: "Draft" },
        story: { title: "Draft story" },
        venue: { name: "Draft venue" },
        registry: { title: "Draft registry" },
        rsvp: { visible: true },
        heroImage: {
          imageId: "cloudflare-image-1",
          url: "https://imagedelivery.net/hash/cloudflare-image-1/public",
          alt: "Hero",
          mimeType: "image/jpeg",
        },
      },
      publishedContent: null,
      publishedTemplate: null,
      publishedAt: null,
      createdAt: new Date("2026-04-01"),
      updatedAt: new Date("2026-04-01"),
    };
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [draftRow],
      [],
    ]);
    const app = makeApp(db, makeAuth());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          result: {
            metadata: {
              weddingId: "00000000-0000-4000-8000-000000000102",
              purpose: "wedding-website-hero",
            },
          },
        }),
      }),
    );

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/publish`,
      undefined,
      {
        CLOUDFLARE_IMAGES_ACCOUNT_ID: "account-123",
        CLOUDFLARE_IMAGES_API_TOKEN: "token-123",
        CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Hero image does not belong to this wedding.",
    });
  });

  it("stores a published snapshot and keeps the public route on the published data", async () => {
    const draftRow = {
      id: "website-1",
      weddingId: WEDDING_ROW.id,
      template: "classic",
      slug: "anna-and-lee",
      publishedSlug: null,
      draftContent: {
        hero: { title: "Draft Anna & Lee" },
        story: { title: "Draft story" },
        venue: { name: "Draft venue" },
        registry: { title: "Draft registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
      publishedContent: null,
      publishedTemplate: null,
      publishedAt: null,
      createdAt: new Date("2026-04-01"),
      updatedAt: new Date("2026-04-01"),
    };
    const publishedRow = {
      ...draftRow,
      publishedSlug: "anna-and-lee",
      publishedTemplate: "classic",
      publishedContent: {
        hero: { title: "Anna & Lee" },
        story: { title: "Our Story" },
        venue: { name: "The Palm House" },
        registry: { title: "Registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
      publishedAt: new Date("2026-04-08"),
    };
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [draftRow],
        [],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [publishedRow],
      ],
      [publishedRow],
    );
    const app = makeApp(db, makeAuth());

    const publishRes = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/publish`,
    );
    expect(publishRes.status).toBe(200);
    await Promise.resolve();
    await Promise.resolve();
    expect(db.update).toHaveBeenCalledTimes(2);

    const publicRes = await req(app, "GET", `/public/websites/anna-and-lee`);
    expect(publicRes.status).toBe(200);

    const body = (await publicRes.json()) as {
      slug: string;
      template: string;
      content: { hero: { title: string } };
      draftContent?: unknown;
    };
    expect(body.slug).toBe("anna-and-lee");
    expect(body.content.hero.title).toBe("Anna & Lee");
    expect(body).not.toHaveProperty("draftContent");
  });

  it("records website feature use after unpublishing", async () => {
    const unpublishedRow = {
      ...PUBLISHED_WEBSITE_ROW,
      publishedSlug: null,
      publishedContent: null,
      publishedTemplate: null,
      publishedAt: null,
    };
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [PUBLISHED_WEBSITE_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      ],
      [unpublishedRow],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "DELETE",
      `/weddings/${WEDDING_ROW.id}/website/publish`,
    );

    expect(res.status).toBe(200);
    await Promise.resolve();
    await Promise.resolve();
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("rejects public website access for archived weddings", async () => {
    const db = makeDb([[PUBLISHED_ARCHIVED_WEBSITE_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/public/websites/anna-and-lee`);

    expect(res.status).toBe(423);
    await expect(res.json()).resolves.toMatchObject({
      error: "Wedding is archived and read-only",
    });
  });

  it("rejects public RSVP submissions when the honeypot is filled", async () => {
    const db = makeDb(
      [
        [HOUSEHOLD_TOKEN],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
      ],
      [{ id: PRIMARY_GUEST.id }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [
          {
            guestId: PRIMARY_GUEST.id,
            rsvpStatus: "accepted",
          },
        ],
        website: "spammy",
        turnstileToken: "valid-token",
      },
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON on public RSVP submissions", async () => {
    const db = makeDb([]);
    const app = makeApp(db, makeAuth());

    const res = await malformedJsonReq(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns 400 for null JSON on public RSVP submissions", async () => {
    const db = makeDb([]);
    const app = makeApp(db, makeAuth());

    const res = await rawJsonReq(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      "null",
      { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false" },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "JSON request body must be an object",
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects internal-only public RSVP statuses before token lookup", async () => {
    const db = makeDb([]);
    const app = makeApp(db, makeAuth());

    for (const rsvpStatus of ["pending", "invited"] as const) {
      const res = await req(
        app,
        "POST",
        `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
        {
          guests: [
            {
              guestId: PRIMARY_GUEST.id,
              rsvpStatus,
            },
          ],
          website: "",
        },
        { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false" },
      );

      expect(res.status).toBe(400);
    }
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects public RSVP submissions when Turnstile is required but missing", async () => {
    const db = makeDb([
      [HOUSEHOLD_TOKEN],
      [PUBLISHED_WEBSITE_ROW],
      [PRIMARY_GUEST, PLUS_ONE_GUEST],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [
          {
            guestId: PRIMARY_GUEST.id,
            rsvpStatus: "accepted",
          },
        ],
        website: "",
      },
    );

    expect(res.status).toBe(400);
  });

  it("returns household RSVP details for a valid token", async () => {
    const db = makeDb([
      [HOUSEHOLD_TOKEN],
      [PUBLISHED_WEBSITE_ROW],
      [PRIMARY_GUEST, PLUS_ONE_GUEST],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/public/rsvp/${HOUSEHOLD_TOKEN.token}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      primaryGuest: Record<string, unknown>;
      guests: Record<string, unknown>[];
    };

    expect(body).toMatchObject({
      token: HOUSEHOLD_TOKEN.token,
      primaryGuest: expect.objectContaining({ id: PRIMARY_GUEST.id }),
      guests: expect.arrayContaining([
        expect.objectContaining({ id: PRIMARY_GUEST.id }),
        expect.objectContaining({ id: PLUS_ONE_GUEST.id }),
      ]),
    });

    expect(body.primaryGuest).not.toHaveProperty("email");
    expect(body.primaryGuest).not.toHaveProperty("phone");
    expect(body.primaryGuest).not.toHaveProperty("dietaryNotes");
    expect(body.primaryGuest).not.toHaveProperty("weddingId");
    expect(body.primaryGuest).not.toHaveProperty("primaryGuestId");
    expect(body.guests[0]).not.toHaveProperty("email");
    expect(body.guests[0]).not.toHaveProperty("phone");
    expect(body.guests[0]).not.toHaveProperty("dietaryNotes");
  });

  it("returns 404 for public RSVP details when the website is unpublished", async () => {
    const db = makeDb([[HOUSEHOLD_TOKEN], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/public/rsvp/${HOUSEHOLD_TOKEN.token}`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "RSVP token not found.",
    });
  });

  it("returns 404 for public RSVP details when RSVP is hidden", async () => {
    const db = makeDb([
      [HOUSEHOLD_TOKEN],
      [
        {
          ...PUBLISHED_WEBSITE_ROW,
          publishedContent: {
            ...PUBLISHED_WEBSITE_ROW.publishedContent,
            rsvp: { visible: false },
          },
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/public/rsvp/${HOUSEHOLD_TOKEN.token}`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "RSVP token not found.",
    });
  });

  it("rejects public RSVP details for archived weddings", async () => {
    const db = makeDb([[HOUSEHOLD_TOKEN], [PUBLISHED_ARCHIVED_WEBSITE_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/public/rsvp/${HOUSEHOLD_TOKEN.token}`);

    expect(res.status).toBe(423);
    await expect(res.json()).resolves.toEqual({
      error: "Wedding is archived and read-only",
    });
  });

  it("returns 404 for an invalid RSVP token", async () => {
    const db = makeDb([[]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      "/public/rsvp/550e8400-e29b-41d4-a716-446655440999",
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when an RSVP token no longer has a primary guest", async () => {
    const db = makeDb([
      [HOUSEHOLD_TOKEN],
      [PUBLISHED_WEBSITE_ROW],
      [PLUS_ONE_GUEST],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(app, "GET", `/public/rsvp/${HOUSEHOLD_TOKEN.token}`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "RSVP token not found.",
    });
  });

  it("returns 404 when submitting an RSVP while the website is unpublished", async () => {
    const db = makeDb([[HOUSEHOLD_TOKEN], []]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
        website: "",
        turnstileToken: "",
      },
      {
        PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
      },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "RSVP token not found.",
    });
  });

  it("rejects public RSVP submissions for archived weddings without updating guests", async () => {
    const db = makeDb([[HOUSEHOLD_TOKEN], [PUBLISHED_ARCHIVED_WEBSITE_ROW]]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
        website: "",
        turnstileToken: "",
      },
      {
        PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
      },
    );

    expect(res.status).toBe(423);
    await expect(res.json()).resolves.toEqual({
      error: "Wedding is archived and read-only",
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("removes publicly declined guests from seating chart", async () => {
    const validChart = {
      width: 1200,
      height: 800,
      tables: [
        {
          id: "b0000000-0000-4000-8000-000000000040",
          name: "Table RSVP",
          shape: "round" as const,
          capacity: 2,
          x: 0,
          y: 0,
          seats: [
            {
              id: "a0000000-0000-4000-8000-000000000070",
              positionIndex: 0,
              guestId: PRIMARY_GUEST.id,
            },
            {
              id: "a0000000-0000-4000-8000-000000000071",
              positionIndex: 1,
              guestId: PLUS_ONE_GUEST.id,
            },
          ],
        },
      ],
    };
    const db = makeDb(
      [
        [HOUSEHOLD_TOKEN],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [{ weddingId: WEDDING_ROW.id, chart: validChart }],
        [{ ...PRIMARY_GUEST, rsvpStatus: "declined" }, PLUS_ONE_GUEST],
      ],
      [{ id: PRIMARY_GUEST.id }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "declined" }],
        website: "",
        turnstileToken: "",
      },
      {
        PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
      },
    );

    expect(res.status).toBe(200);
    expect(db.insert).toHaveBeenCalled();
  });

  it("returns 404 when submitting an RSVP token that no longer has a primary guest", async () => {
    const db = makeDb([
      [HOUSEHOLD_TOKEN],
      [PUBLISHED_WEBSITE_ROW],
      [PLUS_ONE_GUEST],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
        website: "",
        turnstileToken: "",
      },
      {
        PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
      },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "RSVP token not found.",
    });
  });

  it("updates only RSVP statuses for the household on submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      }),
    );
    const db = makeDb(
      [
        [HOUSEHOLD_TOKEN],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [],
      ],
      [{ id: PRIMARY_GUEST.id }, { id: PLUS_ONE_GUEST.id }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [
          { guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" },
          { guestId: PLUS_ONE_GUEST.id, rsvpStatus: "accepted" },
        ],
        website: "",
        turnstileToken: "token",
      },
      {
        TURNSTILE_SECRET_KEY: "secret-123",
      },
    );

    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });

  it("rejects duplicate public RSVP guest IDs before updating guests", async () => {
    const db = makeDb([
      [HOUSEHOLD_TOKEN],
      [PUBLISHED_WEBSITE_ROW],
      [PRIMARY_GUEST, PLUS_ONE_GUEST],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [
          { guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" },
          { guestId: PRIMARY_GUEST.id, rsvpStatus: "declined" },
        ],
        website: "",
        turnstileToken: "",
      },
      {
        PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
      },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Duplicate guest IDs are not allowed.",
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("accepts public RSVP submissions without a Turnstile token when verification is disabled", async () => {
    const db = makeDb(
      [
        [HOUSEHOLD_TOKEN],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [],
      ],
      [{ id: PRIMARY_GUEST.id }, { id: PLUS_ONE_GUEST.id }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [
          { guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" },
          { guestId: PLUS_ONE_GUEST.id, rsvpStatus: "accepted" },
        ],
        website: "",
        turnstileToken: "",
      },
      {
        PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
      },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ updated: 2 });
    expect(db.update).toHaveBeenCalled();
  });

  it("accepts public RSVP submissions with custom anti-spam field names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      }),
    );
    const db = makeDb(
      [
        [HOUSEHOLD_TOKEN],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [],
      ],
      [{ updated: true }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
        botField: "",
        challengeField: "token",
      },
      {
        PUBLIC_RSVP_HONEYPOT_FIELD: "botField",
        PUBLIC_RSVP_TURNSTILE_FIELD: "challengeField",
        TURNSTILE_SECRET_KEY: "secret-123",
      },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ updated: 1 });
  });

  it("returns 409 when a public RSVP guest disappears before update", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      }),
    );
    const db = makeDb([
      [HOUSEHOLD_TOKEN],
      [PUBLISHED_WEBSITE_ROW],
      [PRIMARY_GUEST, PLUS_ONE_GUEST],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
        botField: "",
        challengeField: "token",
      },
      {
        PUBLIC_RSVP_HONEYPOT_FIELD: "botField",
        PUBLIC_RSVP_TURNSTILE_FIELD: "challengeField",
        TURNSTILE_SECRET_KEY: "secret-123",
      },
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "One or more guest RSVPs could not be updated.",
    });
  });

  it("returns 409 when a public RSVP plus-one is reparented before update", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      }),
    );
    const reparentedPlusOne = {
      ...PLUS_ONE_GUEST,
      primaryGuestId: "00000000-0000-4000-8000-000000000099",
    };
    const db = makeDb(
      [
        [HOUSEHOLD_TOKEN],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [PRIMARY_GUEST, reparentedPlusOne],
      ],
      [{ id: PRIMARY_GUEST.id }, { id: PLUS_ONE_GUEST.id }],
    );
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [
          { guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" },
          { guestId: PLUS_ONE_GUEST.id, rsvpStatus: "accepted" },
        ],
        botField: "",
        challengeField: "token",
      },
      {
        PUBLIC_RSVP_HONEYPOT_FIELD: "botField",
        PUBLIC_RSVP_TURNSTILE_FIELD: "challengeField",
        TURNSTILE_SECRET_KEY: "secret-123",
      },
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "One or more guest RSVPs could not be updated.",
    });
  });

  it("sends an RSVP confirmation email after a successful submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      }),
    );
    const db = makeDb(
      [
        [HOUSEHOLD_TOKEN],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
      ],
      [{ updated: true }],
    );
    const emailService = makeEmailService();
    const app = makeApp(db, makeAuth(), emailService);

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
        website: "",
        turnstileToken: "token",
      },
      {
        TURNSTILE_SECRET_KEY: "secret-123",
      },
    );

    expect(res.status).toBe(200);
    expect(emailService.sendRsvpConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        weddingId: WEDDING_ROW.id,
        primaryGuestId: PRIMARY_GUEST.id,
        guestEmail: PRIMARY_GUEST.email,
      }),
    );
  });

  it("still returns success when RSVP confirmation delivery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      }),
    );
    const db = makeDb(
      [
        [HOUSEHOLD_TOKEN],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
      ],
      [{ updated: true }],
    );
    const emailService = makeEmailService();
    emailService.sendRsvpConfirmation.mockRejectedValueOnce(
      new Error("provider outage"),
    );
    const app = makeApp(db, makeAuth(), emailService);

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
        website: "",
        turnstileToken: "token",
      },
      {
        TURNSTILE_SECRET_KEY: "secret-123",
      },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ updated: 1 });
    expect(emailService.sendRsvpConfirmation).toHaveBeenCalledTimes(1);
  });

  it("sends manual RSVP reminders for selected primary guests", async () => {
    const db = makeDb({}) as unknown as Record<string, unknown>;
    let selectCount = 0;
    db.select = vi.fn().mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return makeSelectBuilder([MEMBER_ROW]);
      }
      if (selectCount === 2) {
        return makeSelectBuilder([
          { userId: TEST_USER.id, plan: "pro", status: "active" },
        ]);
      }
      if (selectCount === 3) {
        return makeSelectBuilder([PUBLISHED_WEBSITE_ROW]);
      }
      if (selectCount === 4) {
        return makeSelectBuilder([PRIMARY_GUEST]);
      }
      if (selectCount === 5) {
        return makeSelectBuilder([HOUSEHOLD_TOKEN]);
      }
      return makeSelectBuilder([]);
    });

    const emailService = makeEmailService();
    emailService.sendRsvpReminder.mockResolvedValueOnce({
      primaryGuestId: PRIMARY_GUEST.id,
      guestEmail: PRIMARY_GUEST.email,
      status: "sent",
      emailId: "email-456",
      error: null,
    });

    const app = makeApp(db as unknown as Database, makeAuth(), emailService);
    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/rsvp-reminders`,
      {
        primaryGuestIds: [PRIMARY_GUEST.id],
      },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      results: [
        {
          primaryGuestId: PRIMARY_GUEST.id,
          status: "sent",
          emailId: "email-456",
        },
      ],
    });
  });

  it("skips manual RSVP reminders when the published RSVP section is hidden", async () => {
    const hiddenRsvpWebsite = {
      ...PUBLISHED_WEBSITE_ROW,
      publishedContent: {
        ...PUBLISHED_WEBSITE_ROW.publishedContent,
        rsvp: { visible: false },
      },
    };
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [hiddenRsvpWebsite],
    ]);
    const emailService = makeEmailService();
    const app = makeApp(db, makeAuth(), emailService);
    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/rsvp-reminders`,
      {
        primaryGuestIds: [PRIMARY_GUEST.id],
      },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      results: [
        {
          primaryGuestId: PRIMARY_GUEST.id,
          status: "skippedNoWebsite",
          emailId: null,
        },
      ],
    });
    expect(emailService.sendRsvpReminder).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates a missing household token before sending a manual RSVP reminder", async () => {
    const db = makeDb(
      [
        [MEMBER_ROW],
        [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST],
        [],
      ],
      [CREATED_HOUSEHOLD_TOKEN],
    );
    const emailService = makeEmailService();
    const app = makeApp(db, makeAuth(), emailService);
    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/rsvp-reminders`,
      {
        primaryGuestIds: [PRIMARY_GUEST.id],
      },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      results: [
        {
          primaryGuestId: PRIMARY_GUEST.id,
          status: "sent",
          emailId: "email-456",
        },
      ],
    });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(emailService.sendRsvpReminder).toHaveBeenCalledWith({
      weddingId: WEDDING_ROW.id,
      primaryGuestId: PRIMARY_GUEST.id,
      guestEmail: PRIMARY_GUEST.email,
      token: CREATED_HOUSEHOLD_TOKEN.token,
    });
  });

  it("recovers when another request creates the household token first", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [PUBLISHED_WEBSITE_ROW],
      [PRIMARY_GUEST],
      [],
      [CREATED_HOUSEHOLD_TOKEN],
    ]) as unknown as Record<string, unknown>;
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockRejectedValue(
            new Error("household_rsvp_token_primary_guest_unique"),
          ),
      }),
    });
    const emailService = makeEmailService();
    const app = makeApp(db as unknown as Database, makeAuth(), emailService);
    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/rsvp-reminders`,
      {
        primaryGuestIds: [PRIMARY_GUEST.id],
      },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      results: [
        {
          primaryGuestId: PRIMARY_GUEST.id,
          status: "sent",
          emailId: "email-456",
        },
      ],
    });
    expect(emailService.sendRsvpReminder).toHaveBeenCalledWith({
      weddingId: WEDDING_ROW.id,
      primaryGuestId: PRIMARY_GUEST.id,
      guestEmail: PRIMARY_GUEST.email,
      token: CREATED_HOUSEHOLD_TOKEN.token,
    });
  });

  it("skips manual reminders when the household already responded", async () => {
    const respondedPrimaryGuest = {
      ...PRIMARY_GUEST,
      rsvpStatus: "accepted",
    };
    const db = makeDb({}) as unknown as Record<string, unknown>;
    let selectCount = 0;
    db.select = vi.fn().mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return makeSelectBuilder([MEMBER_ROW]);
      }
      if (selectCount === 2) {
        return makeSelectBuilder([
          { userId: TEST_USER.id, plan: "pro", status: "active" },
        ]);
      }
      if (selectCount === 3) {
        return makeSelectBuilder([PUBLISHED_WEBSITE_ROW]);
      }
      if (selectCount === 4) {
        return makeSelectBuilder([respondedPrimaryGuest]);
      }
      return makeSelectBuilder([]);
    });

    const emailService = makeEmailService();
    const app = makeApp(db as unknown as Database, makeAuth(), emailService);
    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website/rsvp-reminders`,
      {
        primaryGuestIds: [PRIMARY_GUEST.id],
      },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      results: [
        {
          primaryGuestId: PRIMARY_GUEST.id,
          status: "skippedIneligible",
          emailId: null,
        },
      ],
    });
    expect(emailService.sendRsvpReminder).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects public RSVP submissions when Turnstile verification fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: false }),
      }),
    );
    const db = makeDb([
      [HOUSEHOLD_TOKEN],
      [PUBLISHED_WEBSITE_ROW],
      [PRIMARY_GUEST, PLUS_ONE_GUEST],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
        website: "",
        turnstileToken: "bad-token",
      },
      {
        TURNSTILE_SECRET_KEY: "secret-123",
      },
    );

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Task 3: Slug availability must not leak conflictWeddingId (#19)
// ---------------------------------------------------------------------------
describe("GET slug-availability — privacy fix", () => {
  it("returns only { available } and no conflictWeddingId or slug or valid", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      // findSlugConflict returns a conflict from another wedding
      [
        {
          weddingId: "00000000-0000-4000-8000-000000000103",
          id: "other-website-id",
        },
      ],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/website/slug-availability?slug=taken-slug`,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("available");
    expect(body.available).toBe(false);
    expect(body).not.toHaveProperty("conflictWeddingId");
    expect(body).not.toHaveProperty("slug");
    expect(body).not.toHaveProperty("valid");
  });

  it("returns { available: true } when no conflict exists", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      // findSlugConflict returns no conflicts
      [],
    ]);
    const app = makeApp(db, makeAuth());

    const res = await req(
      app,
      "GET",
      `/weddings/${WEDDING_ROW.id}/website/slug-availability?slug=free-slug`,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["available"]);
    expect(body.available).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 4: upsertWebsiteDraft race condition — onConflictDoUpdate (#20)
// ---------------------------------------------------------------------------
describe("upsertWebsiteDraft — onConflictDoUpdate race fix", () => {
  it("uses insert().onConflictDoUpdate() instead of read-then-write", async () => {
    const WEBSITE_ROW = {
      id: "website-1",
      weddingId: WEDDING_ROW.id,
      slug: "my-wedding",
      template: "classic",
      draftContent: {
        hero: { title: "A & B" },
        story: { title: "Our Story" },
        venue: { name: "The Venue" },
        registry: { title: "Registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
      publishedSlug: null,
      publishedTemplate: null,
      publishedContent: null,
      publishedAt: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    let insertCallCount = 0;
    let onConflictDoUpdateCallCount = 0;

    // db with sequential selects: member, subscription, slug check, loadWeddingWebsite (existing)
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      // findSlugConflict returns empty (no conflict)
      [],
      // loadWeddingWebsite (existing check in handler) returns empty
      [],
    ]);

    // Override insert to verify onConflictDoUpdate is called
    (db as unknown as Record<string, unknown>).insert = vi
      .fn()
      .mockImplementation(() => {
        insertCallCount++;
        const builder: Record<string, unknown> = {};
        builder.values = vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockImplementation(() => {
            onConflictDoUpdateCallCount++;
            return {
              returning: vi.fn().mockResolvedValue([WEBSITE_ROW]),
            };
          }),
          returning: vi.fn().mockResolvedValue([WEBSITE_ROW]),
        });
        return builder;
      });

    const app = makeApp(db, makeAuth());

    const payload = {
      slug: "my-wedding",
      template: "classic",
      content: {
        hero: { title: "A & B" },
        story: { title: "Our Story" },
        venue: { name: "The Venue" },
        registry: { title: "Registry" },
        rsvp: { visible: true },
        heroImage: null,
      },
    };

    const res = await req(
      app,
      "POST",
      `/weddings/${WEDDING_ROW.id}/website`,
      payload,
    );

    // Request should succeed
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    // insert was called (the new upsert approach)
    expect(insertCallCount).toBeGreaterThanOrEqual(1);
    // onConflictDoUpdate was invoked — this proves no read-then-write is happening
    expect(onConflictDoUpdateCallCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Task 7b: RSVP confirmation email error must be logged (#25)
// ---------------------------------------------------------------------------
describe("POST /public/rsvp/:token — RSVP email error logging", () => {
  it("still returns 200 when confirmation email throws, and logs the error", async () => {
    // The public RSVP route doesn't use auth — it uses a token-based flow.
    // We need to mock: loadHouseholdToken, loadHouseholdGuests (x2), and the transaction.
    const db = makeDb(
      [
        // loadHouseholdToken
        [HOUSEHOLD_TOKEN],
        // loadPublishedWebsiteByWeddingId
        [PUBLISHED_WEBSITE_ROW],
        // loadHouseholdGuests (for buildHouseholdResponse check)
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        // loadHouseholdGuests called inside updateHouseholdRsvps (when not passed)
        // — NOT called since householdGuests IS passed from the handler
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        // loadHouseholdGuests (second call, after update, for email)
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
      ],
      [{ id: PRIMARY_GUEST.id }],
    );

    const emailService = makeEmailService();
    emailService.sendRsvpConfirmation.mockRejectedValueOnce(
      new Error("SMTP down"),
    );

    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const app = makeApp(db, makeAuth(), emailService);
    const res = await req(
      app,
      "POST",
      `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
      {
        guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
        website: "",
        turnstileToken: "",
      },
      // Disable Turnstile so the test doesn't require a real token
      { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false" },
    );

    expect(res.status).toBe(200);
    // The error must have been logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[RSVP]"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Task 18: RSVP rate limit — DO-backed (5/min per IP)
// ---------------------------------------------------------------------------

class MemStorage {
  private store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

function makeRateLimiterNamespace(): DurableObjectNamespace {
  const storage = new MemStorage() as unknown as DurableObjectStorage;
  const doInstance = new RateLimiter({
    storage,
  } as unknown as DurableObjectState);
  const stub = {
    fetch: (r: Request) => doInstance.fetch(r),
  } as unknown as DurableObjectStub;
  return {
    idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
    get: (_id: DurableObjectId) => stub,
    newUniqueId: () => ({ toString: () => "unique" }) as DurableObjectId,
    jurisdiction: () => ({}) as DurableObjectNamespace,
  } as unknown as DurableObjectNamespace;
}

describe("POST /public/rsvp/:token — DO-backed rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeRsvpDb() {
    return makeDb(
      [
        [HOUSEHOLD_TOKEN],
        [PUBLISHED_WEBSITE_ROW],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
        [PRIMARY_GUEST, PLUS_ONE_GUEST],
      ],
      [{ id: PRIMARY_GUEST.id }],
    );
  }

  function makeRsvpBody() {
    return {
      guests: [{ guestId: PRIMARY_GUEST.id, rsvpStatus: "accepted" }],
      website: "",
      turnstileToken: "",
    };
  }

  it("passes all requests through when RATE_LIMITER binding is absent (no-op)", async () => {
    const emailService = makeEmailService();
    // No RATE_LIMITER in env — middleware is a no-op, all requests succeed
    for (let i = 0; i < 8; i++) {
      const app = makeApp(makeRsvpDb(), makeAuth(), emailService);
      const res = await req(
        app,
        "POST",
        `/public/rsvp/${HOUSEHOLD_TOKEN.token}`,
        makeRsvpBody(),
        { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false" },
      );
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 on the 6th submission from the same IP within a minute", async () => {
    const ns = makeRateLimiterNamespace();
    const ip = "203.0.113.42";
    const emailService = makeEmailService();

    // 5 requests succeed
    for (let i = 0; i < 5; i++) {
      const app = makeApp(makeRsvpDb(), makeAuth(), emailService);
      const res = await app.fetch(
        new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": ip,
          },
          body: JSON.stringify(makeRsvpBody()),
        }),
        { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
      );
      expect(res.status).toBe(200);
    }

    // 6th blocked
    const app = makeApp(makeRsvpDb(), makeAuth(), emailService);
    const res = await app.fetch(
      new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": ip,
        },
        body: JSON.stringify(makeRsvpBody()),
      }),
      { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/rate limit/i);
  });

  it("returns Retry-After header on 429", async () => {
    const ns = makeRateLimiterNamespace();
    const ip = "10.0.0.5";
    const emailService = makeEmailService();

    for (let i = 0; i < 5; i++) {
      await makeApp(makeRsvpDb(), makeAuth(), emailService).fetch(
        new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": ip,
          },
          body: JSON.stringify(makeRsvpBody()),
        }),
        { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
      );
    }
    const res = await makeApp(makeRsvpDb(), makeAuth(), emailService).fetch(
      new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": ip,
        },
        body: JSON.stringify(makeRsvpBody()),
      }),
      { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });

  it("different IPs have independent buckets", async () => {
    const ns = makeRateLimiterNamespace();
    const emailService = makeEmailService();

    // Exhaust IP A's limit
    for (let i = 0; i < 5; i++) {
      await makeApp(makeRsvpDb(), makeAuth(), emailService).fetch(
        new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": "1.1.1.1",
          },
          body: JSON.stringify(makeRsvpBody()),
        }),
        { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
      );
    }

    // IP B should still be allowed
    const res = await makeApp(makeRsvpDb(), makeAuth(), emailService).fetch(
      new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "2.2.2.2",
        },
        body: JSON.stringify(makeRsvpBody()),
      }),
      { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
    );
    expect(res.status).toBe(200);
  });

  it("resets the rate limit counter after the window expires", async () => {
    const ns = makeRateLimiterNamespace();
    const ip = "5.5.5.5";
    const emailService = makeEmailService();
    const baseTime = new Date("2026-04-16T12:00:00.000Z").getTime();
    vi.setSystemTime(baseTime);

    // Exhaust limit
    for (let i = 0; i < 5; i++) {
      await makeApp(makeRsvpDb(), makeAuth(), emailService).fetch(
        new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": ip,
          },
          body: JSON.stringify(makeRsvpBody()),
        }),
        { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
      );
    }

    // 6th blocked
    const blocked = await makeApp(makeRsvpDb(), makeAuth(), emailService).fetch(
      new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": ip,
        },
        body: JSON.stringify(makeRsvpBody()),
      }),
      { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
    );
    expect(blocked.status).toBe(429);

    // Advance past the 60-second window
    vi.setSystemTime(baseTime + 61 * 1000);

    const reset = await makeApp(makeRsvpDb(), makeAuth(), emailService).fetch(
      new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": ip,
        },
        body: JSON.stringify(makeRsvpBody()),
      }),
      { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
    );
    expect(reset.status).toBe(200);
  });

  it("does not trust spoofed X-Forwarded-For when CF-Connecting-IP is absent", async () => {
    const ns = makeRateLimiterNamespace();
    const emailService = makeEmailService();

    for (let i = 0; i < 5; i++) {
      await makeApp(makeRsvpDb(), makeAuth(), emailService).fetch(
        new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": `198.51.100.${i}`,
          },
          body: JSON.stringify(makeRsvpBody()),
        }),
        { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
      );
    }

    const res = await makeApp(makeRsvpDb(), makeAuth(), emailService).fetch(
      new Request(`http://localhost/public/rsvp/${HOUSEHOLD_TOKEN.token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.51.100.99",
        },
        body: JSON.stringify(makeRsvpBody()),
      }),
      { PUBLIC_RSVP_REQUIRE_TURNSTILE: "false", RATE_LIMITER: ns } as never,
    );
    expect(res.status).toBe(429);
  });
});
