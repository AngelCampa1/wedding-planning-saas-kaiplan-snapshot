import { expect, test } from "@playwright/test";

const knownRegressions = [] as const;

test.describe("known regressions", () => {
  test("has no pinned local regressions after the 2026-04-10 fixes", () => {
    expect(knownRegressions).toEqual([]);
  });
});
