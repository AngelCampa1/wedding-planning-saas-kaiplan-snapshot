import { describe, expect, expectTypeOf, it } from "vitest";
import {
  BILLING_FEATURES,
  BILLING_PLAN_FEATURES,
  type WeddingWebsiteContent,
  type HouseholdRsvpGuest,
  type HouseholdRsvpResponse,
  type RsvpStatus,
  weddingWebsiteTemplateSchema,
  weddingWebsiteSlugSchema,
  weddingWebsiteDraftContentSchema,
  weddingWebsiteDraftSchema,
  weddingWebsitePublishedSnapshotSchema,
  weddingWebsitePublicResponseSchema,
  householdRsvpTokenSchema,
  publicRsvpSubmissionSchema,
  weddingWebsiteSlugAvailabilitySchema,
  weddingWebsiteImageUploadIntentSchema,
} from "../src";

describe("billing features", () => {
  it("includes the wedding website feature only on pro and lifetime", () => {
    expect(BILLING_FEATURES).toContain("weddingWebsite");
    expect(BILLING_PLAN_FEATURES.starter).not.toContain("weddingWebsite");
    expect(BILLING_PLAN_FEATURES.pro).toContain("weddingWebsite");
    expect(BILLING_PLAN_FEATURES.lifetime).toContain("weddingWebsite");
    expect(BILLING_PLAN_FEATURES.free).not.toContain("weddingWebsite");
  });
});

describe("weddingWebsiteTemplateSchema", () => {
  it("accepts the three supported templates", () => {
    for (const template of ["classic", "modern", "editorial"] as const) {
      expect(weddingWebsiteTemplateSchema.safeParse(template).success).toBe(
        true,
      );
    }
  });
});

describe("weddingWebsiteSlugSchema", () => {
  it("accepts lowercase slugs with hyphens", () => {
    expect(weddingWebsiteSlugSchema.safeParse("anna-and-lee").success).toBe(
      true,
    );
  });

  it("rejects uppercase slugs", () => {
    expect(weddingWebsiteSlugSchema.safeParse("Anna-And-Lee").success).toBe(
      false,
    );
  });

  it("rejects reserved slugs", () => {
    expect(weddingWebsiteSlugSchema.safeParse("admin").success).toBe(false);
  });

  it("rejects infrastructure reserved words (www, mail, ftp)", () => {
    expect(weddingWebsiteSlugSchema.safeParse("www").success).toBe(false);
    expect(weddingWebsiteSlugSchema.safeParse("mail").success).toBe(false);
    expect(weddingWebsiteSlugSchema.safeParse("ftp").success).toBe(false);
  });
});

describe("wedding website content schemas", () => {
  it("accepts normalized draft content", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      hero: {
        title: "Anna & Lee",
        subtitle: "We are getting married",
        body: "Join us for the ceremony and reception.",
      },
      story: {
        title: "Our Story",
        body: "We met at a coffee shop and never stopped talking.",
      },
      venue: {
        name: "The Palm House",
        address: "123 Garden Lane",
        details: "Ceremony begins at 4pm.",
      },
      registry: {
        title: "Registry",
        url: "https://registry.example.com/anna-lee",
      },
      rsvp: {
        visible: true,
        headline: "RSVP by May 1",
      },
      heroImage: {
        imageId: "hero-image-1",
        url: "https://cdn.example.com/hero.jpg",
        alt: "Anna and Lee",
        width: 1600,
        height: 900,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hero.subtitle).toBe("We are getting married");
      expect(result.data.hero.body).toBe(
        "Join us for the ceremony and reception.",
      );
      expect(result.data.story.body).toBe(
        "We met at a coffee shop and never stopped talking.",
      );
      expect(result.data.venue.address).toBe("123 Garden Lane");
      expect(result.data.registry.details).toBe("");
      expect(result.data.rsvp.details).toBe("");
    }
  });

  it("accepts a blank venue section so optional editor fields can save", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      hero: {
        title: "Anna & Lee",
        subtitle: "We are getting married",
        body: "Join us for the ceremony and reception.",
      },
      story: {
        title: "Our Story",
        body: "We met at a coffee shop and never stopped talking.",
      },
      venue: {
        name: "",
        address: "",
        details: "",
        mapUrl: null,
      },
      registry: {
        title: "Registry",
        url: null,
        details: "",
      },
      rsvp: {
        visible: true,
        headline: "RSVP by May 1",
        details: "",
      },
      heroImage: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.venue.name).toBe("");
      expect(result.data.venue.address).toBe("");
      expect(result.data.venue.details).toBe("");
    }
  });

  it("returns a human-readable message when the hero title is missing", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      hero: {
        title: "",
        subtitle: "",
        body: "",
        ctaLabel: "Open RSVP",
      },
      story: {
        title: "Our Story",
        body: "",
      },
      venue: {
        name: "",
        address: "",
        details: "",
        mapUrl: null,
      },
      registry: {
        title: "Registry",
        url: null,
        details: "",
      },
      rsvp: {
        visible: true,
        headline: "Please RSVP",
        details: "",
      },
      heroImage: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.hero?.[0]).toBe(
        "Hero title is required.",
      );
    }
  });

  it("keeps normalized content body fields required in the shared type", () => {
    expectTypeOf<
      WeddingWebsiteContent["hero"]["body"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      WeddingWebsiteContent["story"]["body"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      WeddingWebsiteContent["venue"]["details"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      WeddingWebsiteContent["registry"]["details"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      WeddingWebsiteContent["rsvp"]["details"]
    >().toEqualTypeOf<string>();
  });

  it("accepts a published website response", () => {
    expect(
      weddingWebsitePublicResponseSchema.safeParse({
        weddingId: "550e8400-e29b-41d4-a716-446655440000",
        slug: "anna-and-lee",
        template: "classic",
        publishedAt: "2026-04-08T10:00:00.000Z",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "The Palm House" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: null,
        },
      }).success,
    ).toBe(true);
  });

  it("keeps the public RSVP guest contract narrow", () => {
    expectTypeOf<HouseholdRsvpGuest>().toEqualTypeOf<{
      id: string;
      firstName: string;
      lastName: string;
      rsvpStatus: RsvpStatus;
    }>();

    expectTypeOf<
      HouseholdRsvpResponse["primaryGuest"]
    >().toEqualTypeOf<HouseholdRsvpGuest>();

    expectTypeOf<
      HouseholdRsvpResponse["guests"][number]
    >().toEqualTypeOf<HouseholdRsvpGuest>();
  });
});

describe("RSVP token schemas", () => {
  it("accepts a household token record", () => {
    expect(
      householdRsvpTokenSchema.safeParse({
        token: "550e8400-e29b-41d4-a716-446655440000",
        weddingId: "550e8400-e29b-41d4-a716-446655440001",
        primaryGuestId: "550e8400-e29b-41d4-a716-446655440002",
        createdAt: "2026-04-08T10:00:00.000Z",
        updatedAt: "2026-04-08T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts a public RSVP submission payload", () => {
    expect(
      publicRsvpSubmissionSchema.safeParse({
        guests: [
          {
            guestId: "550e8400-e29b-41d4-a716-446655440002",
            rsvpStatus: "accepted",
          },
        ],
        honeypot: "",
        turnstileToken: "token",
      }).success,
    ).toBe(true);
  });

  it("rejects internal-only RSVP statuses on public submissions", () => {
    for (const rsvpStatus of ["pending", "invited"] as const) {
      expect(
        publicRsvpSubmissionSchema.safeParse({
          guests: [
            {
              guestId: "550e8400-e29b-41d4-a716-446655440002",
              rsvpStatus,
            },
          ],
          honeypot: "",
          turnstileToken: "token",
        }).success,
      ).toBe(false);
    }
  });

  it("normalizes an empty turnstile token when verification is disabled upstream", () => {
    const result = publicRsvpSubmissionSchema.safeParse({
      guests: [
        {
          guestId: "550e8400-e29b-41d4-a716-446655440002",
          rsvpStatus: "accepted",
        },
      ],
      honeypot: "",
      turnstileToken: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turnstileToken).toBeUndefined();
    }
  });

  it("accepts a slug availability payload", () => {
    expect(
      weddingWebsiteSlugAvailabilitySchema.safeParse({
        slug: "anna-and-lee",
        valid: true,
        available: false,
        conflictWeddingId: "550e8400-e29b-41d4-a716-446655440100",
      }).success,
    ).toBe(true);
  });

  it("accepts a hero image upload intent payload", () => {
    expect(
      weddingWebsiteImageUploadIntentSchema.safeParse({
        imageId: "cloudflare-image-1",
        uploadUrl: "https://upload.example.com/direct",
        imageUrl: "https://imagedelivery.net/hash/cloudflare-image-1/public",
        expiresAt: "2026-04-08T10:15:00.000Z",
      }).success,
    ).toBe(true);
  });
});

describe("website content schema — URL security (XSS prevention)", () => {
  const baseContent = {
    hero: { title: "Anna & Lee" },
    story: { title: "Our Story" },
    venue: { name: "" },
    registry: { title: "Registry" },
    rsvp: { visible: true },
    heroImage: null,
  };

  it("rejects javascript: URL in heroImage.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      heroImage: { url: "javascript:alert(1)", alt: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects data: URL in heroImage.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      heroImage: {
        url: "data:text/html,<script>alert(1)</script>",
        alt: "",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects http:// URL in heroImage.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      heroImage: { url: "http://cdn.example.com/image.jpg", alt: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string heroImage.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      heroImage: { imageId: "hero-image-1", url: 42, alt: "" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts https:// URL in heroImage.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      heroImage: {
        imageId: "hero-image-1",
        url: "https://cdn.example.com/image.jpg",
        alt: "",
      },
    });
    expect(result.success).toBe(true);
  });

  it("trims https:// URL in heroImage.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      heroImage: {
        imageId: "hero-image-1",
        url: "  https://cdn.example.com/image.jpg  ",
        alt: "",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.heroImage?.url).toBe(
        "https://cdn.example.com/image.jpg",
      );
    }
  });

  it("rejects javascript: URL in venue.mapUrl", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      venue: { name: "The Palm House", mapUrl: "javascript:void(0)" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects ftp:// URL in venue.mapUrl", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      venue: {
        name: "The Palm House",
        mapUrl: "ftp://maps.example.com/location",
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts https:// URL in venue.mapUrl", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      venue: {
        name: "The Palm House",
        mapUrl: "https://maps.google.com/?q=Palm+House",
      },
    });
    expect(result.success).toBe(true);
  });

  it("normalizes blank venue.mapUrl to null", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      venue: {
        name: "The Palm House",
        mapUrl: "   ",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.venue.mapUrl).toBeNull();
    }
  });

  it("trims venue.mapUrl", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      venue: {
        name: "The Palm House",
        mapUrl: "  https://maps.google.com/?q=Palm+House  ",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.venue.mapUrl).toBe(
        "https://maps.google.com/?q=Palm+House",
      );
    }
  });

  it("rejects javascript: URL in registry.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      registry: {
        title: "Registry",
        url: "javascript:alert('xss')",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects data: URL in registry.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      registry: {
        title: "Registry",
        url: "data:text/html,<b>hi</b>",
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts https:// URL in registry.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      registry: {
        title: "Registry",
        url: "https://registry.example.com/anna-lee",
      },
    });
    expect(result.success).toBe(true);
  });

  it("normalizes blank registry.url to null", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      registry: {
        title: "Registry",
        url: "   ",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.registry.url).toBeNull();
    }
  });

  it("trims registry.url", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      registry: {
        title: "Registry",
        url: "  https://registry.example.com/anna-lee  ",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.registry.url).toBe(
        "https://registry.example.com/anna-lee",
      );
    }
  });

  it("accepts null for optional URL fields", () => {
    const result = weddingWebsiteDraftContentSchema.safeParse({
      ...baseContent,
      venue: { name: "", mapUrl: null },
      registry: { title: "Registry", url: null },
    });
    expect(result.success).toBe(true);
  });
});

describe("publicRsvpSubmissionSchema — upper-bound limits", () => {
  const guestEntry = (id: number) => ({
    guestId: `550e8400-e29b-41d4-a716-${String(id).padStart(12, "0")}`,
    rsvpStatus: "accepted" as const,
  });

  it("accepts guests array with exactly 50 items", () => {
    const result = publicRsvpSubmissionSchema.safeParse({
      guests: Array.from({ length: 50 }, (_, i) => guestEntry(i + 1)),
      honeypot: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects guests array with 51 items", () => {
    const result = publicRsvpSubmissionSchema.safeParse({
      guests: Array.from({ length: 51 }, (_, i) => guestEntry(i + 1)),
      honeypot: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts honeypot with exactly 200 characters", () => {
    const result = publicRsvpSubmissionSchema.safeParse({
      guests: [guestEntry(1)],
      honeypot: "a".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("rejects honeypot with 201 characters", () => {
    const result = publicRsvpSubmissionSchema.safeParse({
      guests: [guestEntry(1)],
      honeypot: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("weddingWebsitePublishedSnapshotSchema publishedAt datetime validation", () => {
  const baseSnapshot = {
    weddingId: "wedding-id-1",
    slug: "anna-and-lee",
    template: "classic",
    content: {
      hero: { title: "Anna & Lee" },
      story: { title: "Our Story" },
      venue: { name: "" },
      registry: { title: "Registry" },
      rsvp: { visible: true },
      heroImage: null,
    },
  };

  it("rejects a non-datetime string for publishedAt", () => {
    expect(
      weddingWebsitePublishedSnapshotSchema.safeParse({
        ...baseSnapshot,
        publishedAt: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("rejects a date-only string for publishedAt", () => {
    expect(
      weddingWebsitePublishedSnapshotSchema.safeParse({
        ...baseSnapshot,
        publishedAt: "2026-04-08",
      }).success,
    ).toBe(false);
  });

  it("accepts a valid ISO datetime for publishedAt", () => {
    expect(
      weddingWebsitePublishedSnapshotSchema.safeParse({
        ...baseSnapshot,
        publishedAt: "2026-04-08T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});

describe("weddingWebsitePublicResponseSchema publishedAt datetime validation", () => {
  it("rejects a non-datetime string for publishedAt", () => {
    expect(
      weddingWebsitePublicResponseSchema.safeParse({
        weddingId: "wedding-id-1",
        slug: "anna-and-lee",
        template: "classic",
        publishedAt: "not-a-date",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: null,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a date-only string for publishedAt", () => {
    expect(
      weddingWebsitePublicResponseSchema.safeParse({
        weddingId: "wedding-id-1",
        slug: "anna-and-lee",
        template: "classic",
        publishedAt: "2026-04-08",
        content: {
          hero: { title: "Anna & Lee" },
          story: { title: "Our Story" },
          venue: { name: "" },
          registry: { title: "Registry" },
          rsvp: { visible: true },
          heroImage: null,
        },
      }).success,
    ).toBe(false);
  });
});

describe("householdRsvpTokenSchema datetime validation", () => {
  const validToken = {
    token: "550e8400-e29b-41d4-a716-446655440000",
    weddingId: "550e8400-e29b-41d4-a716-446655440001",
    primaryGuestId: "550e8400-e29b-41d4-a716-446655440002",
    createdAt: "2026-04-08T10:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
  };

  it("rejects a non-datetime string for createdAt", () => {
    expect(
      householdRsvpTokenSchema.safeParse({
        ...validToken,
        createdAt: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("rejects a date-only string for createdAt", () => {
    expect(
      householdRsvpTokenSchema.safeParse({
        ...validToken,
        createdAt: "2026-04-08",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-datetime string for updatedAt", () => {
    expect(
      householdRsvpTokenSchema.safeParse({
        ...validToken,
        updatedAt: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("rejects a date-only string for updatedAt", () => {
    expect(
      householdRsvpTokenSchema.safeParse({
        ...validToken,
        updatedAt: "2026-04-08",
      }).success,
    ).toBe(false);
  });
});

describe("weddingWebsiteDraftSchema publishedAt datetime validation", () => {
  const baseDraft = {
    weddingId: "wedding-id-1",
    slug: "anna-and-lee",
    template: "classic",
    content: {
      hero: { title: "Anna & Lee" },
      story: { title: "Our Story" },
      venue: { name: "" },
      registry: { title: "Registry" },
      rsvp: { visible: true },
      heroImage: null,
    },
  };

  it("accepts a valid ISO datetime string for publishedAt", () => {
    const result = weddingWebsiteDraftSchema.safeParse({
      ...baseDraft,
      publishedAt: "2026-04-08T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null publishedAt", () => {
    const result = weddingWebsiteDraftSchema.safeParse({
      ...baseDraft,
      publishedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid datetime string for publishedAt", () => {
    const result = weddingWebsiteDraftSchema.safeParse({
      ...baseDraft,
      publishedAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a date-only string for publishedAt (must be ISO datetime)", () => {
    const result = weddingWebsiteDraftSchema.safeParse({
      ...baseDraft,
      publishedAt: "2026-04-08",
    });
    expect(result.success).toBe(false);
  });
});

describe("M35 — datetime offset support in website schemas", () => {
  const baseSnapshot = {
    weddingId: "wedding-id-1",
    slug: "anna-and-lee",
    template: "classic",
    content: {
      hero: { title: "Anna & Lee" },
      story: { title: "Our Story" },
      venue: { name: "" },
      registry: { title: "Registry" },
      rsvp: { visible: true },
      heroImage: null,
    },
  };

  it("accepts a UTC+offset publishedAt in weddingWebsitePublishedSnapshotSchema", () => {
    expect(
      weddingWebsitePublishedSnapshotSchema.safeParse({
        ...baseSnapshot,
        publishedAt: "2026-04-08T15:30:00+05:30",
      }).success,
    ).toBe(true);
  });

  it("accepts a UTC+offset publishedAt in weddingWebsitePublicResponseSchema", () => {
    expect(
      weddingWebsitePublicResponseSchema.safeParse({
        ...baseSnapshot,
        publishedAt: "2026-04-08T15:30:00+05:30",
      }).success,
    ).toBe(true);
  });

  it("accepts a UTC-offset publishedAt in weddingWebsitePublishedSnapshotSchema", () => {
    expect(
      weddingWebsitePublishedSnapshotSchema.safeParse({
        ...baseSnapshot,
        publishedAt: "2026-04-08T08:00:00-05:00",
      }).success,
    ).toBe(true);
  });

  it("accepts a UTC+offset publishedAt in weddingWebsiteDraftSchema", () => {
    expect(
      weddingWebsiteDraftSchema.safeParse({
        ...baseSnapshot,
        publishedAt: "2026-04-08T15:30:00+05:30",
      }).success,
    ).toBe(true);
  });

  it("accepts UTC+offset createdAt in householdRsvpTokenSchema", () => {
    expect(
      householdRsvpTokenSchema.safeParse({
        token: "550e8400-e29b-41d4-a716-446655440000",
        weddingId: "550e8400-e29b-41d4-a716-446655440001",
        primaryGuestId: "550e8400-e29b-41d4-a716-446655440002",
        createdAt: "2026-04-08T15:30:00+05:30",
        updatedAt: "2026-04-08T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts UTC+offset updatedAt in householdRsvpTokenSchema", () => {
    expect(
      householdRsvpTokenSchema.safeParse({
        token: "550e8400-e29b-41d4-a716-446655440000",
        weddingId: "550e8400-e29b-41d4-a716-446655440001",
        primaryGuestId: "550e8400-e29b-41d4-a716-446655440002",
        createdAt: "2026-04-08T10:00:00.000Z",
        updatedAt: "2026-04-08T15:30:00+05:30",
      }).success,
    ).toBe(true);
  });
});
