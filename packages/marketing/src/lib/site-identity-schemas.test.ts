import { describe, it, expect } from "vitest";
import { buildSiteIdentitySchemas } from "./site-identity-schemas";
import type { SiteConfig } from "../types";

function makeConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    name: "Kaiplan",
    domain: "kaiplan.app",
    tagline: "Plan Your Wedding.",
    metaDescription: "Meta description.",
    defaultOgImage: "/og-default.png",
    author: { name: "Angel Campa" },
    logo: { light: "/logo-light.svg", dark: "/logo-dark.svg" },
    theme: {
      primary: "#B0432A",
      accent: "#3A4A2C",
      surface: "#F5F1EA",
      text: "#171311",
      muted: "#3D3530",
      fonts: { heading: "Fraunces", body: "DM Sans" },
    },
    product: {
      category: "wedding planning",
      price: "$20/mo",
      targetAudience: "couples",
      trustSignals: [],
    },
    pricingTiers: [
      { name: "Starter", price: "$20", features: ["Budget"] },
      { name: "Pro", price: "$35", features: ["Everything"] },
    ],
    faqs: [],
    funnel: {
      bofu: { ctaText: "Start", ctaTarget: "https://my.kaiplan.app/signup" },
    },
    ...overrides,
  } as unknown as SiteConfig;
}

describe("buildSiteIdentitySchemas", () => {
  it("returns Organization, SoftwareApplication, and WebSite schemas with stable @ids", () => {
    const config = makeConfig();
    const result = buildSiteIdentitySchemas(config, {
      canonicalUrl: "https://kaiplan.app/pricing/",
    });

    expect(result.schemas).toHaveLength(3);
    const types = result.schemas.map((s) => s["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("SoftwareApplication");
    expect(types).toContain("WebSite");

    expect(result.ids.organizationId).toBe("https://kaiplan.app/#organization");
    expect(result.ids.softwareId).toBe("https://kaiplan.app/#software");
    expect(result.ids.websiteId).toBe("https://kaiplan.app/#website");
  });

  it("attaches organization @id as publisher on WebSite", () => {
    const config = makeConfig();
    const result = buildSiteIdentitySchemas(config, {
      canonicalUrl: "https://kaiplan.app/features/",
    });

    const website = result.schemas.find((s) => s["@type"] === "WebSite");
    expect(website).toBeDefined();
    expect((website as Record<string, unknown>).publisher).toEqual({
      "@id": "https://kaiplan.app/#organization",
    });
  });

  it("uses the canonicalUrl for the SoftwareApplication.url", () => {
    const config = makeConfig();
    const result = buildSiteIdentitySchemas(config, {
      canonicalUrl: "https://kaiplan.app/features/",
    });

    const software = result.schemas.find(
      (s) => s["@type"] === "SoftwareApplication",
    );
    expect((software as Record<string, unknown>).url).toBe(
      "https://kaiplan.app/features/",
    );
  });

  it("includes SearchAction on WebSite when searchPathTemplate is configured", () => {
    const config = makeConfig({
      searchPathTemplate: "/search?q={search_term_string}",
    });
    const result = buildSiteIdentitySchemas(config, {
      canonicalUrl: "https://kaiplan.app/",
    });

    const website = result.schemas.find((s) => s["@type"] === "WebSite") as
      | Record<string, unknown>
      | undefined;
    expect(website?.potentialAction).toBeDefined();
  });

  it("uses featureListOverride for SoftwareApplication.featureList when provided", () => {
    const config = makeConfig();
    const result = buildSiteIdentitySchemas(config, {
      canonicalUrl: "https://kaiplan.app/features/",
      featureListOverride: ["Budget ledger", "Guest list", "Seating chart"],
    });

    const software = result.schemas.find(
      (s) => s["@type"] === "SoftwareApplication",
    ) as Record<string, unknown> | undefined;
    expect(software?.featureList).toEqual([
      "Budget ledger",
      "Guest list",
      "Seating chart",
    ]);
  });

  it("omits SearchAction when searchPathTemplate is not configured", () => {
    const config = makeConfig();
    const result = buildSiteIdentitySchemas(config, {
      canonicalUrl: "https://kaiplan.app/",
    });

    const website = result.schemas.find((s) => s["@type"] === "WebSite") as
      | Record<string, unknown>
      | undefined;
    expect(website?.potentialAction).toBeUndefined();
  });

  it("includes sameAs, contactPoint, and areaServed on Organization when config provides them", () => {
    const config = makeConfig({
      sameAs: ["https://twitter.com/kaiplan"],
      contactEmail: "hello@kaiplan.app",
      areaServed: "United States",
    });
    const result = buildSiteIdentitySchemas(config, {
      canonicalUrl: "https://kaiplan.app/",
    });

    const organization = result.schemas.find(
      (s) => s["@type"] === "Organization",
    ) as Record<string, unknown> | undefined;
    expect(organization?.sameAs).toEqual(["https://twitter.com/kaiplan"]);
    expect(organization?.contactPoint).toBeDefined();
    expect(organization?.areaServed).toBe("United States");
    expect(organization?.logo).toEqual({
      "@type": "ImageObject",
      url: "https://kaiplan.app/logo-light.svg",
    });
  });

  it("builds Organization schema without optional fields when config omits them", () => {
    const config = makeConfig({
      author: undefined,
      sameAs: undefined,
      contactEmail: undefined,
      areaServed: undefined,
      logo: undefined,
    });
    const result = buildSiteIdentitySchemas(config, {
      canonicalUrl: "https://kaiplan.app/",
    });

    const organization = result.schemas.find(
      (s) => s["@type"] === "Organization",
    ) as Record<string, unknown> | undefined;
    expect(organization).toBeDefined();
    expect(organization?.founder).toBeUndefined();
    expect(organization?.sameAs).toBeUndefined();
    expect(organization?.contactPoint).toBeUndefined();
    expect(organization?.areaServed).toBeUndefined();
    expect(organization?.logo).toBeUndefined();
  });

  it("Organization schema does not contain a telephone field", () => {
    const config = makeConfig();
    const result = buildSiteIdentitySchemas(config, {
      canonicalUrl: "https://example.com/",
    });
    const orgSchema = result.schemas.find(
      (s) => (s as Record<string, unknown>)["@type"] === "Organization",
    );
    expect(orgSchema).toBeDefined();
    expect(orgSchema).not.toHaveProperty("telephone");
    expect(JSON.stringify(orgSchema)).not.toContain("telephone");
  });
});
