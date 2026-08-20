import type {
  HouseholdRsvpResponse,
  WeddingWebsitePublicResponse,
} from "@kaiplan/shared";

type PublicFetcher = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function resolvePublicApiBase(
  configuredBase: string | undefined,
  currentUrl: URL,
) {
  if (configuredBase && configuredBase.trim().length > 0) {
    return configuredBase.replace(/\/$/, "");
  }

  if (
    currentUrl.hostname === "localhost" ||
    currentUrl.hostname === "127.0.0.1"
  ) {
    return `http://${currentUrl.hostname}:5030`;
  }

  return currentUrl.origin.replace(/\/$/, "");
}

export function buildPublicApiUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function buildInviteLink(baseUrl: string, slug: string, token: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}/w/${slug}/?token=${token}#rsvp`;
}

export function shouldRenderVenueSection(venue: {
  name?: string | null;
  address?: string | null;
  details?: string | null;
  mapUrl?: string | null;
}) {
  return [venue.name, venue.address, venue.details, venue.mapUrl].some(
    (value) => Boolean(value?.trim()),
  );
}

export function shouldRenderStorySection(story: {
  title?: string | null;
  body?: string | null;
}) {
  return Boolean(story.body?.trim());
}

export function shouldRenderRegistrySection(registry: {
  title?: string | null;
  details?: string | null;
  url?: string | null;
}) {
  return [registry.details, registry.url].some((value) =>
    Boolean(value?.trim()),
  );
}

export function getContentCardClassName(visibleCardCount: number) {
  return visibleCardCount <= 1
    ? "section-card section-card-wide"
    : "section-card";
}

type TemplateTheme = {
  pageClass: string;
  heroClass: string;
  pageBg: string;
  panelBg: string;
  panelStrong: string;
  textMain: string;
  textMuted: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentSoft: string;
  heroFrom: string;
  heroTo: string;
};

const TEMPLATE_THEMES: Record<string, TemplateTheme> = {
  modern: {
    pageClass: "theme-modern",
    heroClass: "hero-modern",
    pageBg: "#edf0ea",
    panelBg: "rgba(249, 251, 248, 0.84)",
    panelStrong: "rgba(252, 253, 251, 0.94)",
    textMain: "#203027",
    textMuted: "#5a695f",
    line: "rgba(32, 48, 39, 0.12)",
    lineStrong: "rgba(32, 48, 39, 0.22)",
    accent: "#5f7d69",
    accentSoft: "rgba(95, 125, 105, 0.14)",
    heroFrom: "rgba(247, 248, 244, 0.96)",
    heroTo: "rgba(233, 240, 232, 0.82)",
  },
  editorial: {
    pageClass: "theme-editorial",
    heroClass: "hero-editorial",
    pageBg: "#f5efe8",
    panelBg: "rgba(255, 250, 246, 0.84)",
    panelStrong: "rgba(255, 252, 249, 0.94)",
    textMain: "#2f211f",
    textMuted: "#745955",
    line: "rgba(47, 33, 31, 0.12)",
    lineStrong: "rgba(47, 33, 31, 0.22)",
    accent: "#7e4b46",
    accentSoft: "rgba(126, 75, 70, 0.14)",
    heroFrom: "rgba(255, 255, 255, 0.92)",
    heroTo: "rgba(244, 232, 226, 0.78)",
  },
  classic: {
    pageClass: "theme-classic",
    heroClass: "hero-classic",
    pageBg: "#f7f1e8",
    panelBg: "rgba(255, 255, 255, 0.84)",
    panelStrong: "rgba(255, 255, 255, 0.92)",
    textMain: "#211b19",
    textMuted: "#6a5e57",
    line: "rgba(33, 27, 25, 0.12)",
    lineStrong: "rgba(33, 27, 25, 0.2)",
    accent: "#b86e3f",
    accentSoft: "rgba(184, 110, 63, 0.14)",
    heroFrom: "rgba(255, 255, 255, 0.94)",
    heroTo: "rgba(255, 247, 240, 0.78)",
  },
};

export function getTemplateTheme(template: string) {
  return TEMPLATE_THEMES[template] ?? TEMPLATE_THEMES.classic;
}

export const INVALID_INVITE_LINK_MESSAGE =
  "This invitation link is no longer active. Please use the latest link the couple shared with you.";
export const RSVP_TEMPORARY_ERROR_MESSAGE =
  "We couldn't load your RSVP right now. Please try again in a moment or use the same invite link later.";

export async function loadPublicWebsiteData(
  fetcher: PublicFetcher,
  apiBase: string,
  slug: string,
): Promise<{
  website: WeddingWebsitePublicResponse | null;
  status: number;
}> {
  try {
    const response = await fetcher(
      buildPublicApiUrl(apiBase, `/api/public/websites/${slug}`),
    );

    if (!response.ok) {
      return {
        website: null,
        status: response.status,
      };
    }

    return {
      website: (await response.json()) as WeddingWebsitePublicResponse,
      status: 200,
    };
  } catch {
    return {
      website: null,
      status: 500,
    };
  }
}

export async function loadPublicHouseholdRsvp(
  fetcher: PublicFetcher,
  apiBase: string,
  token: string,
): Promise<{
  household: HouseholdRsvpResponse | null;
  householdError: string | null;
}> {
  try {
    const response = await fetcher(
      buildPublicApiUrl(apiBase, `/api/public/rsvp/${token}`),
    );

    if (!response.ok) {
      return {
        household: null,
        householdError:
          response.status === 400 ||
          response.status === 404 ||
          response.status === 410
            ? INVALID_INVITE_LINK_MESSAGE
            : RSVP_TEMPORARY_ERROR_MESSAGE,
      };
    }

    return {
      household: (await response.json()) as HouseholdRsvpResponse,
      householdError: null,
    };
  } catch {
    return {
      household: null,
      householdError: RSVP_TEMPORARY_ERROR_MESSAGE,
    };
  }
}
