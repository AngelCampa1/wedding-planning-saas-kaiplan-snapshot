const CANONICAL_HOST = "kaiplan.app";
const WWW_HOST = "www.kaiplan.app";
const LEGACY_REDIRECTS = new Map<string, string>([
  [
    "/resources/guides/the-knot-ftc-investigation-explained",
    "/resources/guides/the-knot-platform-scrutiny/",
  ],
  [
    "/resources/guides/the-knot-ftc-investigation-explained/",
    "/resources/guides/the-knot-platform-scrutiny/",
  ],
]);

const FILE_EXTENSION_RE =
  /\.(?:html|xml|txt|json|webmanifest|css|js|mjs|ico|png|jpg|jpeg|svg|webp|avif|gif|woff2?|ttf|otf|pdf|map|md)$/i;

function isExcludedPath(pathname: string): boolean {
  if (pathname === "/pricing.md") return false;
  return (
    FILE_EXTENSION_RE.test(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/w/")
  );
}

function needsTrailingSlash(pathname: string): boolean {
  return (
    pathname !== "/" && !pathname.endsWith("/") && !isExcludedPath(pathname)
  );
}

export function buildCanonicalRedirectResponse(
  inputUrl: URL,
): Response | undefined {
  const redirectUrl = new URL(inputUrl);
  let shouldRedirect = false;

  if (
    redirectUrl.hostname === WWW_HOST ||
    (redirectUrl.hostname === CANONICAL_HOST &&
      redirectUrl.protocol === "http:")
  ) {
    redirectUrl.protocol = "https:";
    redirectUrl.hostname = CANONICAL_HOST;
    shouldRedirect = true;
  }

  if (redirectUrl.pathname === "/pricing.md") {
    redirectUrl.pathname = "/pricing/";
    shouldRedirect = true;
  }

  const legacyTarget = LEGACY_REDIRECTS.get(redirectUrl.pathname);
  if (legacyTarget) {
    redirectUrl.pathname = legacyTarget;
    shouldRedirect = true;
  }

  if (isExcludedPath(inputUrl.pathname)) {
    return shouldRedirect
      ? Response.redirect(redirectUrl.toString(), 301)
      : undefined;
  }

  if (!legacyTarget && needsTrailingSlash(redirectUrl.pathname)) {
    redirectUrl.pathname = `${redirectUrl.pathname}/`;
    shouldRedirect = true;
  }

  return shouldRedirect
    ? Response.redirect(redirectUrl.toString(), 301)
    : undefined;
}
