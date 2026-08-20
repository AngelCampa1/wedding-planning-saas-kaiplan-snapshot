import { describe, expect, it } from "vitest";
import config from "./vitest.config";

describe("scripts vitest config", () => {
  it("excludes nested in-repo worktrees from script test discovery", () => {
    const testConfig = config.test ?? {};

    expect(testConfig.exclude).toEqual(
      expect.arrayContaining(["**/.claude/**", "**/.worktrees/**"]),
    );
  });
});
