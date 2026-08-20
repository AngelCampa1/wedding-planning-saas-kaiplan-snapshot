import { describe, expect, it } from "vitest";
import { buildCanonicalRedirectResponse } from "./canonical-redirect";

describe("buildCanonicalRedirectResponse", () => {
  it("canonicalizes apex HTTP slashless routes in one hop", () => {
    const response = buildCanonicalRedirectResponse(
      new URL("http://kaiplan.app/features"),
    );

    expect(response?.status).toBe(301);
    expect(response?.headers.get("Location")).toBe(
      "https://kaiplan.app/features/",
    );
  });

  it("canonicalizes www slashless routes while preserving query strings", () => {
    const response = buildCanonicalRedirectResponse(
      new URL("https://www.kaiplan.app/features?ref=nav"),
    );

    expect(response?.headers.get("Location")).toBe(
      "https://kaiplan.app/features/?ref=nav",
    );
  });

  it("redirects markdown pricing artifacts to the canonical pricing page", () => {
    const response = buildCanonicalRedirectResponse(
      new URL("https://kaiplan.app/pricing.md?utm_source=test"),
    );

    expect(response?.headers.get("Location")).toBe(
      "https://kaiplan.app/pricing/?utm_source=test",
    );
  });

  it("redirects legacy editorial slugs to their canonical guide URLs", () => {
    const response = buildCanonicalRedirectResponse(
      new URL(
        "https://kaiplan.app/resources/guides/the-knot-ftc-investigation-explained/?utm_source=test",
      ),
    );

    expect(response?.status).toBe(301);
    expect(response?.headers.get("Location")).toBe(
      "https://kaiplan.app/resources/guides/the-knot-platform-scrutiny/?utm_source=test",
    );
  });

  it("redirects slashless legacy editorial slugs without a redirect chain", () => {
    const response = buildCanonicalRedirectResponse(
      new URL(
        "https://kaiplan.app/resources/guides/the-knot-ftc-investigation-explained?utm_source=test",
      ),
    );

    expect(response?.status).toBe(301);
    expect(response?.headers.get("Location")).toBe(
      "https://kaiplan.app/resources/guides/the-knot-platform-scrutiny/?utm_source=test",
    );
  });

  it("skips static files, API routes, and wedding routes", () => {
    expect(
      buildCanonicalRedirectResponse(
        new URL("https://kaiplan.app/sitemap-index.xml"),
      ),
    ).toBeUndefined();
    expect(
      buildCanonicalRedirectResponse(
        new URL("https://kaiplan.app/site.webmanifest"),
      ),
    ).toBeUndefined();
    expect(
      buildCanonicalRedirectResponse(
        new URL("https://kaiplan.app/api/marketing/signup"),
      ),
    ).toBeUndefined();
    expect(
      buildCanonicalRedirectResponse(
        new URL("https://kaiplan.app/w/anna-and-lee"),
      ),
    ).toBeUndefined();
  });

  it("still canonicalizes host and protocol for excluded paths", () => {
    expect(
      buildCanonicalRedirectResponse(
        new URL("https://www.kaiplan.app/sitemap-index.xml"),
      )?.headers.get("Location"),
    ).toBe("https://kaiplan.app/sitemap-index.xml");
    expect(
      buildCanonicalRedirectResponse(
        new URL("http://kaiplan.app/robots.txt"),
      )?.headers.get("Location"),
    ).toBe("https://kaiplan.app/robots.txt");
    expect(
      buildCanonicalRedirectResponse(
        new URL("https://www.kaiplan.app/api/marketing/signup"),
      )?.headers.get("Location"),
    ).toBe("https://kaiplan.app/api/marketing/signup");
    expect(
      buildCanonicalRedirectResponse(
        new URL("https://www.kaiplan.app/w/anna-and-lee"),
      )?.headers.get("Location"),
    ).toBe("https://kaiplan.app/w/anna-and-lee");
  });
});
