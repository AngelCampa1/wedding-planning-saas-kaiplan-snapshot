import { describe, expect, it } from "vitest";
import { normalizeAstroCloudflarePreviewConfig } from "./lib/astro-cloudflare-preview-config";

describe("normalizeAstroCloudflarePreviewConfig", () => {
  it("removes pages_build_output_dir when Astro preview uses the reserved ASSETS binding", () => {
    expect(
      normalizeAstroCloudflarePreviewConfig({
        name: "kaiplan-web",
        pages_build_output_dir: "dist",
        assets: {
          binding: "ASSETS",
          directory: "../client",
        },
      }),
    ).toEqual({
      name: "kaiplan-web",
      assets: {
        binding: "ASSETS",
        directory: "../client",
      },
    });
  });

  it("does not alter configs with a custom assets binding", () => {
    const config = {
      pages_build_output_dir: "dist",
      assets: {
        binding: "STATIC_ASSETS",
      },
    };

    expect(normalizeAstroCloudflarePreviewConfig(config)).toBe(config);
  });
});
