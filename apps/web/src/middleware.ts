import { defineMiddleware } from "astro:middleware";
import { buildCanonicalRedirectResponse } from "./lib/canonical-redirect";
import {
  applySecurityHeaders,
  getRouteHeaderPolicy,
} from "./lib/security-headers";
import { createSiteWebManifestResponse } from "./lib/site-webmanifest";

const PUBLIC_LEAD_MAGNET_PDF_RE = /^\/lead-magnets\/[^/]+\.pdf$/i;
const SITE_WEB_MANIFEST_PATHS = new Set([
  "/site.webmanifest",
  "/site.webmanifest/",
]);
const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function removeLocalHttpUpgradeDirective(response: Response, url: URL) {
  if (url.protocol !== "http:" || !LOCAL_HTTP_HOSTS.has(url.hostname)) {
    return response;
  }

  const csp = response.headers.get("Content-Security-Policy");
  if (!csp) {
    return response;
  }

  response.headers.set(
    "Content-Security-Policy",
    csp
      .split(";")
      .map((directive) => directive.trim())
      .filter((directive) => directive !== "upgrade-insecure-requests")
      .join("; "),
  );
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;
  if (PUBLIC_LEAD_MAGNET_PDF_RE.test(pathname)) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const canonicalRedirect = buildCanonicalRedirectResponse(context.url);
  if (canonicalRedirect) {
    return canonicalRedirect;
  }

  if (SITE_WEB_MANIFEST_PATHS.has(pathname)) {
    return removeLocalHttpUpgradeDirective(
      applySecurityHeaders(
        createSiteWebManifestResponse(),
        getRouteHeaderPolicy(pathname),
      ),
      context.url,
    );
  }

  const response = await next();
  const policy = getRouteHeaderPolicy(context.url.pathname);
  return removeLocalHttpUpgradeDirective(
    applySecurityHeaders(response, policy),
    context.url,
  );
});
