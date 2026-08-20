import * as Sentry from "@sentry/browser";

export const SENTRY_DSN = import.meta.env.PUBLIC_SENTRY_DSN?.trim() ?? "";

export const IGNORED_ERRORS: Array<string | RegExp> = [
  /Failed to fetch dynamically imported module/,
  "ChunkLoadError",
  /Loading chunk \d+ failed/,
  /^Load failed$/,
  /(?:jsxDEV|jsx|jsxs) is not a function/,
];

const SENSITIVE_KEY_RE =
  /authorization|cookie|token|secret|password|session|stripe|invite|rsvp|referral|webhook/i;
const SENSITIVE_PATH_SEGMENT_RE =
  /^(?:authorization|cookie|token|secret|password|session|stripe|webhook)$/i;
const SENSITIVE_PATH_PREVIOUS_SEGMENT_RE =
  /auth|checkout|code|email|invite|invitation|payment|payments|preferences|referral|referrals|reset|rsvp|session|stripe|token|verify|verification|webhook/i;
const SHORT_SENSITIVE_PATH_PREVIOUS_SEGMENT_RE =
  /^(?:code|referral|referrals)$/i;
const TOKENISH_SEGMENT_RE = /^[A-Za-z0-9._~=-]{12,}$/;

function isSensitiveQueryKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return (
    SENSITIVE_KEY_RE.test(key) ||
    normalizedKey === "t" ||
    normalizedKey === "ref"
  );
}

export function scrubSentryPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment, index, segments) => {
      if (!segment) {
        return segment;
      }

      if (SENSITIVE_PATH_SEGMENT_RE.test(segment)) {
        return "[Filtered]";
      }

      const previousSegment = segments[index - 1] ?? "";
      if (
        SHORT_SENSITIVE_PATH_PREVIOUS_SEGMENT_RE.test(previousSegment) ||
        (SENSITIVE_PATH_PREVIOUS_SEGMENT_RE.test(previousSegment) &&
          TOKENISH_SEGMENT_RE.test(segment))
      ) {
        return "[Filtered]";
      }

      return segment;
    })
    .join("/");
}

function scrubUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.pathname = scrubSentryPath(url.pathname);
    for (const key of url.searchParams.keys()) {
      if (isSensitiveQueryKey(key)) {
        url.searchParams.set(key, "[Filtered]");
      }
    }
    return url.toString();
  } catch {
    const hashParts = rawUrl.split("#", 2);
    const urlWithoutHash = hashParts[0]!;
    const hash = hashParts[1] ?? "";
    const queryParts = urlWithoutHash.split("?", 2);
    const path = queryParts[0]!;
    const query = queryParts[1] ?? "";
    const scrubbedPath = scrubSentryPath(path);
    const scrubbedQuery = query.replace(
      /(^|&)((?:(?:t|ref)|[^=]*(?:authorization|cookie|token|secret|password|session|stripe|invite|rsvp|referral|webhook)[^=]*)=)[^&]*/gi,
      "$1$2[Filtered]",
    );
    const queryPrefix = query ? "?" : "";
    const hashPrefix = hash ? "#" : "";
    return `${scrubbedPath}${queryPrefix}${scrubbedQuery}${hashPrefix}${hash}`;
  }
}

function scrubHeaderValue(value: string): string {
  if (!/^https?:\/\//i.test(value)) {
    return value;
  }

  return scrubUrl(value);
}

export function scrubSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request?.url) {
    event.request.url = scrubUrl(event.request.url);
  }

  const headers = event.request?.headers;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        headers[key] = "[Filtered]";
      } else if (typeof headers[key] === "string") {
        headers[key] = scrubHeaderValue(headers[key]);
      }
    }
  }

  return event;
}

export function initSentry(siteName: string): void {
  if (!import.meta.env.PROD || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.PUBLIC_SENTRY_RELEASE,
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERRORS,
    beforeSend: scrubSentryEvent,
    initialScope: {
      tags: { site: siteName },
    },
  });
}

export function captureException(error: unknown): string {
  return Sentry.captureException(error);
}
