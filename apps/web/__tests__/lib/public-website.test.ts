import { describe, expect, it } from "vitest";
import {
  INVALID_INVITE_LINK_MESSAGE,
  RSVP_TEMPORARY_ERROR_MESSAGE,
  buildInviteLink,
  buildPublicApiUrl,
  getTemplateTheme,
  loadPublicHouseholdRsvp,
  loadPublicWebsiteData,
  resolvePublicApiBase,
  shouldRenderStorySection,
} from "../../src/lib/public-website";

describe("public website helpers", () => {
  it("uses a configured API base when present", () => {
    expect(
      resolvePublicApiBase(
        "https://api.kaiplan.app/",
        new URL("https://kaiplan.app/w/anna-and-lee"),
      ),
    ).toBe("https://api.kaiplan.app");
  });

  it("falls back to localhost port 5030 during local development", () => {
    expect(
      resolvePublicApiBase(undefined, new URL("http://localhost:4321/w/test")),
    ).toBe("http://localhost:5030");
  });

  it("falls back to 127.0.0.1 port 5030 during local development", () => {
    expect(
      resolvePublicApiBase(undefined, new URL("http://127.0.0.1:4321/w/test")),
    ).toBe("http://127.0.0.1:5030");
  });

  it("falls back to the current origin outside localhost", () => {
    expect(
      resolvePublicApiBase(
        undefined,
        new URL("https://kaiplan.app/w/anna-and-lee"),
      ),
    ).toBe("https://kaiplan.app");
  });

  it("builds public API URLs and invite links", () => {
    expect(
      buildPublicApiUrl("https://my.kaiplan.app/", "/api/public/websites/test"),
    ).toBe("https://my.kaiplan.app/api/public/websites/test");
    expect(
      buildPublicApiUrl("https://my.kaiplan.app/", "api/public/rsvp/token-123"),
    ).toBe("https://my.kaiplan.app/api/public/rsvp/token-123");
    expect(
      buildInviteLink("https://kaiplan.app/", "anna-and-lee", "token-123"),
    ).toBe("https://kaiplan.app/w/anna-and-lee/?token=token-123#rsvp");
  });

  it("maps templates to the expected theme classes", () => {
    expect(getTemplateTheme("classic").pageClass).toBe("theme-classic");
    expect(getTemplateTheme("modern").pageClass).toBe("theme-modern");
    expect(getTemplateTheme("editorial").pageClass).toBe("theme-editorial");
  });

  it("maps templates to the expected hero classes", () => {
    expect(getTemplateTheme("classic").heroClass).toBe("hero-classic");
    expect(getTemplateTheme("modern").heroClass).toBe("hero-modern");
    expect(getTemplateTheme("editorial").heroClass).toBe("hero-editorial");
  });

  it("returns color tokens for the classic theme", () => {
    const theme = getTemplateTheme("classic");
    expect(theme.pageBg).toBe("#f7f1e8");
    expect(theme.accent).toBe("#b86e3f");
    expect(theme.accentSoft).toBe("rgba(184, 110, 63, 0.14)");
  });

  it("returns color tokens for the modern theme", () => {
    const theme = getTemplateTheme("modern");
    expect(theme.pageBg).toBe("#edf0ea");
    expect(theme.accent).toBe("#5f7d69");
    expect(theme.accentSoft).toBe("rgba(95, 125, 105, 0.14)");
  });

  it("returns color tokens for the editorial theme", () => {
    const theme = getTemplateTheme("editorial");
    expect(theme.pageBg).toBe("#f5efe8");
    expect(theme.accent).toBe("#7e4b46");
    expect(theme.accentSoft).toBe("rgba(126, 75, 70, 0.14)");
  });

  it("returns classic defaults for an unknown template", () => {
    const theme = getTemplateTheme("unknown");
    expect(theme.pageClass).toBe("theme-classic");
    expect(theme.heroClass).toBe("hero-classic");
    expect(theme.pageBg).toBe("#f7f1e8");
    expect(theme.accent).toBe("#b86e3f");
    expect(theme.accentSoft).toBe("rgba(184, 110, 63, 0.14)");
  });

  it("keeps the story section visible when only the title is populated", () => {
    expect(shouldRenderStorySection({ title: "Our Story", body: "" })).toBe(
      false,
    );
  });

  it("returns a 500 fallback when loading the public website throws", async () => {
    const fetcher = async () => {
      throw new Error("network down");
    };

    await expect(
      loadPublicWebsiteData(fetcher, "https://kaiplan.app", "anna-and-lee"),
    ).resolves.toMatchObject({
      website: null,
      status: 500,
    });
  });

  it("preserves 400 responses when the public website slug is invalid", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid slug." }),
    });

    await expect(
      loadPublicWebsiteData(fetcher, "https://kaiplan.app", "Invalid Slug"),
    ).resolves.toMatchObject({
      website: null,
      status: 400,
    });
  });

  it("returns an RSVP error message when the household lookup throws", async () => {
    const fetcher = async () => {
      throw new Error("network down");
    };

    await expect(
      loadPublicHouseholdRsvp(fetcher, "https://kaiplan.app", "token-123"),
    ).resolves.toEqual({
      household: null,
      householdError: RSVP_TEMPORARY_ERROR_MESSAGE,
    });
  });

  it("keeps the invalid-link message for RSVP tokens that are no longer valid", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "RSVP token not found." }),
    });

    await expect(
      loadPublicHouseholdRsvp(fetcher, "https://kaiplan.app", "token-123"),
    ).resolves.toEqual({
      household: null,
      householdError: INVALID_INVITE_LINK_MESSAGE,
    });
  });

  it("treats malformed RSVP tokens as invalid links instead of retryable errors", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid RSVP token." }),
    });

    await expect(
      loadPublicHouseholdRsvp(fetcher, "https://kaiplan.app", "bad-token"),
    ).resolves.toEqual({
      household: null,
      householdError: INVALID_INVITE_LINK_MESSAGE,
    });
  });
});
