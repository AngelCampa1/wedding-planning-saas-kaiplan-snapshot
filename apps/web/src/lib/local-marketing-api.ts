import type { ApiEnv } from "@kaiplan/marketing-api";
import {
  createLocalApi,
  makeLocalEnv,
  type LocalOutbox,
} from "@kaiplan/marketing-api/integration";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type LocalApiRuntime = {
  api: Awaited<ReturnType<typeof createLocalApi>>;
  env: ApiEnv;
};

const cachedLocalApiRuntimes = new Map<string, Promise<LocalApiRuntime>>();
type LocalLeadMagnetsBucket = NonNullable<ApiEnv["LEAD_MAGNETS_R2"]>;
type LocalLeadMagnetObject = Awaited<ReturnType<LocalLeadMagnetsBucket["get"]>>;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../../../..");

function createLocalLeadMagnetsBucket(): LocalLeadMagnetsBucket {
  return {
    async get(key: string) {
      const safeKey = path.basename(key);
      const filePath = path.join(
        repoRoot,
        "apps",
        "web",
        ".lead-magnets",
        safeKey,
      );
      if (!safeKey.endsWith(".pdf") || !fs.existsSync(filePath)) {
        return null;
      }

      const bytes = await fs.promises.readFile(filePath);
      return {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        httpMetadata: {
          contentType: "application/pdf",
        },
      } as LocalLeadMagnetObject;
    },
  } as LocalLeadMagnetsBucket;
}

export async function getLocalMarketingApiRuntime(
  requestUrl: string,
): Promise<LocalApiRuntime> {
  const url = new URL(requestUrl);
  const cacheKey = `${url.origin}::${url.host}`;
  const cachedRuntime = cachedLocalApiRuntimes.get(cacheKey);

  if (cachedRuntime) {
    return cachedRuntime;
  }

  const env = makeLocalEnv({
    ALLOWED_ORIGIN: url.origin,
    PRODUCT_DOMAIN: url.host,
    LEAD_MAGNETS_R2: createLocalLeadMagnetsBucket(),
  });

  const runtime = createLocalApi(env).then((api) => ({
    api,
    env,
  }));

  cachedLocalApiRuntimes.set(cacheKey, runtime);
  return runtime;
}

export async function getLocalMarketingOutbox(
  requestUrl: string,
): Promise<LocalOutbox | undefined> {
  const runtime = await getLocalMarketingApiRuntime(requestUrl);
  return runtime.env.LOCAL_OUTBOX;
}

export function resetLocalMarketingApiRuntime() {
  cachedLocalApiRuntimes.clear();
}
