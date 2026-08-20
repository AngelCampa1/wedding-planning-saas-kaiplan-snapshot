import { handle } from "@astrojs/cloudflare/handler";
import { runScheduledTasks, type ScheduledEnv } from "@kaiplan/marketing-api";
import { buildCanonicalRedirectResponse } from "./lib/canonical-redirect";

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type ScheduledControllerLike = {
  cron?: string;
  scheduledTime?: number;
};

type WorkerEntrypoint = {
  fetch(
    request: Request,
    env: ScheduledEnv,
    ctx: WorkerExecutionContext,
  ): Response | Promise<Response>;
  scheduled(
    controller: ScheduledControllerLike,
    env: ScheduledEnv,
    ctx: WorkerExecutionContext,
  ): void | Promise<void>;
};

export default {
  fetch(request, env, ctx) {
    const canonicalRedirect = buildCanonicalRedirectResponse(
      new URL(request.url),
    );
    if (canonicalRedirect) {
      return canonicalRedirect;
    }

    return handle(request, env, ctx);
  },

  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledTasks(env));
  },
} satisfies WorkerEntrypoint;
