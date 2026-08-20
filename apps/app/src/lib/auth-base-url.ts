export function resolveAuthBaseUrl(
  apiUrl: string | undefined,
  browserOrigin?: string,
) {
  if (apiUrl) {
    return `${apiUrl}/api/auth`;
  }

  if (browserOrigin) {
    return `${browserOrigin}/api/auth`;
  }

  return "/api/auth";
}
