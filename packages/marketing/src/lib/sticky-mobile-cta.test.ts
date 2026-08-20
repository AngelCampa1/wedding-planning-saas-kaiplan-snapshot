import { describe, expect, it } from "vitest";

import {
  getStickyMobileCtaRenderState,
  getStickyMobileCtaSpacerHeight,
  shouldShowStickyMobileCta,
} from "./sticky-mobile-cta";

describe("getStickyMobileCtaRenderState", () => {
  it("defaults to link mode when no action is provided", () => {
    expect(getStickyMobileCtaRenderState()).toEqual({
      action: "link",
      showLink: true,
      interceptsLinkClicks: false,
    });
  });

  it("stays in plain-link mode even when an unsupported action is provided", () => {
    expect(getStickyMobileCtaRenderState("pricing-modal" as "link")).toEqual({
      action: "link",
      showLink: true,
      interceptsLinkClicks: false,
    });
  });

  it("keeps the explicit link action in link mode", () => {
    expect(getStickyMobileCtaRenderState("link")).toEqual({
      action: "link",
      showLink: true,
      interceptsLinkClicks: false,
    });
  });

  it("falls back to link mode for unsupported values", () => {
    expect(getStickyMobileCtaRenderState("unexpected-value" as "link")).toEqual(
      {
        action: "link",
        showLink: true,
        interceptsLinkClicks: false,
      },
    );
  });

  it("hides the sticky CTA when the footer is visible", () => {
    expect(
      shouldShowStickyMobileCta({
        heroIntersecting: false,
        footerIntersecting: true,
      }),
    ).toBe(false);
  });

  it("shows the sticky CTA after the hero leaves view and before the footer", () => {
    expect(
      shouldShowStickyMobileCta({
        heroIntersecting: false,
        footerIntersecting: false,
      }),
    ).toBe(true);
  });

  it("returns no spacer height when the sticky CTA is hidden", () => {
    expect(
      getStickyMobileCtaSpacerHeight({ isVisible: false, barHeight: 72 }),
    ).toBe(0);
  });

  it("returns the sticky CTA height as spacer height when visible", () => {
    expect(
      getStickyMobileCtaSpacerHeight({ isVisible: true, barHeight: 72 }),
    ).toBe(72);
  });

  it("clamps negative spacer heights to zero", () => {
    expect(
      getStickyMobileCtaSpacerHeight({ isVisible: true, barHeight: -24 }),
    ).toBe(0);
  });
});
