import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { siteConfig } from "@/config/site";
import { contentEntrySlug } from "@/lib/content-entry";
import { filterIndexableEntries } from "@/lib/indexable-content";
import {
  buildRssFeedOptions,
  contentItemToRssItem,
} from "@kaiplan/marketing/lib/rss-utils";
import type { APIContext } from "astro";

export async function GET(_context: APIContext) {
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

  const siteUrl = `https://${siteConfig.domain}`;

  const items = [
    ...alternatives.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: `${siteUrl}/compare/alternatives/${e.data.competitor.slug}`,
      }),
    ),
    ...comparisons.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: `${siteUrl}/compare/versus/${contentEntrySlug(e)}`,
      }),
    ),
    ...pricingBreakdowns.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: `${siteUrl}/compare/pricing/${contentEntrySlug(e)}`,
      }),
    ),
    ...listicles.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: `${siteUrl}/resources/best/${contentEntrySlug(e)}`,
      }),
    ),
    ...guides.map((e) =>
      contentItemToRssItem({
        title: e.data.title,
        description: e.data.description,
        publishedAt: e.data.publishedAt,
        link: `${siteUrl}/resources/guides/${contentEntrySlug(e)}`,
      }),
    ),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss(buildRssFeedOptions(siteConfig, items));
}

