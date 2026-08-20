import { describe, expect, it } from "vitest";
import {
  buildAuthenticatedMutationOrigins,
  buildAllowedOrigins,
  buildCorsOriginsForPath,
  resolveDatabaseConnectionString,
} from "../../src/lib/runtime";

describe("resolveDatabaseConnectionString", () => {
  it("prefers Hyperdrive when available", () => {
    expect(
      resolveDatabaseConnectionString({
        HYPERDRIVE: { connectionString: "postgres://hyperdrive" },
        DATABASE_URL: "postgres://database-url",
      }),
    ).toBe("postgres://hyperdrive");
  });

  it("falls back to DATABASE_URL when Hyperdrive is unavailable", () => {
    expect(
      resolveDatabaseConnectionString({
        DATABASE_URL: "postgres://database-url",
      }),
    ).toBe("postgres://database-url");
  });

  it("throws when neither connection source is configured", () => {
    expect(() => resolveDatabaseConnectionString({})).toThrow(
      "Database connection is not configured. Set HYPERDRIVE or DATABASE_URL.",
    );
  });
});

describe("buildAllowedOrigins", () => {
  it("includes app and public web origins without duplicates", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "http://localhost:3000",
        PUBLIC_WEB_URL: "http://localhost:4321",
      }),
    ).toEqual(["http://localhost:3000", "http://localhost:4321"]);
  });

  it("deduplicates repeated origins", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "http://localhost:3000",
        PUBLIC_WEB_URL: "http://localhost:3000",
      }),
    ).toEqual(["http://localhost:3000"]);
  });

  it("strips trailing slash from APP_URL so it matches bare origin", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "https://my.kaiplan.app/",
      }),
    ).toEqual(["https://my.kaiplan.app"]);
  });

  it("strips trailing slash from PUBLIC_WEB_URL", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "https://my.kaiplan.app/",
        PUBLIC_WEB_URL: "https://kaiplan.app/",
      }),
    ).toEqual([
      "https://my.kaiplan.app",
      "https://kaiplan.app",
      "https://www.kaiplan.app",
    ]);
  });

  it("allows both apex and www production public web origins", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "https://my.kaiplan.app",
        PUBLIC_WEB_URL: "https://www.kaiplan.app",
      }),
    ).toEqual([
      "https://my.kaiplan.app",
      "https://www.kaiplan.app",
      "https://kaiplan.app",
    ]);
  });

  it("deduplicates after trailing-slash normalization", () => {
    expect(
      buildAllowedOrigins({
        APP_URL: "https://my.kaiplan.app/",
        PUBLIC_WEB_URL: "https://my.kaiplan.app",
      }),
    ).toEqual(["https://my.kaiplan.app"]);
  });
});

describe("buildAuthenticatedMutationOrigins", () => {
  it("trusts only the authenticated app origin", () => {
    expect(
      buildAuthenticatedMutationOrigins({
        APP_URL: "https://my.kaiplan.app/",
        PUBLIC_WEB_URL: "https://kaiplan.app/",
      }),
    ).toEqual(["https://my.kaiplan.app"]);
  });
});

describe("buildCorsOriginsForPath", () => {
  it("allows the public marketing origin only for public API routes", () => {
    expect(
      buildCorsOriginsForPath(
        {
          APP_URL: "https://my.kaiplan.app/",
          PUBLIC_WEB_URL: "https://kaiplan.app/",
        },
        "/api/public/rsvp/token",
      ),
    ).toContain("https://kaiplan.app");
  });

  it("uses only the app origin for authenticated API routes", () => {
    expect(
      buildCorsOriginsForPath(
        {
          APP_URL: "https://my.kaiplan.app/",
          PUBLIC_WEB_URL: "https://kaiplan.app/",
        },
        "/api/weddings",
      ),
    ).toEqual(["https://my.kaiplan.app"]);
  });
});
