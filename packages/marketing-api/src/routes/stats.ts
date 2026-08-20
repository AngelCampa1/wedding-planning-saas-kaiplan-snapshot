import { Hono } from "hono";
import { count, countDistinct, eq } from "drizzle-orm";
import {
  signups,
  pricingClicks,
  surveyResponses,
  feedback,
} from "../db/schema";
import type { DrizzleD1Database } from "../app";
import { captureMarketingApiException } from "../services/sentry";

type SourcePageGroup =
  | "home"
  | "cycle"
  | "goals"
  | "guides"
  | "bestOf"
  | "alternatives"
  | "comparisons"
  | "pricing"
  | "leadMagnets"
  | "other";

type SourcePageRollup = Record<SourcePageGroup, number>;

type SurveySegmentRollup = {
  longevity40Plus: number;
  hormoneAware: number;
  other: number;
};

const LONGEVITY_40_PLUS_SEGMENT =
  "i'm 40+ and focused on strength and longevity";
const HORMONE_AWARE_SEGMENTS = new Set([
  "i want to start syncing workouts to my cycle",
  "i'm already cycle syncing and want better programming",
]);

async function hashAndCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let result = 0;
  for (let i = 0; i < bytesA.length; i++)
    result |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  return result === 0;
}

function createEmptySourcePageRollup(): SourcePageRollup {
  return {
    home: 0,
    cycle: 0,
    goals: 0,
    guides: 0,
    bestOf: 0,
    alternatives: 0,
    comparisons: 0,
    pricing: 0,
    leadMagnets: 0,
    other: 0,
  };
}

function createEmptySurveySegmentRollup(): SurveySegmentRollup {
  return {
    longevity40Plus: 0,
    hormoneAware: 0,
    other: 0,
  };
}

function normalizeText(value: string | null | undefined): string {
  const normalizedValue = typeof value === "string" ? value : "";

  return normalizedValue
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ");
}

function normalizeSourcePage(sourcePage: string | null | undefined): string {
  const trimmed = typeof sourcePage === "string" ? sourcePage.trim() : "";
  if (!trimmed) {
    return "";
  }

  let path = trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      path = new URL(trimmed).pathname;
    } catch {
      path = trimmed;
    }
  }

  const withoutQuery = path.split(/[?#]/, 1)[0] ?? "";
  if (!withoutQuery) {
    return "/";
  }

  const lowerCased = withoutQuery.toLowerCase();
  if (lowerCased === "/") {
    return lowerCased;
  }

  const prefixed = lowerCased.startsWith("/") ? lowerCased : `/${lowerCased}`;
  return prefixed.endsWith("/") ? prefixed.slice(0, -1) : prefixed;
}

function groupSourcePage(
  sourcePage: string | null | undefined,
): SourcePageGroup {
  const normalized = normalizeSourcePage(sourcePage);

  if (normalized === "/") {
    return "home";
  }

  if (normalized.startsWith("/cycle")) {
    return "cycle";
  }

  if (normalized.startsWith("/for")) {
    return "goals";
  }

  if (normalized.startsWith("/resources/guides")) {
    return "guides";
  }

  if (normalized.startsWith("/resources/best")) {
    return "bestOf";
  }

  if (normalized.startsWith("/compare/alternatives")) {
    return "alternatives";
  }

  if (normalized.startsWith("/compare/pricing")) {
    return "pricing";
  }

  if (normalized.startsWith("/compare")) {
    return "comparisons";
  }

  if (normalized.startsWith("/free")) {
    return "leadMagnets";
  }

  return "other";
}

function buildSourcePageRollup(
  rows: Array<{ sourcePage: string | null | undefined }>,
): SourcePageRollup {
  return rows.reduce((rollup, row) => {
    rollup[groupSourcePage(row.sourcePage)] += 1;
    return rollup;
  }, createEmptySourcePageRollup());
}

function groupSurveySegment(
  answer: string | null | undefined,
): keyof SurveySegmentRollup {
  const normalized = normalizeText(answer);

  if (normalized === LONGEVITY_40_PLUS_SEGMENT) {
    return "longevity40Plus";
  }

  if (HORMONE_AWARE_SEGMENTS.has(normalized)) {
    return "hormoneAware";
  }

  return "other";
}

function buildSurveySegmentRollup(
  rows: Array<{ answer: string | null | undefined }>,
): SurveySegmentRollup {
  return rows.reduce((rollup, row) => {
    rollup[groupSurveySegment(row.answer)] += 1;
    return rollup;
  }, createEmptySurveySegmentRollup());
}

export function statsRoute(authSecret: string | null) {
  const route = new Hono<{ Variables: { db: DrizzleD1Database } }>();

  route.get("/", async (c) => {
    const auth = c.req.header("Authorization");
    if (!authSecret || !auth) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const matches = await hashAndCompare(`Bearer ${authSecret}`, auth);
    if (!matches) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const db = c.get("db");

    try {
      // Drizzle aggregate queries always return exactly one row; non-null assertions are safe.
      const [signupCount] = await db.select({ count: count() }).from(signups);
      const [clickCount] = await db
        .select({ count: count() })
        .from(pricingClicks);
      const [surveyCount] = await db
        .select({ count: countDistinct(surveyResponses.signupEmail) })
        .from(surveyResponses);

      const [feedbackTotal] = await db
        .select({ count: count() })
        .from(feedback);
      const [feedbackBug] = await db
        .select({ count: count() })
        .from(feedback)
        .where(eq(feedback.category, "bug"));
      const [feedbackIdea] = await db
        .select({ count: count() })
        .from(feedback)
        .where(eq(feedback.category, "idea"));
      const [feedbackOther] = await db
        .select({ count: count() })
        .from(feedback)
        .where(eq(feedback.category, "other"));

      const signupSourcePages = await db
        .select({ sourcePage: signups.sourcePage })
        .from(signups);
      const pricingClickSourcePages = await db
        .select({ sourcePage: pricingClicks.sourcePage })
        .from(pricingClicks);
      const surveySegmentAnswers = await db
        .select({ answer: surveyResponses.answer })
        .from(surveyResponses)
        .where(eq(surveyResponses.questionId, "segment"));

      return c.json({
        signups: signupCount!.count,

        pricingClicks: clickCount!.count,

        surveyResponses: surveyCount!.count,
        feedback: {
          total: feedbackTotal!.count,

          bug: feedbackBug!.count,

          idea: feedbackIdea!.count,

          other: feedbackOther!.count,
        },
        rollups: {
          signupSourcePages: buildSourcePageRollup(signupSourcePages),
          pricingClickSourcePages: buildSourcePageRollup(
            pricingClickSourcePages,
          ),
          surveySegments: buildSurveySegmentRollup(surveySegmentAnswers),
        },
      });
    } catch (err) {
      console.error("[stats] DB query failed:", err);
      const errorId = captureMarketingApiException(err, {
        source: "stats-db-query",
      });
      const response = c.json(
        {
          error: "Internal server error",
          ...(errorId ? { errorId } : {}),
        },
        500,
      );
      if (errorId) {
        response.headers.set("X-Kaiplan-Error-Id", errorId);
      }
      return response;
    }
  });

  return route;
}
