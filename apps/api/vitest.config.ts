import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/index.ts",
        "src/lib/env.ts",
        "src/db/schema.ts",
        "src/db/auth-schema.ts",
        "src/db/budget-schema.ts",
        "src/db/guest-schema.ts",
        "src/db/marketing-schema.ts",
        "src/db/wedding-website-schema.ts",
        "src/db/vendor-schema.ts",
        "src/db/checklist-schema.ts",
        "src/routes/wedding-website.ts",
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
