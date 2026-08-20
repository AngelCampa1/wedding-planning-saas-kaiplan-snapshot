import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { FeedbackNotificationEmail } from "./feedback-notification";

const baseProps = {
  productName: "CrewRoute",
  category: "bug",
  message: "The pricing page is broken on mobile",
  pageUrl: "https://crewroute.com/pricing",
  timestamp: "2026-03-30T12:00:00Z",
};

describe("FeedbackNotificationEmail", () => {
  it("renders category, message, and page URL", async () => {
    const html = await render(FeedbackNotificationEmail(baseProps));
    expect(html).toContain("Bug");
    expect(html).toContain("The pricing page is broken on mobile");
    expect(html).toContain("https://crewroute.com/pricing");
    expect(html).toContain("CrewRoute");
  });

  it("renders visitor email as mailto link when provided", async () => {
    const html = await render(
      FeedbackNotificationEmail({ ...baseProps, email: "visitor@test.com" }),
    );
    expect(html).toContain("mailto:visitor@test.com");
    expect(html).toContain("visitor@test.com");
  });

  it("does not render email section when email is not provided", async () => {
    const html = await render(FeedbackNotificationEmail(baseProps));
    expect(html).not.toContain("mailto:");
  });

  it("renders user agent when provided", async () => {
    const html = await render(
      FeedbackNotificationEmail({
        ...baseProps,
        userAgent: "Mozilla/5.0 TestAgent",
      }),
    );
    expect(html).toContain("Mozilla/5.0 TestAgent");
  });

  it("does not render UA section when userAgent is not provided", async () => {
    const html = await render(FeedbackNotificationEmail(baseProps));
    expect(html).not.toContain("UA:");
  });

  it("renders timestamp", async () => {
    const html = await render(FeedbackNotificationEmail(baseProps));
    expect(html).toContain("2026-03-30T12:00:00Z");
  });

  it("uses correct category color for idea", async () => {
    const html = await render(
      FeedbackNotificationEmail({ ...baseProps, category: "idea" }),
    );
    expect(html).toContain("Idea");
  });

  it("uses correct category color for other", async () => {
    const html = await render(
      FeedbackNotificationEmail({ ...baseProps, category: "other" }),
    );
    expect(html).toContain("Other");
  });
});
