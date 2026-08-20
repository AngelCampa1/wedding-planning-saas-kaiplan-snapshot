import { appHelpKnowledgeBundle, marketingKnowledgeBundle } from "./bundles";

export const SECRET_LIKE_KNOWLEDGE_PATTERNS = [
  /\uFFFD/,
  /\u00ef/,
  /\u00c3/,
  /\u00e2/,
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/,
  /\b(?:secrets?|api[_ -]?keys?|private[_ -]?keys?|bearer|tokens?)\b/i,
  /\bpassword\s*[:=]/i,
  /\b(?:invite|auth)[_ -]?tokens?\b/i,
  /\b(?:customer|guest|vendor|payment)(?:'s)?[_ -]?(?:email|phone|address|id)s?\b/i,
  /\b(?:customer|guest|vendor|payment)\s+(?:email\s+address|contact\s+(?:info|details)|payment\s+id)s?\b/i,
  /\b(?:docs|scripts|apps|packages)\/[^\s]+/i,
  /\b(?:internal strategy|roadmap|backlog|not for public|confidential)\b/i,
  /\b[a-z]+(?:\.[a-z]+)+@kaiplan\.app\b/i,
] as const;

export function collectKnowledgeText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectKnowledgeText(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => [
      key,
      ...collectKnowledgeText(item),
    ]);
  }

  return [];
}

export function findUnsafeKnowledgeStrings(value: unknown): string[] {
  return collectKnowledgeText(value).filter((text) =>
    SECRET_LIKE_KNOWLEDGE_PATTERNS.some((pattern) => pattern.test(text)),
  );
}

export function getAllKnowledgeBundles() {
  return [marketingKnowledgeBundle, appHelpKnowledgeBundle] as const;
}
