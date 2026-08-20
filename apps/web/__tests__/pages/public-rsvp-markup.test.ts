import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(
  resolve(import.meta.dirname, "../../src/pages/w/[slug].astro"),
  "utf8",
);

describe("public RSVP markup", () => {
  it("declares the shared favicon so the public page does not fall back to /favicon.ico", () => {
    expect(pageSource).toContain('<link rel="icon" href="/favicon.svg"');
  });

  it("gates the story card so blank story content does not render an empty panel", () => {
    expect(pageSource).toContain("shouldRenderStorySection");
    expect(pageSource).toContain("{hasStorySection ? (");
  });

  it("hides the honeypot field from assistive tech and keyboard navigation", () => {
    expect(pageSource).toContain(
      '<div class="visually-hidden" aria-hidden="true">',
    );
    expect(pageSource).toContain('tabindex="-1"');
  });

  it("conditionally sets data-turnstile-required based on the site key env var", () => {
    expect(pageSource).toContain("data-turnstile-required");
    expect(pageSource).toContain('turnstileSiteKey ? "true" : undefined');
  });

  it("disables the Turnstile widget for local API environments", () => {
    expect(pageSource).toContain("const isLocalApiBase =");
    expect(pageSource).toContain("isLocalApiBase");
    expect(pageSource).toContain('? ""');
  });

  it("does not leak the household token as default status copy", () => {
    expect(pageSource).not.toContain("Household token:");
    expect(pageSource).toContain("data-rsvp-status");
    expect(pageSource).toContain('aria-live="polite"');
  });

  it("does not render pending as a public RSVP submission option", () => {
    expect(pageSource).not.toContain('value="pending"');
    expect(pageSource).not.toContain("Not replied yet");
  });

  it("keeps the mobile hero fallback visible when no hero image is configured", () => {
    expect(pageSource).toContain("class={heroMediaClassName}");
    expect(pageSource).toContain('"hero-media hero-media--with-image"');
    expect(pageSource).toContain('"hero-media hero-media--fallback"');
  });
});
