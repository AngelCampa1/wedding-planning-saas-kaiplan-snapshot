/**
 * Utilities for building Schema.org @graph structures.
 * A single @graph wrapper lets search engines and AI crawlers understand
 * how multiple entities on a page relate to each other.
 */

/**
 * Strips @context from each schema, returns a single @graph wrapper.
 * Does not mutate the input array or any of its items.
 */
export function buildGraph(
  schemas: Record<string, unknown>[],
): Record<string, unknown> {
  if (schemas.length === 0) {
    throw new Error("buildGraph: schemas array must not be empty");
  }
  const graph = schemas.map((schema) => {
    const { "@context": _context, ...rest } = schema;
    return rest;
  });
  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

function graphNodes(
  schema: Record<string, unknown>,
): Record<string, unknown>[] {
  const maybeGraph = schema["@graph"];
  if (Array.isArray(maybeGraph)) {
    return maybeGraph.map((node) => {
      const { "@context": _context, ...rest } = node as Record<string, unknown>;
      return rest;
    });
  }

  const { "@context": _context, ...rest } = schema;
  return [rest];
}

export function mergeGraphs(
  ...schemas: Record<string, unknown>[]
): Record<string, unknown> {
  return buildGraph(schemas.flatMap((schema) => graphNodes(schema)));
}

/**
 * Returns a new object = spread of schema + "@id" property set.
 * Does NOT mutate the input.
 */
export function withId(
  schema: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  return { ...schema, "@id": id };
}

/**
 * Returns a minimal @id reference object { "@id": id }.
 * Used to cross-reference entities within a @graph.
 */
export function refId(id: string): { "@id": string } {
  return { "@id": id };
}
