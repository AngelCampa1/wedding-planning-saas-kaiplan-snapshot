import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { LeadMagnetDeliveryEmail } from "./lead-magnet-delivery";

const props = {
  productName: "CrewRoute",
  domain: "crewroute.app",
  logoUrl: "https://crewroute.app/logo.png",
  brandColor: "#0066FF",
  accentColor: "#f59e0b",
  recipientEmail: "user@example.com",
  signupPosition: 42,
  referralCode: "abc12345",
  referralUrl: "https://crewroute.app?ref=abc12345",
  surveyToken:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  leadMagnetTitle: "Donor Retention Playbook",
  leadMagnetUrl: "https://grantpipe.com/free/donor-retention-playbook",
  downloadUrl:
    "https://grantpipe.com/api/lead-magnets/download?token=" + "a".repeat(64),
  leadMagnetSlug: "donor-retention-playbook",
};

describe("LeadMagnetDeliveryEmail template", () => {
  it("renders without error", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toBeTruthy();
  });

  it("contains product name", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toContain("CrewRoute");
  });

  it("contains signup position (#42)", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    // React email inserts comment nodes between interpolations, so strip them
    const stripped = html.replace(/<!--.*?-->/g, "");
    expect(stripped).toMatch(/Your signup position is\s*<span[^>]*>#42/);
  });

  it("contains lead magnet title", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toContain("Donor Retention Playbook");
  });

  it("contains lead magnet URL", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toContain(
      "https://grantpipe.com/free/donor-retention-playbook",
    );
  });

  it("renders the referral code as standalone text", async () => {
    const html = await render(
      LeadMagnetDeliveryEmail({
        ...props,
        referralUrl: "https://crewroute.app?ref=DIFFERENT",
      }),
    );
    // With a different referralUrl that does NOT contain "abc12345",
    // the code must still appear — proving it's rendered from referralCode, not referralUrl.
    expect(html).toContain("abc12345");
  });

  it("renders the referral URL as a clickable link", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toContain("https://crewroute.app?ref=abc12345");
  });

  it("renders accent brow bar with accentColor background", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    // The 4px brow bar at the top must have the accentColor (#f59e0b) as background
    expect(html).toContain("#f59e0b");
  });

  it("renders referral callout with accentColor left border", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    // The referral box has a border-left using accentColor
    expect(html).toContain("border-left");
    expect(html).toContain("#f59e0b");
  });

  it("renders footer with unsubscribe message", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toContain("You received this because you signed up for");
  });

  it("renders 'Download your PDF' primary CTA linked to downloadUrl", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toContain("Download your PDF");
    expect(html).toContain(props.downloadUrl);
  });

  it("renders 'Read online' secondary CTA linked to leadMagnetUrl", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toContain("Read online");
    expect(html).toContain(props.leadMagnetUrl);
  });

  it("surfaces leadMagnetSlug on the download CTA section", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toContain(`data-slug="${props.leadMagnetSlug}"`);
  });

  // --- Marketing email hygiene: single primary CTA + footer unsubscribe ---

  it("footer renders an unsubscribe link built from surveyToken", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toMatch(/https?:\/\/[^"]*\/api\/unsubscribe\?token=/);
    expect(html).toContain(props.surveyToken);
    expect(html).toContain("Unsubscribe");
  });

  it("the only primary CTA is 'Download your PDF' (survey demoted, schedule-call demoted)", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    // Demoted: previous template rendered "Take the 30-second survey" as a
    // second primary button. After the refactor it must NOT appear at all in
    // the lead-magnet delivery email — survey nudging is the survey-reminder
    // email's job.
    expect(html).not.toContain("Take the 30-second survey");
    // Single primary CTA label appears exactly once
    const downloadMatches = html.match(/Download your PDF/g) ?? [];
    expect(downloadMatches.length).toBe(1);
  });

  it("footer unsubscribe link is muted (12px, gray)", async () => {
    const html = await render(LeadMagnetDeliveryEmail(props));
    expect(html).toContain("12px");
    expect(html.toLowerCase()).toContain("#999999");
  });
});
