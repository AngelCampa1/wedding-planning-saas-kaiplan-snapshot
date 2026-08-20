import { createMiddleware } from "hono/factory";
import type { Env } from "../lib/env";
import type { Auth } from "../auth";
import { isE2eAllowed } from "../lib/e2e-gate";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  emailVerified?: boolean;
};

type SessionVariables = {
  user: SessionUser;
};

export function sessionMiddleware(auth: Auth) {
  return createMiddleware<{
    Bindings: Env;
    Variables: SessionVariables;
  }>(async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!isE2eAllowed(c.env ?? {}) && session.user.emailVerified !== true) {
      return c.json({ error: "Email verification required" }, 403);
    }

    c.set("user", {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });

    await next();
  });
}
