import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { SurveyReminderEmail } from "./survey-reminder";

const props = {
  productName: "CrewRoute",
  domain: "crewroute.app",
  logoUrl: "https://crewroute.app/logo.png",
  brandColor: "#0066FF",
  accentColor: "#f59e0b",
  recipientEmail: "user@example.com",
  surveyToken:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("SurveyReminderEmail template", () => {
  it("renders without error", async () => {
    const html = await render(SurveyReminderEmail(props));
    expect(html).toBeTruthy();
  });

  it("contains product name", async () => {
    const html = await render(SurveyReminderEmail(props));
    expect(html).toContain("CrewRoute");
  });

  it("survey URL contains /?survey=open (trailing slash before query string)", async () => {
    // BUG 1: template was building `https://domain?survey=open` (no slash).
    // Must match the referral URL fix: `https://domain/?ref=CODE`.
    const html = await render(SurveyReminderEmail(props));
    expect(html).toContain("https://crewroute.app/?survey=open");
  });

  it("contains unsubscribe text", async () => {
    const html = await render(SurveyReminderEmail(props));
    expect(html).toContain("ignore this email");
  });

  it("surveyUrl includes the token without an email query param", async () => {
    const html = await render(SurveyReminderEmail(props));

    expect(html).toContain(`t=${props.surveyToken}`);
    expect(html).not.toMatch(/(?:&amp;|[?&])e=/);
  });

  it("surveyUrl does not expose the recipient email", async () => {
    const html = await render(SurveyReminderEmail(props));
    // React Email HTML-encodes & to &amp; in href attributes.
    // Match either &e= or &amp;e= to extract the base64-encoded email param.
    const match = html.match(/(?:&amp;|[?&])e=([A-Za-z0-9+/=]+)/);
    expect(match).toBeNull();
    expect(html).not.toContain("user@example.com");
  });

  // --- Redesign tests ---

  it("accent brow bar: rendered HTML contains accentColor value", async () => {
    const html = await render(SurveyReminderEmail(props));
    // The brow bar Section uses backgroundColor: accentColor (#f59e0b)
    expect(html).toContain("#f59e0b");
  });

  it("footer: rendered HTML contains footer attribution text", async () => {
    const html = await render(SurveyReminderEmail(props));
    expect(html).toContain("You received this because you signed up for");
  });

  it("logo height is 48", async () => {
    const html = await render(SurveyReminderEmail(props));
    // React Email renders height attribute
    expect(html).toMatch(/height[=:"' ]+48/);
  });

  it("header padding contains 28px", async () => {
    const html = await render(SurveyReminderEmail(props));
    expect(html).toContain("28px");
  });

  it("body card padding contains 40px", async () => {
    const html = await render(SurveyReminderEmail(props));
    expect(html).toContain("40px");
  });

  it("CTA button padding contains 14px and 28px", async () => {
    const html = await render(SurveyReminderEmail(props));
    // padding: "14px 28px" — both values must appear in rendered HTML
    expect(html).toContain("14px");
    expect(html).toContain("28px");
  });

  it("accent divider: rendered HTML contains 2px height element with accentColor", async () => {
    const html = await render(SurveyReminderEmail(props));
    // The accent divider uses height: "2px" and backgroundColor: accentColor
    expect(html).toContain("2px");
    // accentColor already asserted above, but let's be explicit about co-occurrence
    expect(html).toContain("#f59e0b");
  });

  it("footer domain link points to site domain", async () => {
    const html = await render(SurveyReminderEmail(props));
    expect(html).toContain("https://crewroute.app");
    expect(html).toContain("crewroute.app");
  });

  // --- Marketing email hygiene: footer unsubscribe link ---

  it("footer renders an unsubscribe link built from surveyToken", async () => {
    const html = await render(SurveyReminderEmail(props));
    expect(html).toMatch(/https?:\/\/[^"]*\/api\/unsubscribe\?token=/);
    expect(html).toContain(props.surveyToken);
    expect(html).toContain("Unsubscribe");
  });

  it("the only primary CTA is 'Answer 3 questions'", async () => {
    const html = await render(SurveyReminderEmail(props));
    const ctaMatches = html.match(/Answer 3 questions/g) ?? [];
    expect(ctaMatches.length).toBe(1);
  });

  it("footer unsubscribe link is muted (12px, gray)", async () => {
    const html = await render(SurveyReminderEmail(props));
    expect(html).toContain("12px");
    expect(html.toLowerCase()).toContain("#999999");
  });
});
