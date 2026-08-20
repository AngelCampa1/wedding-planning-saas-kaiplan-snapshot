import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const privacySource = readFileSync(
  fileURLToPath(new URL("./privacy.astro", import.meta.url)),
  "utf8",
);

describe("privacy page (editorial legal document)", () => {
  it("uses LandingLayout so the editorial masthead and colophon are included", () => {
    expect(privacySource).toContain("LandingLayout");
    expect(privacySource).not.toContain("BaseLayout");
  });

  it("renders the PRIVACY eyebrow as an editorial-eyebrow", () => {
    expect(privacySource).toContain("editorial-eyebrow");
    expect(privacySource).toContain("PRIVACY");
  });

  it("renders the display-M italic headline", () => {
    expect(privacySource).toContain("editorial-display-m");
    expect(privacySource).toContain("editorial-italic");
    expect(privacySource).toContain("Your data, our responsibility.");
  });

  it("stamps the policy with an effective date and datestamp class", () => {
    expect(privacySource).toContain("Effective date: 28 May 2026");
    expect(privacySource).toContain("page-datestamp");
  });

  it("renders hairline editorial-rule elements between sections", () => {
    const ruleCount = (privacySource.match(/editorial-rule/g) ?? []).length;
    // 14 sections + 1 trailing rule = 15 minimum
    expect(ruleCount).toBeGreaterThanOrEqual(15);
  });

  it("renders section headings with hanging Roman numerals (I. through XIV.)", () => {
    for (const numeral of [
      "I.",
      "II.",
      "III.",
      "IV.",
      "V.",
      "VI.",
      "VII.",
      "VIII.",
      "IX.",
      "X.",
      "XI.",
      "XII.",
      "XIII.",
      "XIV.",
    ]) {
      expect(privacySource).toContain(numeral);
    }
  });

  it("includes the required legal sections", () => {
    expect(privacySource).toContain("Who we are");
    expect(privacySource).toContain("What we collect");
    expect(privacySource).toContain("How and why we use it (legal bases)");
    expect(privacySource).toContain("Sub-processors");
    expect(privacySource).toContain("International transfers");
    expect(privacySource).toContain("Data retention");
    expect(privacySource).toContain("Security");
    expect(privacySource).toContain("Your rights");
    expect(privacySource).toContain("Data removal");
    expect(privacySource).toContain("Guests and other non-users");
    expect(privacySource).toContain("Cookies and analytics");
    expect(privacySource).toContain("Children");
    expect(privacySource).toContain("Changes to this policy");
    expect(privacySource).toContain("Contact");
  });

  it("addresses guest data about non-users", () => {
    expect(privacySource).toContain(
      "about people who are usually not Kaiplan users",
    );
    expect(privacySource).toContain("first and last name");
  });

  it("states GDPR legal bases and CCPA rights", () => {
    expect(privacySource).toContain("Performance of a contract");
    expect(privacySource).toContain("Legitimate interests");
    expect(privacySource).toContain("CCPA/CPRA");
    expect(privacySource).toContain("Information Commissioner's Office");
  });

  it("lists the verified sub-processors and no others", () => {
    expect(privacySource).toContain("Stripe");
    expect(privacySource).toContain("Resend");
    expect(privacySource).toContain("Neon");
    expect(privacySource).toContain("Google");
    expect(privacySource).toContain("PostHog");
    expect(privacySource).toContain("Sentry");
    expect(privacySource).toContain("Apollo.io");
    expect(privacySource).toContain("Cloudflare");
    expect(privacySource).toContain("Turnstile");
    expect(privacySource).toContain("D1");
    expect(privacySource).toContain("browser capture disabled by");
    expect(privacySource).toContain("hashed");
    expect(privacySource).toContain(
      "do not sell or share your data with advertisers",
    );
  });

  it("does not invent unverified safeguards", () => {
    expect(privacySource).not.toMatch(/SOC ?2/i);
    expect(privacySource).not.toMatch(/ISO ?27001/i);
    expect(privacySource).not.toMatch(/HIPAA/i);
    expect(privacySource).not.toMatch(/end-to-end encryption/i);
  });

  it("uses the Angel Campa contact address and editorial-link for email links", () => {
    expect(privacySource).toContain("editorial-link");
    expect(privacySource).toContain("angel.campa@kaiplan.app");
  });

  it("states the data-retention commitment", () => {
    expect(privacySource).toContain(
      "within a reasonable period when no longer required",
    );
  });

  it("does not use marketing-card, marketing-panel, or accordion patterns", () => {
    expect(privacySource).not.toContain("marketing-card");
    expect(privacySource).not.toContain("marketing-panel");
    expect(privacySource).not.toContain("<details");
    expect(privacySource).not.toContain("<summary");
  });

  it("does not import or render legacy SiteHeader/SiteFooter directly", () => {
    expect(privacySource).not.toContain('SiteHeader slot="header"');
    expect(privacySource).not.toContain('SiteFooter slot="footer"');
  });
});
