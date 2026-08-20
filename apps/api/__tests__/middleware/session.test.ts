import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { sessionMiddleware } from "../../src/middleware/session";
import type { Auth } from "../../src/auth";

function makeAuth(sessionResult: unknown): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(sessionResult),
    },
  } as unknown as Auth;
}

function makeApp(auth: Auth) {
  const app = new Hono<{
    Bindings: { E2E_MODE?: string; ENVIRONMENT?: string };
  }>();
  const mw = sessionMiddleware(auth);

  app.get("/protected", mw, (c) => {
    const user = c.get("user" as never) as {
      id: string;
      email: string;
      name: string;
    };
    return c.json({ user });
  });

  return app;
}

describe("sessionMiddleware", () => {
  it("returns 401 when no session exists", async () => {
    const auth = makeAuth(null);
    const app = makeApp(auth);

    const res = await app.request("/protected");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("sets user on context and calls next when session is valid", async () => {
    const auth = makeAuth({
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        emailVerified: true,
      },
      session: {},
    });
    const app = makeApp(auth);

    const res = await app.request("/protected");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      user: { id: string; email: string; name: string };
    };
    expect(body.user).toEqual({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("returns 403 when an existing session belongs to an unverified user", async () => {
    const auth = makeAuth({
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        emailVerified: false,
      },
      session: {},
    });
    const app = makeApp(auth);

    const res = await app.request("/protected");
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Email verification required");
  });

  it("returns 403 when an existing session has no emailVerified flag", async () => {
    const auth = makeAuth({
      user: { id: "user-1", email: "test@example.com", name: "Test User" },
      session: {},
    });
    const app = makeApp(auth);

    const res = await app.request("/protected");
    expect(res.status).toBe(403);
  });

  it("allows unverified sessions only in explicitly allowed E2E mode", async () => {
    const auth = makeAuth({
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        emailVerified: false,
      },
      session: {},
    });
    const app = makeApp(auth);

    const res = await app.request(
      "/protected",
      {},
      { E2E_MODE: "true", ENVIRONMENT: "test" },
    );
    expect(res.status).toBe(200);
  });

  it("passes request headers to auth.api.getSession", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const auth = { api: { getSession } } as unknown as Auth;
    const app = makeApp(auth);

    await app.request("/protected", {
      headers: { Authorization: "Bearer token-abc" },
    });

    expect(getSession).toHaveBeenCalledOnce();
    const callArg = getSession.mock.calls[0][0] as { headers: Headers };
    expect(callArg.headers).toBeInstanceOf(Headers);
  });
});
