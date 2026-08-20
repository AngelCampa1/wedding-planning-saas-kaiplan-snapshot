import type { ApiEnv, createApi } from "@kaiplan/marketing-api";
import type { APIRoute } from "astro";
import { readCloudflareWorkersEnv } from "../../lib/cloudflare-workers-env";
import {
  hasConfiguredPublicMarketingApiUrl,
  proxyMarketingApiRequest,
  resolveMarketingApiBaseUrl,
} from "../../lib/marketing-api-url";

export const prerender = false;

type RuntimeExecutionContext = Parameters<
  ReturnType<typeof createApi>["fetch"]
>[2];

const cloudflareWorkersExecutionContextKey =
  "__kaiplanCloudflareWorkersExecutionContext";

function normalizeRequest(request: Request): Request {
  const url = new URL(request.url);
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    return new Request(url.toString(), request);
  }
  return request;
}

// Astro v6 removed `Astro.locals.runtime.env`; the Cloudflare adapter now
// exposes runtime bindings via the `cloudflare:workers` module.
async function loadWorkerEnv(): Promise<ApiEnv | undefined> {
  const env = (await readCloudflareWorkersEnv()) as ApiEnv | undefined;
  return env && Object.keys(env).length > 0 ? env : undefined;
}

function getRuntimeCtx(locals: unknown): RuntimeExecutionContext | undefined {
  const runtime = (locals as Partial<{ runtime: unknown }>).runtime;
  if (!runtime) return undefined;
  const ctxDescriptor = Object.getOwnPropertyDescriptor(runtime, "ctx");
  return ctxDescriptor && "value" in ctxDescriptor
    ? (ctxDescriptor.value as RuntimeExecutionContext)
    : undefined;
}

async function getRuntimeBindings(
  locals: unknown,
): Promise<{ env: ApiEnv; ctx?: RuntimeExecutionContext } | undefined> {
  // Legacy path: some test harnesses still pass env via locals.runtime.env.
  const runtime = (locals as Partial<{ runtime: unknown }>).runtime;
  if (runtime) {
    const envDescriptor = Object.getOwnPropertyDescriptor(runtime, "env");
    if (envDescriptor && "value" in envDescriptor) {
      const env = envDescriptor.value as ApiEnv | undefined;
      if (env && Object.keys(env).length > 0) {
        const ctxDescriptor = Object.getOwnPropertyDescriptor(runtime, "ctx");
        return {
          env,
          ctx:
            ctxDescriptor && "value" in ctxDescriptor
              ? (ctxDescriptor.value as RuntimeExecutionContext)
              : undefined,
        };
      }
    }
  }

  const env = await loadWorkerEnv();
  if (!env) return undefined;
  const workerCtx = (
    env as ApiEnv & {
      [cloudflareWorkersExecutionContextKey]?: RuntimeExecutionContext;
    }
  )[cloudflareWorkersExecutionContextKey];
  return { env, ctx: getRuntimeCtx(locals) ?? workerCtx };
}

function shouldUseLocalEmbeddedMarketingApi() {
  return !import.meta.env.PROD;
}

function getRuntimeConfiguredMarketingApiUrl(
  runtimeBindings: { env: ApiEnv; ctx?: RuntimeExecutionContext } | undefined,
): string | undefined {
  const value = (runtimeBindings?.env as Record<string, unknown> | undefined)
    ?.PUBLIC_MARKETING_API_URL;
  return typeof value === "string" ? value : undefined;
}

function shouldPreferConfiguredStandaloneMarketingApi(configuredUrl?: string) {
  return hasConfiguredPublicMarketingApiUrl(configuredUrl);
}

function withApiCrawlerProtection(response: Response): Response {
  const protectedResponse = new Response(response.body, response);
  protectedResponse.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return protectedResponse;
}

export const ALL: APIRoute = async ({ request, locals }) => {
  const normalizedRequest = normalizeRequest(request);
  const runtimeBindings = await getRuntimeBindings(locals);
  const configuredMarketingApiUrl =
    getRuntimeConfiguredMarketingApiUrl(runtimeBindings);

  if (shouldPreferConfiguredStandaloneMarketingApi(configuredMarketingApiUrl)) {
    return withApiCrawlerProtection(
      await proxyMarketingApiRequest(
        normalizedRequest,
        resolveMarketingApiBaseUrl(request.url, configuredMarketingApiUrl),
      ),
    );
  }

  if (runtimeBindings) {
    const { createApi } = await import("@kaiplan/marketing-api");
    const embeddedApi = createApi(runtimeBindings.env);
    return withApiCrawlerProtection(
      await embeddedApi.fetch(
        normalizedRequest,
        runtimeBindings.env,
        runtimeBindings.ctx,
      ),
    );
  }

  if (shouldUseLocalEmbeddedMarketingApi()) {
    const { getLocalMarketingApiRuntime } =
      await import("../../lib/local-marketing-api");
    const localRuntime = await getLocalMarketingApiRuntime(request.url);
    return withApiCrawlerProtection(
      await localRuntime.api.fetch(normalizedRequest, localRuntime.env),
    );
  }

  return withApiCrawlerProtection(
    new Response(
      JSON.stringify({
        error: "Marketing API runtime bindings are unavailable.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
        },
      },
    ),
  );
};
