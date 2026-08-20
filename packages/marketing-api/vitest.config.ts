import { defineConfig } from "vitest/config";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const reactPath = path.dirname(require.resolve("react/package.json"));

export default defineConfig({
  resolve: {
    alias: {
      react: reactPath,
      "react/jsx-dev-runtime": path.join(reactPath, "jsx-dev-runtime.js"),
      "react/jsx-runtime": path.join(reactPath, "jsx-runtime.js"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "src/integration/**", "dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/index.ts",
        "src/local-integration.ts",
        "src/integration/**",
        "**/integration/**",
      ],
      thresholds: {
        perFile: true,
        statements: 95,
        lines: 95,
      },
      reporter: ["text", "html", "lcov"],
    },
  },
});
