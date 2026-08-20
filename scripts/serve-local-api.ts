import { createServer, type IncomingMessage } from "node:http";
import app from "../apps/api/src/index";
import type { Env } from "../apps/api/src/lib/env";
import { buildLocalApiEnv } from "./local-e2e-config";

const port = Number(process.env.PORT ?? "8787");

function buildEnv(): Env {
  return buildLocalApiEnv(process.env) as unknown as Env;
}

const env = buildEnv();

function createLocalExecutionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) {
      promise.catch((error: unknown) => console.error(error));
    },
    passThroughOnException() {},
  } as unknown as ExecutionContext;
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

async function handleAuthFallback(request: Request) {
  const url = new URL(request.url);
  if (
    !env.DATABASE_URL &&
    (url.pathname === "/api/auth/session" ||
      url.pathname === "/api/auth/get-session")
  ) {
    return Response.json(null, { status: 200 });
  }

  if (!app.fetch) {
    throw new Error("API worker fetch handler is not available.");
  }

  return app.fetch(request as never, env, createLocalExecutionContext());
}

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  req.on("end", async () => {
    try {
      const response = await handleAuthFallback(
        buildRequest(req, Buffer.concat(chunks)),
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
  console.log(`Local API server listening on http://127.0.0.1:${port}`);
});
