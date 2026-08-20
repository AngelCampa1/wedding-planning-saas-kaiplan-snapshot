/**
 * DataForSEO content gap analysis script.
 *
 * Queries DataForSEO SERP API for 50 seed keywords, extracts top-10 competitor
 * URLs per keyword, diffs against existing Kaiplan sitemap paths, and ranks
 * gaps by search volume × (1 – KD/100) priority score.
 *
 * Usage:
 *   DATAFORSEO_LOGIN=email DATAFORSEO_PASSWORD=password \
 *   pnpm tsx scripts/dataforseo-content-gap.ts
 *
 * Output: scripts/lib/content-gap-report.json
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const OUT_DIR = resolve(HERE, "lib");
const OUT_FILE = resolve(OUT_DIR, "content-gap-report.json");

// Existing Kaiplan content paths (derived from content collections)
const EXISTING_PATHS = new Set([
  // alternatives
  "/compare/alternatives/aisle-planner",
  "/compare/alternatives/appy-couple",
  "/compare/alternatives/bridebook",
  "/compare/alternatives/hitchd",
  "/compare/alternatives/joy",
  "/compare/alternatives/minted",
  "/compare/alternatives/planning-pod",
  "/compare/alternatives/the-knot",
  "/compare/alternatives/weddingwire",
  "/compare/alternatives/zola",
  // comparisons
  "/compare/versus/aisle-planner-vs-the-knot",
  "/compare/versus/bridebook-vs-zola",
  "/compare/versus/hitchd-vs-zola-registry",
  "/compare/versus/joy-vs-the-knot-planning-features",
  "/compare/versus/one-time-fee-vs-subscription-wedding-apps",
  "/compare/versus/the-knot-vs-joy",
  "/compare/versus/the-knot-vs-weddingwire",
  "/compare/versus/the-knot-vs-zola",
  "/compare/versus/wedding-budget-apps-vs-spreadsheets",
  "/compare/versus/zola-vs-joy",
  "/compare/versus/zola-vs-minted",
  "/compare/versus/zola-vs-the-knot",
  "/compare/versus/zola-vs-weddingwire-budget-tracking",
  // pricing
  "/compare/pricing/aisle-planner",
  "/compare/pricing/appy-couple",
  "/compare/pricing/bridebook",
  "/compare/pricing/hitchd",
  "/compare/pricing/joy",
  "/compare/pricing/minted",
  "/compare/pricing/the-knot",
  "/compare/pricing/weddingwire",
  "/compare/pricing/zola",
  // guides (sample — full list in content/guides/)
  "/resources/guides/how-to-plan-a-wedding",
  "/resources/guides/wedding-budget-guide",
  "/resources/guides/wedding-planning-checklist",
  "/resources/guides/wedding-planning-timeline",
  "/resources/guides/destination-wedding-planning-guide",
  "/resources/guides/how-to-choose-a-wedding-venue",
  "/resources/guides/how-to-hire-a-wedding-photographer",
  "/resources/guides/how-to-hire-a-wedding-caterer",
  "/resources/guides/wedding-seating-chart-guide",
  "/resources/guides/wedding-guest-list-guide",
  "/resources/guides/wedding-budget-breakdown",
  "/resources/guides/how-to-plan-a-wedding-on-a-budget",
  "/resources/guides/wedding-photography-cost-guide",
  "/resources/guides/wedding-venue-cost-guide",
  "/resources/guides/wedding-catering-cost-guide",
  // best-of
  "/resources/best/best-wedding-planning-apps",
  "/resources/best/best-wedding-budget-apps",
  "/resources/best/best-wedding-checklist-apps",
  "/resources/best/best-free-wedding-planning-apps",
  "/resources/best/best-wedding-apps-for-couples",
  // lead magnets
  "/free/budget-template",
  "/free/hidden-cost-calculator-worksheet",
  "/free/vendor-interview-question-list",
  "/free/vendor-red-flag-checklist",
  "/free/wedding-app-comparison-scorecard",
  "/free/wedding-timeline-template",
]);

// 50 seed keywords covering all buyer stages
const SEED_KEYWORDS = [
  // TOFU - awareness
  "how to plan a wedding",
  "wedding planning checklist",
  "wedding planning timeline",
  "wedding budget guide",
  "destination wedding planning",
  "elopement planning guide",
  "micro wedding planning",
  "beach wedding planning",
  "backyard wedding ideas",
  "winter wedding planning",
  "barn wedding planning",
  "bachelorette party planning",
  "engagement party planning",
  "wedding thank you notes",
  "wedding ring guide",
  "wedding photography styles",
  "how to choose wedding flowers",
  "wedding band vs dj",
  "wedding transportation guide",
  "wedding insurance guide",
  // MOFU - consideration
  "best wedding planning apps",
  "best wedding planning software",
  "best wedding budget apps",
  "best wedding rsvp apps",
  "best wedding apps for couples",
  "best free wedding planning tools",
  "best wedding checklist apps",
  "best wedding apps without ads",
  "zola alternative",
  "the knot alternative",
  "joy wedding app alternative",
  "weddingwire alternative",
  "bridebook alternative",
  "zola vs the knot",
  "zola vs joy",
  "the knot vs weddingwire",
  "the knot pricing",
  "zola pricing",
  "joy wedding pricing",
  "weddingwire pricing",
  // BOFU - decision
  "kaiplan wedding app",
  "kaiplan vs zola",
  "kaiplan vs the knot",
  "wedding planning app lifetime deal",
  "wedding planning app no ads",
  "wedding planning app one time payment",
  "wedding planning app with budget tracker",
  "wedding planning app with guest list",
  "wedding planning app with vendor management",
  "wedding planning app with seating chart",
];

interface DataForSeoTask {
  keyword: string;
  language_code: string;
  location_code: number;
  se_domain: string;
  device: string;
  os: string;
  depth: number;
}

interface SerpItem {
  type: string;
  rank_absolute: number;
  url: string;
  title: string;
  domain: string;
}

interface SerpResult {
  keyword: string;
  items: SerpItem[];
}

interface KeywordVolumeItem {
  keyword: string;
  search_volume: number | null;
  competition: number | null;
  competition_level: string | null;
  keyword_difficulty: number | null;
}

export interface GapEntry {
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number;
  priorityScore: number;
  topCompetitorUrls: string[];
  suggestedSlug: string;
  suggestedCollection: string;
  buyerStage: "tofu" | "mofu" | "bofu";
}

export interface GapReport {
  generatedAt: string;
  totalKeywordsAnalyzed: number;
  gapsFound: number;
  gaps: GapEntry[];
}

function buildAuthHeader(login: string, password: string): string {
  const encoded = Buffer.from(`${login}:${password}`).toString("base64");
  return `Basic ${encoded}`;
}

async function fetchSerpResults(
  keywords: string[],
  authHeader: string,
): Promise<SerpResult[]> {
  const tasks: DataForSeoTask[] = keywords.map((kw) => ({
    keyword: kw,
    language_code: "en",
    location_code: 2840, // United States
    se_domain: "google.com",
    device: "desktop",
    os: "windows",
    depth: 10,
  }));

  // DataForSEO allows up to 100 tasks per request
  const BATCH_SIZE = 10;
  const results: SerpResult[] = [];

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    process.stdout.write(
      `[dataforseo] fetching SERP batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tasks.length / BATCH_SIZE)} (${batch.length} keywords)...\n`,
    );

    const response = await fetch(
      "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      },
    );

    if (!response.ok) {
      throw new Error(
        `DataForSEO SERP API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      tasks?: Array<{
        data?: { keyword?: string };
        result?: Array<{ items?: SerpItem[] }>;
      }>;
    };

    if (data.tasks) {
      for (const task of data.tasks) {
        const keyword = task.data?.keyword ?? "";
        const items: SerpItem[] = [];
        if (task.result) {
          for (const r of task.result) {
            if (r.items) {
              for (const item of r.items) {
                if (
                  item.type === "organic" &&
                  item.url &&
                  items.length < 10
                ) {
                  items.push(item);
                }
              }
            }
          }
        }
        results.push({ keyword, items });
      }
    }

    // Small delay to be respectful of rate limits
    if (i + BATCH_SIZE < tasks.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

async function fetchKeywordVolumes(
  keywords: string[],
  authHeader: string,
): Promise<Map<string, KeywordVolumeItem>> {
  process.stdout.write(
    `[dataforseo] fetching keyword volumes for ${keywords.length} keywords...\n`,
  );

  const BATCH_SIZE = 100;
  const volumeMap = new Map<string, KeywordVolumeItem>();

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE);

    const response = await fetch(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keywords: batch,
            language_code: "en",
            location_code: 2840,
          },
        ]),
      },
    );

    if (!response.ok) {
      process.stderr.write(
        `[dataforseo] volume API warning: ${response.status} ${response.statusText} — using defaults\n`,
      );
      continue;
    }

    const data = (await response.json()) as {
      tasks?: Array<{
        result?: KeywordVolumeItem[];
      }>;
    };

    if (data.tasks) {
      for (const task of data.tasks) {
        if (task.result) {
          for (const item of task.result) {
            volumeMap.set(item.keyword, item);
          }
        }
      }
    }

    if (i + BATCH_SIZE < keywords.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return volumeMap;
}

function inferBuyerStage(keyword: string): "tofu" | "mofu" | "bofu" {
  const kw = keyword.toLowerCase();
  const bofuPatterns = [
    "kaiplan",
    "lifetime deal",
    "pricing",
    "trial",
    "buy",
    "sign up",
    "get started",
    "alternative to",
  ];
  const mofuPatterns = [
    "best",
    "top",
    "vs",
    "versus",
    "compare",
    "alternative",
    "review",
    "cost",
  ];
  if (bofuPatterns.some((p) => kw.includes(p))) return "bofu";
  if (mofuPatterns.some((p) => kw.includes(p))) return "mofu";
  return "tofu";
}

function inferCollection(
  keyword: string,
): { collection: string; slug: string } {
  const kw = keyword.toLowerCase();

  if (kw.includes(" vs ") || kw.includes(" versus ")) {
    const slug = kw
      .replace(/\s+vs\s+|\s+versus\s+/, "-vs-")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return { collection: "comparisons", slug };
  }

  if (kw.includes("alternative")) {
    const competitor = kw
      .replace(/\s+alternative.*$/, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return { collection: "alternatives", slug: `${competitor}-alternative` };
  }

  if (kw.includes("pricing") || kw.includes("price") || kw.includes("cost of")) {
    const product = kw
      .replace(/\s+(pricing|price|cost of).*$/, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return { collection: "pricing-breakdowns", slug: `${product}-pricing` };
  }

  if (kw.startsWith("best ")) {
    const slug = kw
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return { collection: "listicles", slug };
  }

  const slug = kw
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return { collection: "guides", slug };
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function extractTopicFromCompetitorUrls(items: SerpItem[]): string[] {
  return items
    .filter((item) => {
      const domain = item.domain ?? "";
      return (
        domain.includes("theknot") ||
        domain.includes("zola") ||
        domain.includes("weddingwire") ||
        domain.includes("brides") ||
        domain.includes("thespruce") ||
        domain.includes("weddingforward") ||
        domain.includes("hitchd") ||
        domain.includes("joy") ||
        domain.includes("bridebook")
      );
    })
    .slice(0, 5)
    .map((item) => item.url);
}

async function runAnalysis(): Promise<void> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error(
      "DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD environment variables are required.",
    );
  }

  const authHeader = buildAuthHeader(login, password);
  process.stdout.write(
    `[dataforseo] starting content gap analysis for ${SEED_KEYWORDS.length} seed keywords\n`,
  );

  // Fetch SERP data
  const serpResults = await fetchSerpResults(SEED_KEYWORDS, authHeader);

  // Fetch keyword volumes
  const volumeMap = await fetchKeywordVolumes(SEED_KEYWORDS, authHeader);

  // Identify gaps: keywords where Kaiplan doesn't rank in top 10
  const gaps: GapEntry[] = [];

  for (const result of serpResults) {
    const { keyword, items } = result;

    // Check if Kaiplan appears in top 10
    const kaiplanRanks = items.some(
      (item) =>
        item.domain?.includes("kaiplan") ||
        item.url?.includes("kaiplan.app"),
    );

    if (kaiplanRanks) {
      process.stdout.write(`[dataforseo] ✓ already ranking: "${keyword}"\n`);
      continue;
    }

    // Check if we have existing content for this keyword
    const { collection, slug } = inferCollection(keyword);
    const candidatePath = `/${collection === "guides" ? "resources/guides" : collection === "listicles" ? "resources/best" : collection === "comparisons" ? "compare/versus" : collection === "alternatives" ? "compare/alternatives" : "compare/pricing"}/${slug}`;

    if (EXISTING_PATHS.has(candidatePath)) {
      process.stdout.write(
        `[dataforseo] ✓ existing content: "${keyword}" → ${candidatePath}\n`,
      );
      continue;
    }

    const volumeData = volumeMap.get(keyword);
    const searchVolume = volumeData?.search_volume ?? 500; // default if API unavailable
    const kd = volumeData?.keyword_difficulty ?? 30; // default
    const priorityScore = Math.round(
      searchVolume * (1 - Math.min(kd, 100) / 100),
    );

    const topUrls = extractTopicFromCompetitorUrls(items);

    gaps.push({
      keyword,
      searchVolume,
      keywordDifficulty: kd,
      priorityScore,
      topCompetitorUrls: topUrls,
      suggestedSlug: slug,
      suggestedCollection: collection,
      buyerStage: inferBuyerStage(keyword),
    });

    process.stdout.write(
      `[dataforseo] GAP: "${keyword}" — vol: ${searchVolume}, KD: ${kd}, score: ${priorityScore}\n`,
    );
  }

  // Sort by priority score descending
  gaps.sort((a, b) => b.priorityScore - a.priorityScore);

  const report: GapReport = {
    generatedAt: new Date().toISOString(),
    totalKeywordsAnalyzed: SEED_KEYWORDS.length,
    gapsFound: gaps.length,
    gaps,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  process.stdout.write(
    `[dataforseo] report written to ${OUT_FILE}\n` +
      `[dataforseo] analyzed: ${SEED_KEYWORDS.length} keywords, gaps found: ${gaps.length}\n`,
  );

  if (gaps.length > 0) {
    process.stdout.write("\nTop 10 priority gaps:\n");
    for (const gap of gaps.slice(0, 10)) {
      process.stdout.write(
        `  ${gap.priorityScore.toLocaleString()} — "${gap.keyword}" (${gap.buyerStage}, ${gap.suggestedCollection})\n`,
      );
    }
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("dataforseo-content-gap.ts")) {
  runAnalysis().catch((err: unknown) => {
    process.stderr.write(
      `[dataforseo] failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exitCode = 1;
  });
}
