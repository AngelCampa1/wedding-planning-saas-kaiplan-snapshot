import { describe, expect, it } from "vitest";
import { isMarketingE2EAllowed } from "./e2e-gate";

describe("isMarketingE2EAllowed", () => {
  it.each([
    [{ E2E_MODE: "true", ENVIRONMENT: "development" }, true],
    [{ E2E_MODE: "true", ENVIRONMENT: "test" }, true],
    [{ E2E_MODE: "true", ENVIRONMENT: "production" }, false],
    [{ E2E_MODE: "true" }, false],
    [{ ENVIRONMENT: "test" }, false],
    [undefined, false],
  ] as const)("returns %s for %j", (env, expected) => {
    expect(isMarketingE2EAllowed(env)).toBe(expected);
  });
});
