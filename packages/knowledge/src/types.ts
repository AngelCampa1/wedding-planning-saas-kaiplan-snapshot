export type KnowledgeAudience = "public" | "authenticated";

export type KnowledgeConsumer =
  | "marketing-pages"
  | "marketing-email"
  | "marketing-infra"
  | "app-help"
  | "app-ui"
  | "marketing-automation"
  | "app-support";

export interface KnowledgeMeta {
  id: string;
  domain: "marketing" | "app";
  audience: KnowledgeAudience;
  consumers: KnowledgeConsumer[];
  source: "canonical-kb";
}

export interface FaqKnowledgeEntry extends KnowledgeMeta {
  question: string;
  answer: string;
}

export interface CtaKnowledgeEntry extends KnowledgeMeta {
  text: string;
  target: string;
  message?: string;
}

export interface CompetitorKnowledgeEntry extends KnowledgeMeta {
  slug: string;
  name: string;
  pricing: string;
  weakness: string;
}

export interface ProductFactKnowledgeEntry extends KnowledgeMeta {
  label: string;
  value: string;
}

export interface HelpSurfaceKnowledgeEntry extends KnowledgeMeta {
  route: string;
  label: string;
  description: string;
}

export interface LeadMagnetKnowledgeEntry extends KnowledgeMeta {
  slug: string;
  title: string;
  description: string;
  publicPath: string;
  nurtureSequenceId: string;
}

export type KnowledgeTextBlock =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "divider" };

export interface NurtureStepKnowledgeEntry extends KnowledgeMeta {
  sequenceId: string;
  stepIndex: 1 | 2 | 3 | 4;
  subject: string;
  headline: string;
  intro: string;
  blocks: KnowledgeTextBlock[];
  primaryCtaLabel: string;
  secondaryCtaLabel?: string;
  postScript: string;
}
