import { describe, expect, it } from "vitest";
import {
  INVALID_INVITE_LINK_MESSAGE,
  RSVP_TEMPORARY_ERROR_MESSAGE,
  loadPublicHouseholdRsvp,
  loadPublicWebsiteData,
  getContentCardClassName,
  getTemplateTheme,
  resolvePublicApiBase,
  shouldRenderRegistrySection,
  shouldRenderStorySection,
  shouldRenderVenueSection,
} from "./public-website";

describe("resolvePublicApiBase", () => {
  it("uses the configured public API when provided", () => {
    expect(
      resolvePublicApiBase(
        "https://preview-api.kaiplan.app/",
        new URL("https://preview.kaiplan.app/w/test"),
      ),
    ).toBe("https://preview-api.kaiplan.app");
  });

  it("keeps localhost pointed at the local API worker on port 5030", () => {
    expect(
      resolvePublicApiBase(undefined, new URL("http://localhost:4321/w/test")),
    ).toBe("http://localhost:5030");
  });

  it("keeps 127.0.0.1 pointed at the local API worker on port 5030", () => {
    expect(
      resolvePublicApiBase(undefined, new URL("http://127.0.0.1:4321/w/test")),
    ).toBe("http://127.0.0.1:5030");
  });

  it("falls back to the current origin outside local development", () => {
    expect(
      resolvePublicApiBase(
        undefined,
        new URL("https://preview.kaiplan.pages.dev/w/test"),
      ),
    ).toBe("https://preview.kaiplan.pages.dev");
  });
});

describe("shouldRenderVenueSection", () => {
  it("returns false when the venue section is completely blank", () => {
    expect(
      shouldRenderVenueSection({
        name: "",
        address: "",
        details: "",
        mapUrl: null,
      }),
    ).toBe(false);
  });

  it("returns true when any venue field has content", () => {
    expect(
      shouldRenderVenueSection({
        name: "",
        address: "123 Garden Lane",
        details: "",
        mapUrl: null,
      }),
    ).toBe(true);
  });
});

describe("shouldRenderStorySection", () => {
  it("returns false when the story body is blank", () => {
    expect(
      shouldRenderStorySection({
        title: "Our Story",
        body: "   ",
      }),
    ).toBe(false);
  });

  it("returns true when the story body has content", () => {
    expect(
      shouldRenderStorySection({
        title: "Our Story",
        body: "We met under the string lights.",
      }),
    ).toBe(true);
  });
});

describe("shouldRenderRegistrySection", () => {
  it("returns false when the registry details and URL are blank", () => {
    expect(
      shouldRenderRegistrySection({
        title: "Registry",
        details: "   ",
        url: "",
      }),
    ).toBe(false);
  });

  it("returns true when the couple has shared registry details", () => {
    expect(
      shouldRenderRegistrySection({
        title: "Registry",
        details: "Your presence is the best gift.",
        url: "",
      }),
    ).toBe(true);
  });

  it("returns true when the couple has shared a registry URL", () => {
    expect(
      shouldRenderRegistrySection({
        title: "",
        details: "",
        url: "https://registry.example.com",
      }),
    ).toBe(true);
  });
});

describe("getContentCardClassName", () => {
  it("returns the default card class when multiple content cards are visible", () => {
    expect(getContentCardClassName(2)).toBe("section-card");
  });

  it("stretches a single remaining content card across the grid", () => {
    expect(getContentCardClassName(1)).toBe("section-card section-card-wide");
  });
});

describe("getTemplateTheme", () => {
  it("returns semantic theme tokens for supported templates", () => {
    expect(getTemplateTheme("modern")).toMatchObject({
      pageClass: "theme-modern",
      panelBg: expect.any(String),
      panelStrong: expect.any(String),
      textMain: expect.any(String),
      line: expect.any(String),
      heroFrom: expect.any(String),
      heroTo: expect.any(String),
    });
  });

  it("falls back to the classic theme for unknown templates", () => {
    expect(getTemplateTheme("unknown-template")).toMatchObject({
      pageClass: "theme-classic",
      accent: "#b86e3f",
    });
  });
});

describe("loadPublicWebsiteData", () => {
  it("returns the website payload when the public website request succeeds", async () => {
    const website = {
      weddingId: "wedding-1",
      slug: "angel-and-sam",
      template: "classic",
      content: {
        hero: {
          title: "Angel & Sam",
          subtitle: "June 1, 2026",
          body: "",
          ctaLabel: "Open RSVP",
        },
        story: { title: "Our Story", body: "" },
        venue: { name: "", address: "", details: "", mapUrl: "" },
        registry: { title: "Registry", details: "", url: "" },
        rsvp: { visible: true, headline: "Please RSVP", details: "" },
        heroImage: null,
      },
    };

    const result = await loadPublicWebsiteData(
      async () => ({
        ok: true,
        status: 200,
        json: async () => website,
      }),
      "https://kaiplan.app",
      "angel-and-sam",
    );

    expect(result).toEqual({
      website,
      status: 200,
    });
  });
});

describe("loadPublicHouseholdRsvp", () => {
  it("returns the household payload when the RSVP request succeeds", async () => {
    const household = {
      weddingId: "wedding-1",
      primaryGuestId: "guest-1",
      guests: [
        {
          id: "guest-1",
          firstName: "Angel",
          lastName: "Lopez",
          rsvpStatus: "accepted",
        },
      ],
    };

    const result = await loadPublicHouseholdRsvp(
      async () => ({
        ok: true,
        status: 200,
        json: async () => household,
      }),
      "https://kaiplan.app",
      "token-123",
    );

    expect(result).toEqual({
      household,
      householdError: null,
    });
  });

  it("returns the invalid-link message when the RSVP request is rejected", async () => {
    const result = await loadPublicHouseholdRsvp(
      async () => ({
        ok: false,
        status: 404,
        json: async () => null,
      }),
      "https://kaiplan.app",
      "token-123",
    );

    expect(result).toEqual({
      household: null,
      householdError: INVALID_INVITE_LINK_MESSAGE,
    });
  });

  it("keeps malformed RSVP tokens in the invalid-link state", async () => {
    const result = await loadPublicHouseholdRsvp(
      async () => ({
        ok: false,
        status: 400,
        json: async () => null,
      }),
      "https://kaiplan.app",
      "bad-token",
    );

    expect(result).toEqual({
      household: null,
      householdError: INVALID_INVITE_LINK_MESSAGE,
    });
  });

  it("returns a retry message when the RSVP request fails temporarily", async () => {
    const result = await loadPublicHouseholdRsvp(
      async () => ({
        ok: false,
        status: 500,
        json: async () => null,
      }),
      "https://kaiplan.app",
      "token-123",
    );

    expect(result).toEqual({
      household: null,
      householdError: RSVP_TEMPORARY_ERROR_MESSAGE,
    });
  });

  it("returns a retry message when the RSVP request throws", async () => {
    const result = await loadPublicHouseholdRsvp(
      async () => {
        throw new Error("temporary outage");
      },
      "https://kaiplan.app",
      "token-123",
    );

    expect(result).toEqual({
      household: null,
      householdError: RSVP_TEMPORARY_ERROR_MESSAGE,
    });
  });
});
