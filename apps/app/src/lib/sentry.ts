import * as Sentry from "@sentry/react";
import { ApiError } from "./api";

export const IGNORED_ERRORS: Array<string | RegExp> = [
  /Failed to fetch dynamically imported module/,
  "ChunkLoadError",
  /Loading chunk \d+ failed/,
  /^Load failed$/,
  /(?:jsxDEV|jsx|jsxs) is not a function/,
];

const routeErrorIds = new WeakMap<object, string>();
const routeErrorMessageIds = new Map<string, string>();
const SENSITIVE_KEY_RE =
  /authorization|cookie|token|secret|code|password|session|stripe|invite|rsvp|referral|webhook/i;
const SENSITIVE_PATH_SEGMENT_RE =
  /^(?:authorization|cookie|token|secret|code|password|session|stripe|webhook)$/i;
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

export function scrubPath(pathname: string): string {
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
    url.pathname = scrubPath(url.pathname);
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
    const scrubbedPath = scrubPath(path);
    const scrubbedQuery = query.replace(
      /(^|&)((?:(?:t|ref)|[^=]*(?:authorization|cookie|token|secret|code|password|session|stripe|invite|rsvp|referral|webhook)[^=]*)=)[^&]*/gi,
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

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
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

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERRORS,
    beforeSend: scrubEvent,
  });
}

export function getReactRootErrorHandlers() {
  return {
    onUncaughtError: Sentry.reactErrorHandler(),
    onCaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
  };
}

export function captureException(
  error: unknown,
  tags?: Record<string, string>,
): string {
  let eventId = "";
  Sentry.withScope((scope) => {
    if (tags) {
      scope.setTags(tags);
    }
    eventId = Sentry.captureException(error);
  });
  return eventId;
}

export function captureRouteErrorOnce(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const existingEventId = routeErrorIds.get(error);
    if (existingEventId) {
      return existingEventId;
    }
    const eventId = captureException(error, { source: "tanstack-router" });
    routeErrorIds.set(error, eventId);
    return eventId;
  } else {
    const key = String(error);
    const existingEventId = routeErrorMessageIds.get(key);
    if (existingEventId) {
      return existingEventId;
    }
    const eventId = captureException(error, { source: "tanstack-router" });
    routeErrorMessageIds.set(key, eventId);
    return eventId;
  }
}

export function captureQueryError(error: unknown): string | undefined {
  if (error instanceof ApiError && error.status < 500) {
    return;
  }

  return captureException(error, { source: "react-query" });
}

export function setSentryUser(userId: string | null): void {
  Sentry.setUser(userId ? { id: userId } : null);
}
