import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getRuntimeEnv,
  pickStringEntries,
  readPublicVar,
  resetRuntimeEnvCacheForTests,
} from "./runtime-env";

describe("runtime-env", () => {
  afterEach(() => {
    resetRuntimeEnvCacheForTests();
    vi.unstubAllEnvs();
  });

  describe("pickStringEntries", () => {
    it("returns an empty object when the env argument is undefined", () => {
      expect(pickStringEntries(undefined)).toEqual({});
    });

    it("returns an empty object when the env argument is null", () => {
      expect(pickStringEntries(null)).toEqual({});
    });

    it("drops non-string entries and keeps string-valued ones", () => {
      expect(
        pickStringEntries({
          PUBLIC_API_URL: "https://api.kaiplan.app",
          DB: { query: () => null },
          NUMBER: 42,
          FLAG: true,
          NULLABLE: null,
        }),
      ).toEqual({ PUBLIC_API_URL: "https://api.kaiplan.app" });
    });
  });

  describe("getRuntimeEnv", () => {
    it("returns an empty object when cloudflare:workers is not resolvable", async () => {
      const env = await getRuntimeEnv();
      expect(env).toEqual({});
    });

    it("caches the resolved runtime env across calls", async () => {
      const first = await getRuntimeEnv();
      const second = await getRuntimeEnv();
      expect(second).toBe(first);
    });
  });

  describe("readPublicVar", () => {
    it("prefers runtime values when present and non-empty", () => {
      const value = readPublicVar(
        { PUBLIC_API_URL: "https://runtime.example" },
        "PUBLIC_API_URL",
        "https://fallback.example",
      );
      expect(value).toBe("https://runtime.example");
    });

    it("falls back to build-time import.meta.env when runtime value missing", () => {
      vi.stubEnv("PUBLIC_API_URL", "https://build.example");
      const value = readPublicVar({}, "PUBLIC_API_URL");
      expect(value).toBe("https://build.example");
    });

    it("prefers local build-time URLs over production runtime values for local preview", () => {
      vi.stubEnv("PUBLIC_API_URL", "http://127.0.0.1:5030");

      const value = readPublicVar(
        { PUBLIC_API_URL: "https://api.kaiplan.app" },
        "PUBLIC_API_URL",
      );

      expect(value).toBe("http://127.0.0.1:5030");
    });

    it("returns the fallback when neither runtime nor build values exist", () => {
      const value = readPublicVar({ UNSET_KEY: "" }, "UNSET_KEY", "fallback");
      expect(value).toBe("fallback");
    });

    it("returns undefined when no runtime, build, or fallback value is provided", () => {
      const value = readPublicVar({}, "TOTALLY_MISSING");
      expect(value).toBeUndefined();
    });

    it("treats a non-URL build-time value as non-local and prefers the runtime value", () => {
      // Exercises the catch { return false } branch in isLocalUrl when the
      // build-time value is not a valid URL string.
      vi.stubEnv("PUBLIC_API_URL", "not-a-url");
      const value = readPublicVar(
        { PUBLIC_API_URL: "https://api.kaiplan.app" },
        "PUBLIC_API_URL",
      );
      expect(value).toBe("https://api.kaiplan.app");
    });
  });

  it("swallows failures loading the cloudflare:workers module and returns {}", async () => {
    vi.resetModules();
    vi.doMock("cloudflare:workers", () => {
      throw new Error("module resolution failed");
    });
    const fresh = await import("./runtime-env");
    fresh.resetRuntimeEnvCacheForTests();
    const env = await fresh.getRuntimeEnv();
    expect(env).toEqual({});
    vi.doUnmock("cloudflare:workers");
  });

  describe("resetRuntimeEnvCacheForTests", () => {
    it("clears the cached env so subsequent calls re-evaluate the fallback", async () => {
      const first = await getRuntimeEnv();
      resetRuntimeEnvCacheForTests();
      const second = await getRuntimeEnv();
      expect(second).not.toBe(first);
      expect(second).toEqual({});
    });
  });
});
