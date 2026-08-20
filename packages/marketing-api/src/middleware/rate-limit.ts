import { createMiddleware } from "hono/factory";
import { isMarketingE2EAllowed } from "../lib/e2e-gate";

export const hits = new Map<string, { count: number; resetAt: number }>();

function pruneExpiredHits(now: number) {
  for (const [key, val] of hits) {
    if (val.resetAt <= now) {
      hits.delete(key);
    }
  }
}

export function rateLimit(
  maxRequests: number,
  windowMs: number = 60_000,
  scope?: string,
) {
  return createMiddleware(async (c, next) => {
    const e2eClientIp =
      isMarketingE2EAllowed(c.env)
        ? c.req.header("X-Kaiplan-E2E-IP")
        : undefined;
    const ip = e2eClientIp ?? c.req.header("CF-Connecting-IP") ?? "unknown";
    const siteId =
      (c.env as { PRODUCT_DOMAIN?: string } | undefined)?.PRODUCT_DOMAIN ??
      c.req.header("Host") ??
      "unknown-site";
    const bucket = scope ?? `${c.req.method}:${c.req.path}`;
    const key = `${siteId}:${bucket}:${ip}`;
    const now = Date.now();

    pruneExpiredHits(now);

    const entry = hits.get(key);

    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (entry.count >= maxRequests) {
      return c.json({ error: "Too many requests" }, 429);
    }

    entry.count++;
    await next();
  });
}

export const identifierBuckets = new Map<
  string,
  { tokens: number; lastRefill: number }
>();

const DEFAULT_MAX_IDENTIFIER_BUCKETS = 10_000;

// Smallest interval between full idle-bucket scans. The per-request prune is a
// no-op until this much time has elapsed since the last scan, so a high-traffic
// stream of consumes does not pay an O(n) scan on every call.
const IDENTIFIER_PRUNE_INTERVAL_MS = 60_000;

let lastIdentifierPruneAt = 0;

/**
 * Reset the prune gate. Exposed for tests so the idle-scan timing stays
 * deterministic regardless of test execution order.
 */
export function resetIdentifierPruneClock(): void {
  lastIdentifierPruneAt = 0;
}

function evictLeastValuableBucket(): void {
  // Prefer evicting idle/non-throttled buckets: the entry with the MOST tokens
  // is closest to full and least valuable to keep. Ties break on the oldest
  // lastRefill. This never evicts a throttled (tokens === 0) bucket while a
  // higher-token bucket exists, so a flood of fresh identities cannot reset an
  // actively-throttled attacker.
  let victimKey: string | null = null;
  let victimTokens = Number.NEGATIVE_INFINITY;
  let victimRefill = Number.POSITIVE_INFINITY;

  for (const [key, bucket] of identifierBuckets) {
    if (
      bucket.tokens > victimTokens ||
      (bucket.tokens === victimTokens && bucket.lastRefill < victimRefill)
    ) {
      victimKey = key;
      victimTokens = bucket.tokens;
      victimRefill = bucket.lastRefill;
    }
  }

  if (victimKey !== null) {
    identifierBuckets.delete(victimKey);
  }
}

function pruneIdentifierBuckets(
  now: number,
  capacity: number,
  refillIntervalMs: number,
  maxBuckets: number,
) {
  const idleFullBucketMs = Math.max(capacity, 1) * refillIntervalMs;
  // Gate the O(n) idle scan: run it at most once per interval, OR whenever the
  // map has grown past its cap (where a scan is needed for correctness anyway).
  // The interval is capped by the idle threshold so buckets that expire quickly
  // are still reclaimed promptly rather than lingering for a fixed minute.
  const scanInterval = Math.min(IDENTIFIER_PRUNE_INTERVAL_MS, idleFullBucketMs);
  const overCap = identifierBuckets.size >= maxBuckets;
  if (overCap || now - lastIdentifierPruneAt >= scanInterval) {
    lastIdentifierPruneAt = now;

    for (const [key, bucket] of identifierBuckets) {
      const elapsed = now - bucket.lastRefill;
      if (elapsed >= idleFullBucketMs) {
        identifierBuckets.delete(key);
      }
    }
  }

  // After idle cleanup, evict the least-valuable surviving bucket(s) if still
  // at or above the cap. This loop only runs in the rare overflow case.
  while (identifierBuckets.size >= maxBuckets) {
    const sizeBefore = identifierBuckets.size;
    evictLeastValuableBucket();
    if (identifierBuckets.size === sizeBefore) {
      break;
    }
  }
}

/**
 * Per-identifier token-bucket throttle (in-memory).
 *
 * Used to cap how often a normalized identifier (e.g. a submitter's email) can
 * trigger an outbound side effect, independent of the IP rate limit. Returns
 * `true` when a token was consumed (request allowed) and `false` when the
 * bucket is empty (request throttled).
 */
export function consumeIdentifierToken(
  prefix: string,
  identifier: string,
  opts?: { capacity?: number; refillIntervalMs?: number; maxBuckets?: number },
): boolean {
  const capacity = opts?.capacity ?? 3;
  const refillIntervalMs = opts?.refillIntervalMs ?? 600_000;
  const maxBuckets = opts?.maxBuckets ?? DEFAULT_MAX_IDENTIFIER_BUCKETS;
  const key = `${prefix}:${identifier.trim().toLowerCase()}`;
  const now = Date.now();

  pruneIdentifierBuckets(now, capacity, refillIntervalMs, maxBuckets);

  const bucket = identifierBuckets.get(key);
  if (!bucket) {
    identifierBuckets.set(key, { tokens: capacity - 1, lastRefill: now });
    return true;
  }

  const elapsed = now - bucket.lastRefill;
  if (elapsed >= refillIntervalMs) {
    const refill = Math.floor(elapsed / refillIntervalMs);
    bucket.tokens = Math.min(capacity, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    return false;
  }

  bucket.tokens -= 1;
  return true;
}
