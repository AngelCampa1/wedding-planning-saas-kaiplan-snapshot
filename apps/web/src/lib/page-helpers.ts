import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildHowToSchema,
  mergeFaqSources,
} from "@kaiplan/marketing/lib/schema-builders";
import { buildGraph, withId } from "@kaiplan/marketing/lib/schema-graph";
import { resolveSchemaImage } from "@kaiplan/marketing/lib/meta";
import type { PersonSchemaOpts } from "@kaiplan/marketing/lib/schema-types";
import {
  resolveRelatedPageLinks,
  type ContentMap,
  type ResolvedPageLink,
} from "@kaiplan/marketing/lib/related-page-resolver";
import type { FaqItem } from "@kaiplan/marketing";
import type { CollectionEntry } from "astro:content";
import { contentEntrySlug } from "@/lib/content-entry";

type ContentEntry = { title: string; description: string };
type AnswerEntry = {
  q?: string;
  a?: string;
  question?: string;
  answer?: string;
};
type EntrySeoInput = {
  noindex?: boolean;
  answers?: AnswerEntry[];
  faqs?: FaqItem[];
};
type LeadMagnetSchemaGraphInput = {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  canonicalUrl: string;
  siteDomain: string;
  defaultOgImage: string;
  ogImage?: string;
  author?: PersonSchemaOpts;
  answers?: AnswerEntry[];
  faqs?: FaqItem[];
};

export function buildContentMap(collections: {
  alternatives: CollectionEntry<"alternatives">[];
  comparisons: CollectionEntry<"comparisons">[];
  pricingBreakdowns: CollectionEntry<"pricing-breakdowns">[];
  listicles: CollectionEntry<"listicles">[];
  guides: CollectionEntry<"guides">[];
  leadMagnets: CollectionEntry<"lead-magnets">[];
}): Map<string, ContentEntry> {
  const map = new Map<string, ContentEntry>();

  for (const entry of collections.alternatives) {
    if (entry.data.noindex === true) continue;
    map.set(`/compare/alternatives/${entry.data.competitor.slug}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.comparisons) {
    if (entry.data.noindex === true) continue;
    map.set(`/compare/versus/${contentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.pricingBreakdowns) {
    if (entry.data.noindex === true) continue;
    map.set(`/compare/pricing/${contentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.listicles) {
    if (entry.data.noindex === true) continue;
    map.set(`/resources/best/${contentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.guides) {
    if (entry.data.noindex === true) continue;
    map.set(`/resources/guides/${contentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  for (const entry of collections.leadMagnets) {
    if (entry.data.noindex === true) continue;
    map.set(`/free/${contentEntrySlug(entry)}`, {
      title: entry.data.title,
      description: entry.data.description,
    });
  }

  return map;
}

export function buildEntrySeoProps({
  noindex = false,
  answers = [],
  faqs = [],
}: EntrySeoInput): {
  noindex: boolean;
  answers: { question: string; answer: string }[];
  faqs: FaqItem[];
} {
  return {
    noindex,
    answers: answers.map((answer) => ({
      question: answer.q ?? answer.question ?? "",
      answer: answer.a ?? answer.answer ?? "",
    })),
    faqs,
  };
}

export function buildLeadMagnetSchemaGraph({
  title,
  description,
  publishedAt,
  updatedAt,
  canonicalUrl,
  siteDomain,
  defaultOgImage,
  ogImage,
  author,
  answers = [],
  faqs = [],
}: LeadMagnetSchemaGraphInput): Record<string, unknown> {
  const seoProps = buildEntrySeoProps({ answers, faqs });
  const articleSchema = buildArticleSchema({
    headline: title,
    description,
    datePublished: publishedAt,
    dateModified: updatedAt,
    lastReviewed: updatedAt,
    publisher: { "@id": `https://${siteDomain}/#organization` },
    author,
    image: resolveSchemaImage(siteDomain, ogImage, defaultOgImage),
    mainEntityOfPage: canonicalUrl,
    speakableCssSelectors: [
      ".bluf-block",
      ".faq-answer",
      ".answer-block-answer",
    ],
  });
  const faqSchema = mergeFaqSources(seoProps.faqs, seoProps.answers);
  const path = new URL(canonicalUrl).pathname;
  const breadcrumbSchema = buildBreadcrumbSchema(
    [
      { label: "Home", href: "/" },
      { label: title, href: path },
    ],
    `https://${siteDomain}`,
  );

  return buildGraph([
    withId(articleSchema, `${canonicalUrl}#article`),
    breadcrumbSchema,
    ...(faqSchema ? [faqSchema] : []),
  ]);
}

export function resolveIndexableRelatedPageLinks(
  hrefs: string[],
  contentMap: ContentMap,
): ResolvedPageLink[] {
  return resolveRelatedPageLinks(
    hrefs.filter((href) => contentMap.has(href)),
    contentMap,
  );
}

export function padToolIndex(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function buildOptionalHowToSchema(
  steps: { title: string; content: string }[] | undefined,
  name: string,
  description: string,
): Record<string, unknown> | null {
  if (!steps || steps.length === 0) return null;
  return buildHowToSchema({ name, description, steps });
}

export function alternativeUrl(slug: string): string {
  return buildCanonicalRoute("/compare/alternatives", slug);
}

export function comparisonUrl(slug: string): string {
  return buildCanonicalRoute("/compare/versus", slug);
}

export function pricingUrl(slug: string): string {
  return buildCanonicalRoute("/compare/pricing", slug);
}

export function listicleUrl(slug: string): string {
  return buildCanonicalRoute("/resources/best", slug);
}

export function guideUrl(slug: string): string {
  return buildCanonicalRoute("/resources/guides", slug);
}

export function paginatedUrl(base: string, page: number): string {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  if (page <= 1) return `${normalizedBase}/`;
  return `${normalizedBase}/${page}/`;
}

function buildCanonicalRoute(base: string, slug: string): string {
  return slug === "" ? `${base}/` : `${base}/${slug}/`;
}
