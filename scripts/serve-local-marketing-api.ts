import { createServer, type IncomingMessage } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiEnv } from "../packages/marketing-api/src/index";
import {
  createLocalApi,
  makeLocalEnv,
} from "../packages/marketing-api/src/local-integration";

type LocalMarketingApiRuntimeOptions = {
  allowedOrigin?: string;
  productDomain?: string;
};

const port = Number(process.env.PORT ?? "8788");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export function isLocalMarketingApiHealthPath(pathname: string) {
  return pathname === "/api/health" || pathname === "/api/health/";
}

export async function createStandaloneLocalMarketingApiRuntime(
  options: LocalMarketingApiRuntimeOptions = {},
) {
  const allowedOrigin =
    options.allowedOrigin ??
    process.env.ALLOWED_ORIGIN ??
    "http://localhost:4321";
  const productDomain =
    options.productDomain ??
    process.env.PRODUCT_DOMAIN ??
    new URL(allowedOrigin).host;
  const env: ApiEnv = makeLocalEnv({
    ALLOWED_ORIGIN: allowedOrigin,
    PRODUCT_DOMAIN: productDomain,
    LEAD_MAGNETS_R2: createLocalLeadMagnetsBucket(),
  });
  const api = await createLocalApi(env);

  return {
    api,
    env,
  };
}

function createLocalLeadMagnetsBucket(): R2Bucket {
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
      } as R2ObjectBody;
    },
  } as R2Bucket;
}

function buildHeaders(req: IncomingMessage) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return headers;
}

function buildRequest(req: IncomingMessage, body: Buffer) {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const init: RequestInit = {
    method: req.method,
    headers: buildHeaders(req),
  };

  if (body.length > 0 && req.method !== "GET" && req.method !== "HEAD") {
    init.body = new Uint8Array(body);
  }

  return new Request(url, init);
}

async function startServer() {
  const runtime = await createStandaloneLocalMarketingApiRuntime();

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", async () => {
      try {
        const requestPath = new URL(req.url ?? "/", `http://127.0.0.1:${port}`)
          .pathname;
        if (isLocalMarketingApiHealthPath(requestPath)) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        const response = await runtime.api.fetch(
          buildRequest(req, Buffer.concat(chunks)),
          runtime.env,
        );

        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });

        const arrayBuffer = await response.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
      } catch (error) {
        console.error(error);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(
      `Local marketing API server listening on http://127.0.0.1:${port}`,
    );
  });
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  fs.realpathSync.native(fileURLToPath(import.meta.url)) ===
    fs.realpathSync.native(path.resolve(process.argv[1]));

if (isMainModule) {
  await startServer();
}
