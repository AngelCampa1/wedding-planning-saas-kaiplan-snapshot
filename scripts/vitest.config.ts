import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.claude/**", "**/.worktrees/**"],
    testTimeout: 30_000,
  },
});
