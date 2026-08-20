import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import {
  isJsonObjectBody,
  isMalformedJsonBodyError,
  readJsonBody,
  readJsonObjectBody,
  readOptionalJsonObjectBody,
} from "../../src/lib/json-body";

function makeTextContext(text: string): Context {
  return {
    req: {
      text: async () => text,
    },
    json: (body: unknown, status?: number) =>
      Response.json(body, { status }),
  } as unknown as Context;
}

function makeJsonContext(json: () => Promise<unknown>): Context {
  return {
    req: {
      json,
    },
    json: (body: unknown, status?: number) =>
      Response.json(body, { status }),
  } as unknown as Context;
}

describe("json body helpers", () => {
  it("detects malformed JSON syntax errors", () => {
    expect(isMalformedJsonBodyError(new SyntaxError("Unexpected JSON"))).toBe(
      true,
    );
    expect(isMalformedJsonBodyError(new Error("Unexpected JSON"))).toBe(false);
    expect(isMalformedJsonBodyError(new SyntaxError("plain syntax"))).toBe(
      false,
    );
  });

  it("recognizes plain object JSON bodies", () => {
    expect(isJsonObjectBody({ ok: true })).toBe(true);
    expect(isJsonObjectBody(null)).toBe(false);
    expect(isJsonObjectBody([])).toBe(false);
  });

  it("reads valid JSON bodies", async () => {
    const result = await readJsonBody(
      makeJsonContext(async () => ({ ok: true })),
    );

    expect(result.body).toEqual({ ok: true });
    expect(result.response).toBeNull();
  });

  it("returns 400 for malformed JSON bodies", async () => {
    const result = await readJsonBody(
      makeJsonContext(async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      }),
    );

    expect(result.body).toBeNull();
    expect(result.response?.status).toBe(400);
  });

  it("rethrows non-JSON body parsing errors", async () => {
    const error = new TypeError("stream already consumed");

    await expect(
      readJsonBody(
        makeJsonContext(async () => {
          throw error;
        }),
      ),
    ).rejects.toBe(error);
  });

  it("reads valid object JSON bodies", async () => {
    const result = await readJsonObjectBody(
      makeJsonContext(async () => ({ ok: true })),
    );

    expect(result.body).toEqual({ ok: true });
    expect(result.response).toBeNull();
  });

  it("returns 400 for non-object required JSON bodies", async () => {
    const result = await readJsonObjectBody(makeJsonContext(async () => null));

    expect(result.body).toBeNull();
    expect(result.response?.status).toBe(400);
    await expect(result.response?.json()).resolves.toEqual({
      error: "JSON request body must be an object",
    });
  });

  it("treats empty optional JSON bodies as an empty object", async () => {
    const result = await readOptionalJsonObjectBody(makeTextContext(""));

    expect(result.body).toEqual({});
    expect(result.response).toBeNull();
  });

  it("returns 400 for malformed optional JSON bodies", async () => {
    const result = await readOptionalJsonObjectBody(makeTextContext("{"));

    expect(result.body).toBeNull();
    expect(result.response?.status).toBe(400);
    await expect(result.response?.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
  });

  it("returns 400 for non-object optional JSON bodies", async () => {
    const result = await readOptionalJsonObjectBody(makeTextContext("[]"));

    expect(result.body).toBeNull();
    expect(result.response?.status).toBe(400);
    await expect(result.response?.json()).resolves.toEqual({
      error: "JSON request body must be an object",
    });
  });
});
