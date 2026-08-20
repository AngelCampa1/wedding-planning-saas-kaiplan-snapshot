import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./[slug].astro", import.meta.url)),
  "utf8",
);

describe("public wedding page ([slug].astro)", () => {
  it("defines semantic theme variables for wedding-specific surfaces", () => {
    expect(source).toContain('"theme-panel-bg": theme.panelBg');
    expect(source).toContain('"theme-panel-strong": theme.panelStrong');
    expect(source).toContain('"theme-text-main": theme.textMain');
    expect(source).toContain('"theme-hero-from": theme.heroFrom');
  });

  it("uses guest-facing copy for invite and RSVP helpers", () => {
    expect(source).toContain(
      "Use your private invitation link to reply for everyone in your household.",
    );
    expect(source).toContain(
      "This reply form is reserved for the guests on your",
    );
    expect(source).toContain(
      "Open the private link from your invitation to reply for",
    );
  });

  it("normalizes canonical and og:url metadata to origin plus pathname", () => {
    expect(source).toContain(
      "const publicWeddingUrl = `${Astro.url.origin}${Astro.url.pathname}`;",
    );
    expect(source).toContain(
      '<link rel="canonical" href={publicWeddingUrl} />',
    );
    expect(source).toContain(
      '<meta property="og:url" content={publicWeddingUrl} />',
    );
    expect(source).not.toContain("href={Astro.url.href}");
    expect(source).not.toContain("content={Astro.url.href}");
  });

  it("renders accepted and declined RSVP choices with semantic grouping", () => {
    expect(source).toContain('<fieldset class="guest-row">');
    expect(source).toContain('class="rsvp-option-indicator"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("<strong>Joyfully attending</strong>");
    expect(source).toContain("<strong>Regretfully declining</strong>");
    expect(source).toContain('value="accepted"');
    expect(source).toContain('value="declined"');
    expect(source).toContain("required");
    expect(source).not.toContain("<strong>Not replied yet</strong>");
    expect(source).not.toContain('guest.rsvpStatus === "pending"');
    expect(source).not.toContain('guest.rsvpStatus === "invited"');
  });

  it("uses the computed content-card class for every optional content card", () => {
    expect(source).toContain(
      "const contentCardClassName = getContentCardClassName(contentCardCount);",
    );
    expect(source).toContain(
      '<article class={contentCardClassName} id="story">',
    );
    expect(source).toContain(
      '<article class={contentCardClassName} id="venue">',
    );
    expect(source).toContain(
      '<article class={contentCardClassName} id="registry">',
    );
  });
});
