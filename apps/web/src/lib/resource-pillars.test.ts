import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getContentRouteInventory } from "./content-route-inventory";
import {
  assertCompletePillarCoverage,
  getPillarResources,
  getPillarsForHref,
  getPrimaryPillarForHref,
  getResourcePillarBySlug,
  getResourcePillars,
  normalizeHref,
  type PillarResourceItem,
} from "./resource-pillars";

const contentDir = resolve("src/content");

describe("resource pillars", () => {
  it("assigns every indexable content route to at least one pillar", () => {
    const inventory = getContentRouteInventory(contentDir);

    expect(() => assertCompletePillarCoverage(inventory)).not.toThrow();

    const missing = Array.from(inventory.indexablePaths).filter(
      (href) => getPillarsForHref(href).length === 0,
    );

    expect(missing).toEqual([]);
  });

  it("keeps every pillar populated by known indexable content", () => {
    const inventory = getContentRouteInventory(contentDir);
    const resources: PillarResourceItem[] = Array.from(
      inventory.indexablePaths,
      (href) => ({
        href,
        title: href,
        type: "Test",
      }),
    );

    for (const pillar of getResourcePillars()) {
      const pillarResources = getPillarResources(pillar.slug, resources);

      expect(pillarResources.length, pillar.slug).toBeGreaterThan(0);
      expect(
        pillarResources.every((resource) =>
          inventory.indexablePaths.has(normalizeHref(resource.href)),
        ),
      ).toBe(true);
    }
  });

  it("uses stable public hub routes for every pillar", () => {
    expect(getResourcePillars().map((pillar) => pillar.href)).toEqual([
      "/resources/wedding-budget/",
      "/resources/wedding-costs/",
      "/resources/wedding-vendors/",
      "/resources/guest-list-rsvp-seating/",
      "/resources/timeline-checklist/",
      "/resources/wedding-websites-registry/",
      "/resources/wedding-planning-tools/",
    ]);
  });

  it("looks up pillars and primary pillar backlinks by href", () => {
    expect(getResourcePillarBySlug("wedding-budget")?.href).toBe(
      "/resources/wedding-budget/",
    );
    expect(getResourcePillarBySlug("unknown")).toBeUndefined();
    expect(
      getPrimaryPillarForHref("/resources/best/best-wedding-budget-apps").slug,
    ).toBe("wedding-budget");
  });

  it("falls back only for non-content href lookups", () => {
    expect(getPillarsForHref("/unclassified/path")).toEqual([
      "wedding-planning-tools",
    ]);
    expect(normalizeHref("/resources")).toBe("/resources/");
    expect(normalizeHref("/")).toBe("/");
  });

  it("throws when an indexable content route has no taxonomy match", () => {
    expect(() =>
      assertCompletePillarCoverage({
        allPaths: new Set(["/resources/guides/unclassified-slug/"]),
        indexablePaths: new Set(["/resources/guides/unclassified-slug/"]),
        noindexPaths: new Set(),
        updatedAtByPath: new Map(),
        totalCountsByCollection: new Map(),
        indexableCountsByCollection: new Map(),
      }),
    ).toThrow("Missing resource pillar assignments");
  });
});
