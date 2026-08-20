import { getCollection } from "astro:content";
import { siteConfig } from "@/config/site";
import { filterIndexableEntries } from "@/lib/indexable-content";
import { buildKaiplanLlmsOverview, buildKaiplanLlmsSections } from "@/lib/llms";
import { buildLlmsTxt } from "@kaiplan/marketing/lib/llms-txt";
import type { APIContext } from "astro";

export const prerender = true;

export async function GET(_context: APIContext) {
  const siteUrl = `https://${siteConfig.domain}`;

  const alternatives = filterIndexableEntries(
    await getCollection("alternatives"),
  );
  const comparisons = filterIndexableEntries(
    await getCollection("comparisons"),
  );
  const pricingBreakdowns = filterIndexableEntries(
    await getCollection("pricing-breakdowns"),
  );
  const listicles = filterIndexableEntries(await getCollection("listicles"));
  const guides = filterIndexableEntries(await getCollection("guides"));
  const leadMagnets = filterIndexableEntries(
    await getCollection("lead-magnets"),
  );

  const body =
    buildLlmsTxt({
      name: siteConfig.name,
      description: siteConfig.metaDescription ?? siteConfig.tagline,
      overview: buildKaiplanLlmsOverview(),
      sections: buildKaiplanLlmsSections(siteUrl, {
        guides,
        comparisons,
        pricingBreakdowns,
        listicles,
        alternatives: alternatives.map((entry) => ({
          slug: entry.data.competitor.slug,
          data: entry.data,
        })),
        leadMagnets,
      }),
    }) + `\n> Full content listing: ${siteUrl}/llms-full.txt\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
