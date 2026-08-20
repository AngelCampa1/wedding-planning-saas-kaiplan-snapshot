/**
 * Minimal server-side PostHog capture helper.
 *
 * POSTs to the PostHog capture endpoint when `apiKey` is provided. When the
 * key is missing or empty, the call is a no-op — this lets tests and local
 * environments run without a key configured.
 *
 * Designed for fire-and-forget use via `ctx.waitUntil(...)`: any fetch
 * failure is caught and logged without being re-thrown so a telemetry outage
 * never impacts the response path.
 */
import { captureMarketingApiException } from "./sentry";

export interface CaptureServerEventArgs {
  apiKey: string | undefined;
  distinctId: string;
  event: string;
  properties: Record<string, unknown>;
}

const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/capture/";

export async function captureServerEvent(
  args: CaptureServerEventArgs,
): Promise<void> {
  const { apiKey, distinctId, event, properties } = args;
  if (!apiKey) {
    return;
  }

  const payload = {
    api_key: apiKey,
    distinct_id: distinctId,
    event,
    properties,
  };

  try {
    const res = await fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      throw new Error(
        `PostHog capture failed: ${res.status} ${res.statusText}${responseBody ? ` ${responseBody}` : ""}`.trim(),
      );
    }
  } catch (err) {
    console.error("[analytics] captureServerEvent failed", err);
    captureMarketingApiException(err, { source: "posthog-capture" });
  }
}
