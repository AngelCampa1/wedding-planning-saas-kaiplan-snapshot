import { describe, expect, it } from "vitest";
import config from "../../vitest.config";

describe("kaiplan vitest config", () => {
  it("scopes test discovery to src and __tests__ files", () => {
    expect(config.test?.include).toEqual([
      "__tests__/**/*.test.ts",
      "src/**/*.test.ts",
    ]);
  });

  it("covers shared source modules while excluding Astro files that V8 cannot remap", () => {
    expect(config.test?.coverage?.include).toEqual(["src/**/*.{ts,astro}"]);
    expect(config.test?.coverage?.exclude).toEqual([
      "src/env.d.ts",
      "src/pages/**/*.astro",
      "src/components/privacy-summary.astro",
      "src/components/ScreenshotGallery.astro",
      "src/assets/screenshots/v2/manifest.ts",
      "src/lib/cloudflare-workers-env.ts",
      "src/cloudflare-workers.d.ts",
    ]);
  });
});
