export const DEFAULT_LOCAL_MARKETING_API_PORT = 8788;

function readRuntimeEnvValue(key: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string> } }).process
    ?.env?.[key];
}

function readConfiguredPublicMarketingApiUrl(configuredUrl?: string): string {
  const explicitConfiguredUrl = configuredUrl?.trim();
  if (explicitConfiguredUrl) {
    return explicitConfiguredUrl;
  }

  return (
    readRuntimeEnvValue("PUBLIC_MARKETING_API_URL")?.trim() ??
    import.meta.env.PUBLIC_MARKETING_API_URL?.trim() ??
    ""
  );
}

export function hasConfiguredPublicMarketingApiUrl(
  configuredUrl?: string,
): boolean {
  return readConfiguredPublicMarketingApiUrl(configuredUrl).length > 0;
}

export function resolveMarketingApiBaseUrl(
  requestUrl: string,
  configuredUrl?: string,
): string {
  const configuredPublicMarketingApiUrl =
    readConfiguredPublicMarketingApiUrl(configuredUrl);
  if (configuredPublicMarketingApiUrl.length > 0) {
    return configuredPublicMarketingApiUrl.replace(/\/$/, "");
  }

  const request = new URL(requestUrl);
  return `${request.protocol}//${request.hostname}:${DEFAULT_LOCAL_MARKETING_API_PORT}`;
}

export function buildMarketingApiProxyRequest(
  request: Request,
  baseUrl: string,
): Request {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname !== "/" && requestUrl.pathname.endsWith("/")) {
    requestUrl.pathname = requestUrl.pathname.slice(0, -1);
  }

  const proxiedUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    baseUrl.replace(/\/$/, ""),
  );

  return new Request(proxiedUrl, request);
}

export async function proxyMarketingApiRequest(
  request: Request,
  baseUrl: string,
): Promise<Response> {
  return fetch(buildMarketingApiProxyRequest(request, baseUrl));
}
