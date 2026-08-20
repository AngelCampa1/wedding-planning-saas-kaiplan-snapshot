import { describe, expect, it } from "vitest";
import { getApiBaseUrl } from "./api-config";

describe("getApiBaseUrl", () => {
  it("returns the configured API URL when present", () => {
    expect(
      getApiBaseUrl(
        { PUBLIC_API_URL: "https://api.kaiplan.app", PROD: false },
        new URL("http://localhost:3030/w/test"),
      ),
    ).toBe("https://api.kaiplan.app");
  });

  it("trims trailing slashes from the configured URL", () => {
    expect(
      getApiBaseUrl(
        { PUBLIC_API_URL: "https://api.kaiplan.app/", PROD: false },
        new URL("http://localhost:3030/w/test"),
      ),
    ).toBe("https://api.kaiplan.app");
  });

  it("falls back to localhost port 5030 in dev when env var is missing", () => {
    expect(
      getApiBaseUrl(
        { PUBLIC_API_URL: undefined, PROD: false },
        new URL("http://localhost:3030/w/test"),
      ),
    ).toBe("http://localhost:5030");
  });

  it("falls back to localhost port 5030 in dev when env var is empty string", () => {
    expect(
      getApiBaseUrl(
        { PUBLIC_API_URL: "", PROD: false },
        new URL("http://localhost:3030/w/test"),
      ),
    ).toBe("http://localhost:5030");
  });

  it("falls back to the current origin in production when env var is missing", () => {
    expect(
      getApiBaseUrl(
        { PUBLIC_API_URL: undefined, PROD: false },
        new URL("https://kaiplan.app/w/anna-and-lee"),
      ),
    ).toBe("https://kaiplan.app");
  });

  it("throws in production when the env var is missing", () => {
    expect(() =>
      getApiBaseUrl(
        { PUBLIC_API_URL: undefined, PROD: true },
        new URL("https://kaiplan.app/w/anna-and-lee"),
      ),
    ).toThrow(
      "PUBLIC_API_URL is required in production but is not set. RSVP form submissions would be silently broken.",
    );
  });

  it("throws in production when the env var is empty string", () => {
    expect(() =>
      getApiBaseUrl(
        { PUBLIC_API_URL: "", PROD: true },
        new URL("https://kaiplan.app/w/anna-and-lee"),
      ),
    ).toThrow(
      "PUBLIC_API_URL is required in production but is not set. RSVP form submissions would be silently broken.",
    );
  });

  it("does not throw in production when the env var is correctly set", () => {
    expect(() =>
      getApiBaseUrl(
        { PUBLIC_API_URL: "https://api.kaiplan.app", PROD: true },
        new URL("https://kaiplan.app/w/anna-and-lee"),
      ),
    ).not.toThrow();
  });
});
