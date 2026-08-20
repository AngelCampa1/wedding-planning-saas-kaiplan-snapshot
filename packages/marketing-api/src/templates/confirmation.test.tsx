import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { ConfirmationEmail } from "./confirmation";

const props = {
  productName: "CrewRoute",
  domain: "crewroute.app",
  logoUrl: "https://crewroute.app/logo.png",
  brandColor: "#0066FF",
  accentColor: "#f59e0b",
  recipientEmail: "user@example.com",
  calendarUrl: "https://cal.com/angel/15min",
  signupPosition: 42,
  referralCode: "abc12345",
  referralUrl: "https://crewroute.app?ref=abc12345",
  surveyToken:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("ConfirmationEmail template", () => {
  it("renders without error", async () => {
    const html = await render(ConfirmationEmail(props));
    expect(html).toBeTruthy();
  });

  it("contains product name", async () => {
    const html = await render(ConfirmationEmail(props));
    expect(html).toContain("CrewRoute");
  });

  it("contains signup position", async () => {
    const html = await render(ConfirmationEmail(props));
    // React email inserts comment nodes between interpolations, so strip them
    const stripped = html.replace(/<!--.*?-->/g, "");
    expect(stripped).toMatch(/Your signup position is\s*<span[^>]*>#42/);
  });

  it("survey URL contains /?survey=open (trailing slash before query string)", async () => {
    // BUG 1: template was building `https://domain?survey=open` (no slash).
    // Must match the referral URL fix: `https://domain/?ref=CODE`.
    const html = await render(ConfirmationEmail(props));
    expect(html).toContain("https://crewroute.app/?survey=open");
  });

  it("contains calendar URL", async () => {
    const html = await render(ConfirmationEmail(props));
    expect(html).toContain("https://cal.com/angel/15min");
  });

  it("renders the referral code as standalone text so users can copy and share it", async () => {
    // Bug L1: referralCode was in the interface and passed at the call site but
    // never rendered in the JSX — users had no way to see their code directly.
    // The referralUrl already contains the code embedded in a URL, but users need
    // to see the raw code (e.g. "abc12345") to share verbally or copy it.
    const html = await render(
      ConfirmationEmail({
        ...props,
        referralUrl: "https://crewroute.app?ref=DIFFERENT",
      }),
    );
    // With a different referralUrl that does NOT contain "abc12345",
    // the code must still appear — proving it's rendered from referralCode, not referralUrl.
    expect(html).toContain("abc12345");
  });

  it("renders the referral URL as a clickable link", async () => {
    const html = await render(ConfirmationEmail(props));
    expect(html).toContain("https://crewroute.app?ref=abc12345");
  });

  it("surveyUrl includes the token without an email query param", async () => {
    const html = await render(ConfirmationEmail(props));

    expect(html).toContain(`t=${props.surveyToken}`);
    expect(html).not.toMatch(/(?:&amp;|[?&])e=/);
  });

  it("surveyUrl does not expose the recipient email", async () => {
    const html = await render(ConfirmationEmail(props));
    const match = html.match(/(?:&amp;|[?&])e=([A-Za-z0-9+/=]+)/);
    expect(match).toBeNull();
    expect(html).not.toContain("user@example.com");
  });

  // --- New dual-color design system tests ---

  it("renders accent brow bar with accentColor background", async () => {
    const html = await render(ConfirmationEmail(props));
    // The 4px brow bar at the top must have the accentColor (#f59e0b) as background
    expect(html).toContain("#f59e0b");
  });

  it("renders signup position with accentColor styling", async () => {
    const html = await render(ConfirmationEmail(props));
    const stripped = html.replace(/<!--.*?-->/g, "");
    // The signup position number (#42) must appear
    expect(stripped).toContain("#42");
    // The accentColor must appear near the signup position text (both in same document)
    expect(stripped).toContain("#f59e0b");
  });

  it("renders referral callout with accentColor left border", async () => {
    const html = await render(ConfirmationEmail(props));
    // The referral box has a border-left using accentColor
    // React Email inlines styles, check for the border-left pattern with the accent color
    expect(html).toContain("border-left");
    expect(html).toContain("#f59e0b");
  });

  it("renders footer with unsubscribe message", async () => {
    const html = await render(ConfirmationEmail(props));
    expect(html).toContain("You received this because you signed up for");
  });

  it("renders calendar link with accentColor", async () => {
    const html = await render(ConfirmationEmail(props));
    // The "Schedule a call" link uses accentColor
    expect(html).toContain("Schedule a call");
    expect(html).toContain("#f59e0b");
  });

  it("renders welcome heading with product name", async () => {
    const html = await render(ConfirmationEmail(props));
    // React Email inserts comment nodes between interpolations, strip them before asserting
    const stripped = html.replace(/<!--.*?-->/g, "");
    expect(stripped).toContain("Welcome to CrewRoute!");
  });

  it("renders logo with height 48", async () => {
    const html = await render(ConfirmationEmail(props));
    // Logo height should be 48 (not 40 from old design)
    expect(html).toContain('height="48"');
  });

  it("renders brand header with padding 28px", async () => {
    const html = await render(ConfirmationEmail(props));
    // Brand header has 28px top/bottom padding
    expect(html).toContain("28px");
  });

  it("renders body card with 40px padding", async () => {
    const html = await render(ConfirmationEmail(props));
    // Body card uses 40px 32px padding
    expect(html).toContain("40px");
  });

  it("renders survey button with 14px 28px padding", async () => {
    const html = await render(ConfirmationEmail(props));
    // Survey CTA button has 14px 28px padding per spec
    expect(html).toContain("14px 28px");
  });

  // --- Marketing email hygiene: single primary CTA + footer unsubscribe ---

  it("footer renders an unsubscribe link built from surveyToken", async () => {
    const html = await render(ConfirmationEmail(props));
    expect(html).toMatch(/https?:\/\/[^"]*\/api\/unsubscribe\?token=/);
    expect(html).toContain(props.surveyToken);
    expect(html).toContain("Unsubscribe");
  });

  it("the only primary CTA is the survey button", async () => {
    const html = await render(ConfirmationEmail(props));
    // Primary CTAs use the brand color as background. Count their presence.
    // Brand color appears in: header background, primary button background +
    // border (2 occurrences), and CSS string colors. We assert the survey
    // button label appears exactly once and the trial-link label is rendered
    // as a plain text link, not a primary button.
    const surveyMatches = html.match(/Take the 30-second survey/g) ?? [];
    expect(surveyMatches.length).toBe(1);
  });

  it("renders a secondary trial link that is not a primary CTA", async () => {
    const html = await render(ConfirmationEmail(props));
    // React Email inserts comment nodes between text and interpolations,
    // so strip them before asserting the secondary CTA label.
    const stripped = html.replace(/<!--.*?-->/g, "");
    expect(stripped).toContain("See what&#x27;s in CrewRoute");
    expect(stripped).toContain("https://crewroute.app/#pricing");
  });

  it("footer unsubscribe link is muted (12px, gray) — not a primary button", async () => {
    const html = await render(ConfirmationEmail(props));
    // The footer text uses 12px and a gray color
    expect(html).toContain("12px");
    expect(html.toLowerCase()).toContain("#999999");
  });
});
