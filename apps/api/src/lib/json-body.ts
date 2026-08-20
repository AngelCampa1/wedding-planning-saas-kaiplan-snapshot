import type { Context } from "hono";

export function isMalformedJsonBodyError(error: unknown) {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const stack = error.stack?.toLowerCase() ?? "";
  return (
    stack.includes("json.parse") ||
    stack.includes("parsejsonfrombytes") ||
    message.includes("json") ||
    message.includes("unexpected end of input")
  );
}

export async function readJsonBody(c: Context) {
  try {
    return { body: await c.req.json(), response: null };
  } catch (error) {
    if (isMalformedJsonBodyError(error)) {
      return {
        body: null,
        response: c.json({ error: "Malformed JSON request body" }, 400),
      };
    }

    throw error;
  }
}

export function isJsonObjectBody(
  body: unknown,
): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

export async function readJsonObjectBody(c: Context) {
  const { body, response } = await readJsonBody(c);
  if (response) {
    return { body: null, response };
  }

  if (!isJsonObjectBody(body)) {
    return {
      body: null,
      response: c.json({ error: "JSON request body must be an object" }, 400),
    };
  }

  return { body, response: null };
}

export async function readOptionalJsonObjectBody(c: Context) {
  const text = await c.req.text();
  if (text.trim() === "") {
    return { body: {}, response: null };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {
      body: null,
      response: c.json({ error: "Malformed JSON request body" }, 400),
    };
  }

  if (!isJsonObjectBody(body)) {
    return {
      body: null,
      response: c.json({ error: "JSON request body must be an object" }, 400),
    };
  }

  return { body, response: null };
}
