import type { SiteConfig, FaqItem } from "@kaiplan/marketing";
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  mergeFaqSources,
} from "@kaiplan/marketing/lib/schema-builders";
import { buildGraph, withId } from "@kaiplan/marketing/lib/schema-graph";
import {
  ensureTrailingSlash,
  resolveSchemaImage,
} from "@kaiplan/marketing/lib/meta";

type AnswerItem = {
  q?: string;
  a?: string;
  question?: string;
  answer?: string;
};

export function buildEditorialSchemaGraph(opts: {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  canonicalPath: string;
  config: SiteConfig;
  answers?: AnswerItem[];
  faqs?: FaqItem[];
  breadcrumbs?: { label: string; href: string }[];
  ogImage?: string;
}): Record<string, unknown> {
  const canonicalUrl = ensureTrailingSlash(
    `https://${opts.config.domain}${opts.canonicalPath}`,
  );
  const articleSchema = buildArticleSchema({
    headline: opts.title,
    description: opts.description,
    datePublished: opts.publishedAt,
    dateModified: opts.updatedAt,
    lastReviewed: opts.updatedAt,
    publisher: { "@id": `https://${opts.config.domain}/#organization` },
    author: opts.config.author,
    image: resolveSchemaImage(
      opts.config.domain,
      opts.ogImage,
      opts.config.defaultOgImage,
    ),
    mainEntityOfPage: canonicalUrl,
    speakableCssSelectors: [
      ".bluf-block",
      ".faq-answer",
      ".answer-block-answer",
    ],
  });
  const answers =
    opts.answers?.map((answer) => ({
      question: answer.q ?? answer.question ?? "",
      answer: answer.a ?? answer.answer ?? "",
    })) ?? [];
  const faqSchema = mergeFaqSources(opts.faqs ?? [], answers);
  const breadcrumbSchema =
    opts.breadcrumbs && opts.breadcrumbs.length > 0
      ? buildBreadcrumbSchema(opts.breadcrumbs, `https://${opts.config.domain}`)
      : undefined;

  return buildGraph([
    withId(articleSchema, `${canonicalUrl}#article`),
    ...(breadcrumbSchema ? [breadcrumbSchema] : []),
    ...(faqSchema ? [faqSchema] : []),
  ]);
}
