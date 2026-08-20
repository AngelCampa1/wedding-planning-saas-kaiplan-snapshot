import { Hono } from "hono";
import { submitFeedbackSchema } from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { EmailService } from "../lib/email";
import type { Auth } from "../auth";
import { sessionMiddleware } from "../middleware/session";
import { createRateLimitMiddleware } from "../lib/rate-limit";
import { readJsonBody } from "../lib/json-body";

type Variables = {
  user: { id: string; email: string; name: string };
};

export function feedbackRoutes(emailService: EmailService, auth: Auth) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  const requireSession = sessionMiddleware(auth);

  // Rate limit: 10 submissions per minute per userId.
  // The keyFn runs AFTER requireSession, so c.var.user is always set here.
  const feedbackRateLimit = createRateLimitMiddleware({
    limit: 10,
    window: 60,
    keyFn: (c) =>
      `feedback:user:${(c.var as { user: { id: string } }).user.id}`,
  });

  app.post("/", requireSession, feedbackRateLimit, async (c) => {
    const { body, response } = await readJsonBody(c);
    if (response) return response;

    const parsed = submitFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { message, email, pageUrl } = parsed.data;

    await emailService.sendFeedback({
      message,
      email: email || undefined,
      pageUrl,
    });

    return c.json({ ok: true });
  });

  return app;
}
