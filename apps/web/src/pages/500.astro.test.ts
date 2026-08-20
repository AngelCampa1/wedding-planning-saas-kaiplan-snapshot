import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverErrorSource = readFileSync(
  fileURLToPath(new URL("./500.astro", import.meta.url)),
  "utf8",
);

describe("500 page (Wave 5 — editorial error moment)", () => {
  it("uses LandingLayout so the editorial masthead and colophon are included", () => {
    expect(serverErrorSource).toContain("LandingLayout");
    expect(serverErrorSource).not.toContain("BaseLayout");
  });

  it("renders the editorial display-XL italic headline", () => {
    expect(serverErrorSource).toContain("editorial-display-xl");
    expect(serverErrorSource).toContain("editorial-italic");
    expect(serverErrorSource).toContain("Something went sideways.");
  });

  it("renders the support email link using editorial-link", () => {
    expect(serverErrorSource).toContain("editorial-link");
    expect(serverErrorSource).toContain("siteConfig.contactEmail");
    expect(serverErrorSource).toContain("Try refreshing");
  });

  it("does not render marketing-card, marketing-panel, or marketing-card-grid", () => {
    expect(serverErrorSource).not.toContain("marketing-card");
    expect(serverErrorSource).not.toContain("marketing-panel");
    expect(serverErrorSource).not.toContain("marketing-card-grid");
  });

  it("does not import or render legacy SiteHeader/SiteFooter directly", () => {
    expect(serverErrorSource).not.toContain('SiteHeader slot="header"');
    expect(serverErrorSource).not.toContain('SiteFooter slot="footer"');
  });
});
