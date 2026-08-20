// Placeholder in this archived snapshot, like every other infrastructure
// identifier here. PostHog project keys are write-only and meant to ship in a
// browser bundle, so the real one was never a secret, but leaving it in a
// published repo lets anyone write events into a live project.
export const POSTHOG_API_KEY = "phc_REPLACE_WITH_POSTHOG_PROJECT_KEY";
export const POSTHOG_HOST = "https://us.i.posthog.com";

export interface PostHogInstance {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  register?(properties: Record<string, unknown>): void;
}

const SENSITIVE_PROPERTY_RE =
  /authorization|cookie|token|secret|code|password|session|stripe|invite|rsvp|referral|webhook|email|phone|name/i;
const EMAIL_VALUE_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!properties) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (SENSITIVE_PROPERTY_RE.test(key)) {
      continue;
    }
    if (typeof value === "string" && EMAIL_VALUE_RE.test(value)) {
      continue;
    }
    sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

declare global {
  interface Window {
    posthog?: PostHogInstance;
  }
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    window.posthog?.capture(event, properties);
  } catch {
    // PostHog is best-effort; browser analytics failures should never break the page.
  }
}

export function identifyUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    window.posthog?.identify(
      distinctId,
      sanitizeAnalyticsProperties(properties),
    );
  } catch {
    // PostHog is best-effort; browser analytics failures should never break the page.
  }
}

export function buildPostHogBootstrapScript(
  siteName: string,
  apiKey = POSTHOG_API_KEY,
  apiHost = POSTHOG_HOST,
): string {
  return `/* PostHog CDN snippet — loads array.js asynchronously */
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub people)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
try {
  posthog.init(${JSON.stringify(apiKey)}, {
    api_host: ${JSON.stringify(apiHost)},
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_persistence: true,
    disable_session_recording: true,
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    person_profiles: "identified_only"
  });
} catch {
  // PostHog is best-effort; bootstrap failures should never break the page.
}
try {
  posthog.register({ site: ${JSON.stringify(siteName)} });
} catch {
  // PostHog is best-effort; bootstrap failures should never break the page.
}`;
}
