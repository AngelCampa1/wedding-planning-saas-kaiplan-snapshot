import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const isCoverageRun = process.argv.includes("--coverage");
const shouldSerializeWorkers = process.platform === "win32";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["__tests__/setup.ts"],
    testTimeout: isCoverageRun ? 15_000 : 5_000,
    // On Windows, tinypool's multi-fork teardown races cause ERR_IPC_CHANNEL_CLOSED
    // and exit 143 hangs. Force a single fork so there is no per-file worker-pool
    // teardown regardless of platform. poolOptions.forks.singleFork was removed in
    // Vitest 4; the equivalent is pool=forks + fileParallelism=false + maxWorkers=1.
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      clean: false,
      processingConcurrency: 1,
      // Windows coverage generation was stalling after tests completed while
      // emitting the full default reporter set. The gate only needs CLI
      // output and threshold enforcement here.
      reporter: isCoverageRun
        ? shouldSerializeWorkers
          ? ["text"]
          : ["text", "html", "lcov"]
        : undefined,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Route components excluded per CLAUDE.md
        "src/routes/**/*.tsx",
        // Generated/bootstrap files excluded (not testable units)
        "src/main.tsx",
        "src/router.tsx",
        "src/routeTree.gen.ts",
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
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
