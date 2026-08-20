import { canonicalizeInternalHref } from "@kaiplan/marketing/lib/meta";

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function visit(node: HastNode): void {
  if (
    node.type === "element" &&
    (node.tagName === "a" || node.tagName === "area") &&
    typeof node.properties?.href === "string"
  ) {
    node.properties.href = canonicalizeInternalHref(node.properties.href);
  }

  for (const child of node.children ?? []) {
    visit(child);
  }
}

export function rehypeCanonicalInternalLinks() {
  return (tree: HastNode) => {
    visit(tree);
  };
}

export { canonicalizeInternalHref };
