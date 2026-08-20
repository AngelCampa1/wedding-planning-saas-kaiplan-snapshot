import { describe, expect, it } from "vitest";
import { isE2eAllowed } from "../../src/lib/e2e-gate";

describe("isE2eAllowed", () => {
  it("returns true when E2E_MODE is true and ENVIRONMENT is development", () => {
    expect(isE2eAllowed({ E2E_MODE: "true", ENVIRONMENT: "development" })).toBe(
      true,
    );
  });

  it("returns true when E2E_MODE is true and ENVIRONMENT is test", () => {
    expect(isE2eAllowed({ E2E_MODE: "true", ENVIRONMENT: "test" })).toBe(true);
  });

  it("returns false when E2E_MODE is true and ENVIRONMENT is production (fail-closed)", () => {
    expect(isE2eAllowed({ E2E_MODE: "true", ENVIRONMENT: "production" })).toBe(
      false,
    );
  });

  it("returns false when E2E_MODE is true and ENVIRONMENT is undefined (fail-closed)", () => {
    // An unset ENVIRONMENT must never silently enable the E2E bypass.
    expect(isE2eAllowed({ E2E_MODE: "true", ENVIRONMENT: undefined })).toBe(
      false,
    );
  });

  it("returns false when E2E_MODE is false and ENVIRONMENT is development", () => {
    expect(
      isE2eAllowed({ E2E_MODE: "false", ENVIRONMENT: "development" }),
    ).toBe(false);
  });

  it("returns false when E2E_MODE is undefined", () => {
    expect(
      isE2eAllowed({ E2E_MODE: undefined, ENVIRONMENT: "development" }),
    ).toBe(false);
  });

  it("returns false when both E2E_MODE and ENVIRONMENT are undefined", () => {
    expect(isE2eAllowed({ E2E_MODE: undefined, ENVIRONMENT: undefined })).toBe(
      false,
    );
  });
});
