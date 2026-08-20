import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./ScreenshotGallery.astro", import.meta.url)),
  "utf8",
);

describe("ScreenshotGallery.astro", () => {
  it("renders the planner section anchor and screenshot container hook", () => {
    expect(source).toContain('id="product-screenshots"');
    expect(source).toContain("data-screenshot-container");
  });

  it("renders the planner eyebrow and feature badge content", () => {
    expect(source).toContain("The Planner");
    expect(source).toContain("{shot.feature}");
    expect(source).toContain("{shot.caption}");
  });

  it("renders the intro slot and uses astro:assets Image with responsive sizing", () => {
    expect(source).toContain("{intro}");
    expect(source).toContain('import { Image } from "astro:assets"');
    expect(source).toContain("<Image");
    expect(source).toContain("widths={[480, 768, 1024]}");
    expect(source).toContain('decoding="async"');
    expect(source).toContain('loading={index === 0 ? "eager" : "lazy"}');
  });
});
