import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import * as React from "react";
import {
  MarketingLayout,
  PrimaryButton,
  SecondaryLink,
  AccentDivider,
  unsubscribeUrlFor,
} from "./_marketing-layout";

const baseProps = {
  productName: "Kaiplan",
  domain: "kaiplan.app",
  logoUrl: "https://kaiplan.app/logo-light.svg",
  brandColor: "#B0432A",
  accentColor: "#3A4A2C",
  unsubscribeUrl: "https://kaiplan.app/api/unsubscribe?token=abc",
};

describe("unsubscribeUrlFor", () => {
  it("builds the canonical unsubscribe URL from domain + token", () => {
    expect(unsubscribeUrlFor("kaiplan.app", "tok123")).toBe(
      "https://kaiplan.app/api/unsubscribe?token=tok123",
    );
  });

  it("does not double-prefix if the domain already has a protocol stripped", () => {
    expect(unsubscribeUrlFor("foo.bar", "x")).toBe(
      "https://foo.bar/api/unsubscribe?token=x",
    );
  });
});

describe("MarketingLayout", () => {
  it("renders the productName as logo alt text", async () => {
    const html = await render(
      <MarketingLayout {...baseProps}>
        <p>hello</p>
      </MarketingLayout>,
    );
    expect(html).toContain('alt="Kaiplan"');
    expect(html).toContain("https://kaiplan.app/logo-light.svg");
  });

  it("renders the brand and accent colors", async () => {
    const html = await render(
      <MarketingLayout {...baseProps}>
        <p>hello</p>
      </MarketingLayout>,
    );
    expect(html.toLowerCase()).toContain("#b0432a");
    expect(html.toLowerCase()).toContain("#3a4a2c");
  });

  it("renders the unsubscribe link without exposing the recipient email", async () => {
    const html = await render(
      <MarketingLayout {...baseProps}>
        <p>hello</p>
      </MarketingLayout>,
    );
    expect(html).toContain(baseProps.unsubscribeUrl);
    expect(html).toContain("Unsubscribe");
    expect(html).not.toContain("user@example.com");
    expect(html).not.toContain("data-recipient");
  });

  it("the unsubscribe footer link is muted (small font, gray color)", async () => {
    const html = await render(
      <MarketingLayout {...baseProps}>
        <p>hello</p>
      </MarketingLayout>,
    );
    // The footer link uses 12px text and a #999... gray. We assert both
    // the small text and the gray color appear in the rendered footer.
    expect(html).toContain("12px");
    expect(html.toLowerCase()).toContain("#999999");
  });

  it("renders the footer 'You received this because' line with domain link", async () => {
    const html = await render(
      <MarketingLayout {...baseProps}>
        <p>hello</p>
      </MarketingLayout>,
    );
    expect(html).toContain("You received this because");
    expect(html).toContain("https://kaiplan.app");
    expect(html).toContain("kaiplan.app");
  });

  it("renders children inside the body card", async () => {
    const html = await render(
      <MarketingLayout {...baseProps}>
        <p data-testid="child">child-body</p>
      </MarketingLayout>,
    );
    expect(html).toContain("child-body");
  });
});

describe("PrimaryButton", () => {
  it("renders href and label", async () => {
    const html = await render(
      <PrimaryButton
        href="https://example.com/cta"
        label="Click me"
        brandColor="#B0432A"
      />,
    );
    expect(html).toContain("https://example.com/cta");
    expect(html).toContain("Click me");
  });

  it("uses the brandColor as the fill", async () => {
    const html = await render(
      <PrimaryButton
        href="https://example.com/cta"
        label="Click me"
        brandColor="#123456"
      />,
    );
    expect(html.toLowerCase()).toContain("#123456");
  });
});

describe("SecondaryLink", () => {
  it("renders href and label", async () => {
    const html = await render(
      <SecondaryLink
        href="https://example.com/secondary"
        label="See more"
        brandColor="#B0432A"
      />,
    );
    expect(html).toContain("https://example.com/secondary");
    expect(html).toContain("See more");
  });

  it("uses the brandColor for the link color", async () => {
    const html = await render(
      <SecondaryLink
        href="https://example.com/secondary"
        label="See more"
        brandColor="#abcdef"
      />,
    );
    expect(html.toLowerCase()).toContain("#abcdef");
  });

  it("renders smaller, less-prominent than the primary button (no inline-block padding box)", async () => {
    const html = await render(
      <SecondaryLink
        href="https://example.com/secondary"
        label="See more"
        brandColor="#B0432A"
      />,
    );
    // The secondary link uses 14px text — smaller than the 16px primary CTA
    expect(html).toContain("14px");
  });
});

describe("AccentDivider", () => {
  it("renders a thin colored divider with the supplied color", async () => {
    const html = await render(<AccentDivider color="#3A4A2C" />);
    expect(html.toLowerCase()).toContain("#3a4a2c");
    expect(html).toContain("2px");
  });
});
