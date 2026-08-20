import { describe, it, expect } from "vitest";
import { parseCookiePair } from "./capture-screenshots";

describe("parseCookiePair", () => {
  it("splits a simple name=value cookie", () => {
    const { name, value } = parseCookiePair("session=abc123");
    expect(name).toBe("session");
    expect(value).toBe("abc123");
  });

  it("preserves = signs in the value (base64-like values)", () => {
    const { name, value } = parseCookiePair("token=abc+def=");
    expect(name).toBe("token");
    expect(value).toBe("abc+def=");
  });

  it("preserves multiple = signs in the value", () => {
    const { name, value } = parseCookiePair("auth=aGVsbG8=");
    expect(name).toBe("auth");
    expect(value).toBe("aGVsbG8=");
  });

  it("preserves == padding in base64 values", () => {
    const { name, value } = parseCookiePair("sid=YQ==");
    expect(name).toBe("sid");
    expect(value).toBe("YQ==");
  });

  it("handles a cookie with no value (empty string after =)", () => {
    const { name, value } = parseCookiePair("empty=");
    expect(name).toBe("empty");
    expect(value).toBe("");
  });

  it("handles JWT-style values with multiple dots and = padding", () => {
    const cookie = "jwt=eyJhbGc.eyJzdWI.SflKxwRJSMeKKF2QT4fwpM==";
    const { name, value } = parseCookiePair(cookie);
    expect(name).toBe("jwt");
    expect(value).toBe("eyJhbGc.eyJzdWI.SflKxwRJSMeKKF2QT4fwpM==");
  });

  it("handles cookie names with no special chars", () => {
    const { name, value } = parseCookiePair(
      "better-auth.session_token=myval=xyz",
    );
    expect(name).toBe("better-auth.session_token");
    expect(value).toBe("myval=xyz");
  });
});
