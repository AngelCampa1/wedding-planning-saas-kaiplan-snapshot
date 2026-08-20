import { describe, expect, it } from "vitest";

import {
  buildCtaAnalyticsAttributes,
  buildCtaClickEventProperties,
  sanitizeCtaHref,
} from "./cta-analytics";

describe("buildCtaAnalyticsAttributes", () => {
  it("maps shared CTA analytics context into data attributes", () => {
    expect(
      buildCtaAnalyticsAttributes({
        pageFamily: "comparison",
        buyerStage: "mofu",
        placement: "mid-article-routing",
        intent: "evaluate",
        target: "/compare/vendors",
      }),
    ).toEqual({
      "data-cta-button": "",
      "data-cta-page-family": "comparison",
      "data-cta-buyer-stage": "mofu",
      "data-cta-placement": "mid-article-routing",
      "data-cta-intent": "evaluate",
      "data-cta-target": "/compare/vendors",
    });
  });

  it("omits undefined analytics fields while keeping CTA tracking enabled", () => {
    expect(buildCtaAnalyticsAttributes()).toEqual({
      "data-cta-button": "",
    });
  });

  it("filters sensitive query parameters from tracked hrefs", () => {
    document.body.innerHTML = `<a href="/checkout?email=test@example.com&plan=pro&rsvpToken=secret" data-cta-button>Upgrade</a>`;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Upgrade",
        href: "/checkout?email=test@example.com&plan=pro&rsvpToken=secret",
        section: "pricing",
        pagePath: "/pricing",
      }),
    ).toMatchObject({
      href: "/checkout?email=%5BFiltered%5D&plan=pro&rsvpToken=%5BFiltered%5D",
    });
  });

  it("filters sensitive query values even when the key is generic", () => {
    document.body.innerHTML = `<a href="/contact?contact=test@example.com&redirect=https%3A%2F%2Fexample.com%2F%3Femail%3Dtest%40example.com&opaque=abcdefghijklmnopqrstuvwxyz123456" data-cta-button>Contact</a>`;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Contact",
        href: "/contact?contact=test@example.com&redirect=https%3A%2F%2Fexample.com%2F%3Femail%3Dtest%40example.com&opaque=abcdefghijklmnopqrstuvwxyz123456",
        section: "footer",
        pagePath: "/",
      }),
    ).toMatchObject({
      href: "/contact?contact=%5BFiltered%5D&redirect=%5BFiltered%5D&opaque=%5BFiltered%5D",
    });
  });
});

describe("sanitizeCtaHref", () => {
  it("preserves empty and hash-only hrefs", () => {
    expect(sanitizeCtaHref("")).toBe("");
    expect(sanitizeCtaHref("#pricing")).toBe("#pricing");
  });

  it("reduces absolute URLs to path and safe query values", () => {
    expect(
      sanitizeCtaHref(
        "https://kaiplan.app/signup?plan=pro&inviteToken=secret#checkout",
      ),
    ).toBe("/signup?plan=pro&inviteToken=%5BFiltered%5D");
  });

  it("does not expose non-http URL payloads", () => {
    expect(sanitizeCtaHref("mailto:test@example.com")).toBe("[External]");
  });

  it("filters sensitive query values when URL parsing fails", () => {
    expect(
      sanitizeCtaHref(
        "https://[bad-host]/contact?contact=test@example.com&opaque=abcdefghijklmnopqrstuvwxyz123456&bad=%&plan=pro",
      ),
    ).toBe(
      "https://[bad-host]/contact?contact=[Filtered]&opaque=[Filtered]&bad=%&plan=pro",
    );
  });

  it("returns malformed href paths without query strings unchanged", () => {
    expect(sanitizeCtaHref("https://[bad-host]/contact")).toBe(
      "https://[bad-host]/contact",
    );
  });

  it("filters malformed href query values containing embedded equals signs", () => {
    expect(
      sanitizeCtaHref(
        "https://[bad-host]/contact?redirect=https://example.com/?email=test@example.com&plan=pro",
      ),
    ).toBe("https://[bad-host]/contact?redirect=[Filtered]&plan=pro");
  });

  it("preserves malformed href query flags without equals signs", () => {
    expect(sanitizeCtaHref("https://[bad-host]/contact?debug&plan=pro")).toBe(
      "https://[bad-host]/contact?debug&plan=pro",
    );
  });
});

describe("buildCtaClickEventProperties", () => {
  it("merges CTA analytics context from the clicked element", () => {
    document.body.innerHTML = `
      <a
        href="/book-demo"
        data-cta-button
        data-cta-page-family="pricing"
        data-cta-buyer-stage="bofu"
        data-cta-placement="inline-routing"
        data-cta-intent="convert"
        data-cta-target="/book-demo"
      >
        Book a demo
      </a>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Book a demo",
        href: "/book-demo",
        section: "decision-cta-card",
        pagePath: "/pricing",
      }),
    ).toEqual({
      button_text: "Book a demo",
      href: "/book-demo",
      section: "decision-cta-card",
      page_path: "/pricing",
      page_family: "pricing",
      buyer_stage: "bofu",
      placement: "inline-routing",
      intent: "convert",
      target: "/book-demo",
    });
  });

  it("falls back to the closest ancestor for shared analytics attributes", () => {
    document.body.innerHTML = `
      <section
        data-cta-page-family="guide"
        data-cta-buyer-stage="tofu"
        data-cta-placement="sidebar"
      >
        <a href="/guides" data-cta-button>Explore guides</a>
      </section>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Explore guides",
        href: "/guides",
        section: "sidebar-cta",
        pagePath: "/resources",
      }),
    ).toEqual({
      button_text: "Explore guides",
      href: "/guides",
      section: "sidebar-cta",
      page_path: "/resources",
      page_family: "guide",
      buyer_stage: "tofu",
      placement: "sidebar",
    });
  });
});
