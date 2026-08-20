import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["__tests__/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,astro}"],
      exclude: [
        "src/env.d.ts",
        "src/pages/**/*.astro",
        "src/components/privacy-summary.astro",
        "src/components/ScreenshotGallery.astro",
        // Astro image-pipeline imports can't be resolved by raw Vitest;
        // the manifest is verified via manifest.test.ts (source-level
        // assertions + on-disk PNG presence checks).
        "src/assets/screenshots/v2/manifest.ts",
        // Thin wrapper around the `cloudflare:workers` virtual module; the
        // dynamic import only resolves inside the Worker runtime and cannot
        // be reliably exercised in Vitest.
        "src/lib/cloudflare-workers-env.ts",
        "src/cloudflare-workers.d.ts",
      ],
      thresholds: {
        perFile: true,
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
