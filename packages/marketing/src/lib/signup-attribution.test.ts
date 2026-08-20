import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTRIBUTION_STORAGE_KEY,
  extractSignupAttribution,
  persistSignupAttribution,
  readStoredSignupAttribution,
  resolveSignupAttribution,
} from "./signup-attribution";

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("signup-attribution", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageMock());
    vi.stubGlobal("sessionStorage", createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts supported attribution fields from a search string", () => {
    expect(
      extractSignupAttribution(
        "?utm_source=google&utm_medium=cpc&utm_campaign=spring&ref=partner",
      ),
    ).toEqual({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "spring",
      referredBy: "partner",
    });
  });

  it("persists new attribution params into localStorage and sessionStorage", () => {
    const result = persistSignupAttribution(
      "?utm_source=linkedin&utm_campaign=demo&ref=ally",
    );

    expect(result).toEqual({
      utmSource: "linkedin",
      utmCampaign: "demo",
      referredBy: "ally",
    });
    expect(readStoredSignupAttribution()).toEqual(result);
    expect(localStorage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toBeNull();
  });

  it("keeps stored attribution when the current page has no query params", () => {
    localStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "spring",
        referredBy: "partner",
      }),
    );

    expect(resolveSignupAttribution("")).toEqual({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "spring",
      referredBy: "partner",
    });
  });

  it("merges current params over stored attribution and re-persists the result", () => {
    localStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "spring",
        referredBy: "partner",
      }),
    );

    const result = resolveSignupAttribution("?utm_medium=paid-social");

    expect(result).toEqual({
      utmSource: "google",
      utmMedium: "paid-social",
      utmCampaign: "spring",
      referredBy: "partner",
    });
    expect(readStoredSignupAttribution()).toEqual(result);
  });

  it("returns an empty object when stored attribution is invalid JSON", () => {
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, "{bad json");

    expect(readStoredSignupAttribution()).toEqual({});
  });

  it("returns an empty object when stored attribution is not an object", () => {
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify("google"));
    sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(null));

    expect(readStoredSignupAttribution()).toEqual({});
  });

  it("promotes sessionStorage values into localStorage when localStorage is empty", () => {
    sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        utmSource: "newsletter",
        referredBy: "partner",
      }),
    );

    expect(readStoredSignupAttribution()).toEqual({
      utmSource: "newsletter",
      referredBy: "partner",
    });
    expect(localStorage.getItem(ATTRIBUTION_STORAGE_KEY)).toBe(
      JSON.stringify({
        utmSource: "newsletter",
        referredBy: "partner",
      }),
    );
  });

  it("fails safely when storage access throws", () => {
    const localStorageMock = globalThis.localStorage;
    const sessionStorageMock = globalThis.sessionStorage;

    const localGetSpy = vi
      .spyOn(localStorageMock, "getItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });
    const localSetSpy = vi
      .spyOn(localStorageMock, "setItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });
    const sessionGetSpy = vi
      .spyOn(sessionStorageMock, "getItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });
    const sessionSetSpy = vi
      .spyOn(sessionStorageMock, "setItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });

    expect(readStoredSignupAttribution()).toEqual({});
    expect(resolveSignupAttribution("?utm_source=google")).toEqual({
      utmSource: "google",
    });
    expect(persistSignupAttribution("?utm_source=google")).toEqual({
      utmSource: "google",
    });
    localGetSpy.mockRestore();
    localSetSpy.mockRestore();
    sessionGetSpy.mockRestore();
    sessionSetSpy.mockRestore();
  });

  it("falls back when localStorage and sessionStorage reads throw", () => {
    vi.stubGlobal("localStorage", {
      ...createStorageMock(),
      getItem() {
        throw new Error("local unavailable");
      },
    });
    vi.stubGlobal("sessionStorage", {
      ...createStorageMock(),
      getItem() {
        throw new Error("session unavailable");
      },
    });

    expect(readStoredSignupAttribution()).toEqual({});
  });
});
