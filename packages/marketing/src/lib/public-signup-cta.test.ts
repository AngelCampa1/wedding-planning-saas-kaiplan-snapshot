import { describe, expect, it } from "vitest";

import {
  DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
  DEFAULT_PUBLIC_SIGNUP_MESSAGE,
  resolvePublicSignupCta,
  sanitizePublicSignupCtaText,
  sanitizePublicSignupMessage,
} from "./public-signup-cta";

describe("resolvePublicSignupCta", () => {
  it("uses the homepage pricing anchor for homepage inline CTAs", () => {
    expect(resolvePublicSignupCta({ sourcePage: "/" })).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: "#pricing",
    });
  });

  it("uses the site homepage pricing anchor for non-home pages by default", () => {
    expect(
      resolvePublicSignupCta({ sourcePage: "/resources/guides/example" }),
    ).toEqual({
      text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
      target: "/#pricing",
    });
  });

  it("preserves an explicit fake-door target when provided", () => {
    expect(
      resolvePublicSignupCta({
        sourcePage: "/resources/guides/example",
        explicitTarget: "/?plan=center#pricing",
        explicitText: "See PebbleDesk pricing",
      }),
    ).toEqual({
      text: "See PebbleDesk pricing",
      target: "/?plan=center#pricing",
    });
  });

  it("preserves explicit free-trial CTA copy", () => {
    expect(
      resolvePublicSignupCta({
        sourcePage: "/resources/guides/example",
        explicitText: "Start Your Free Trial",
      }),
    ).toEqual({
      text: "Start Your Free Trial",
      target: "/#pricing",
    });
  });
});

describe("sanitizePublicSignupCtaText", () => {
  it("replaces waitlist CTA copy with neutral pricing copy", () => {
    expect(sanitizePublicSignupCtaText("Join the waitlist")).toBe(
      DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
    );
  });

  it("preserves safe CTA copy", () => {
    expect(sanitizePublicSignupCtaText("See pricing")).toBe("See pricing");
  });
});

describe("sanitizePublicSignupMessage", () => {
  it("replaces free-trial message copy with neutral fake-door copy", () => {
    expect(
      sanitizePublicSignupMessage(
        "1-month free trial - no credit card required",
      ),
    ).toBe(DEFAULT_PUBLIC_SIGNUP_MESSAGE);
  });

  it("replaces follow-up message copy with neutral fake-door copy", () => {
    expect(
      sanitizePublicSignupMessage(
        "Quick follow-up, then a free trial with no credit card",
      ),
    ).toBe(DEFAULT_PUBLIC_SIGNUP_MESSAGE);
  });

  it("replaces signup-oriented helper copy with neutral fake-door copy", () => {
    expect(
      sanitizePublicSignupMessage(
        "Mutra is built for the admin paralysis no timer or tracker can fix. Sign up free.",
      ),
    ).toBe(DEFAULT_PUBLIC_SIGNUP_MESSAGE);
  });

  it("preserves safe helper copy", () => {
    expect(
      sanitizePublicSignupMessage(
        "Pick a plan to see pricing details and next steps.",
      ),
    ).toBe("Pick a plan to see pricing details and next steps.");
  });
});
