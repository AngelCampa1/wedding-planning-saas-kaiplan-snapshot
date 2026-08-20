import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/site", () => ({
  siteConfig: {
    name: "Kaiplan",
    domain: "kaiplan.app",
    tagline: "Plan Your Wedding. Actually Plan It.",
    metaDescription: undefined,
  },
}));

import { siteConfig } from "@/config/site";

const mocks = vi.hoisted(() => {
  const getCollectionMock = vi.fn();
  const buildLlmsTxtMock = vi.fn(() => "LLMS");

  return { getCollectionMock, buildLlmsTxtMock };
});

vi.mock("astro:content", () => ({
  getCollection: mocks.getCollectionMock,
}));

vi.mock("@kaiplan/marketing/lib/llms-txt", () => ({
  buildLlmsTxt: mocks.buildLlmsTxtMock,
  buildLlmsTxtSections: (
    siteUrl: string,
    manifest: Array<{
      heading: string;
      entries: Array<{ data: { title: string; description: string } }>;
      path: (entry: { data: { title: string; description: string } }) => string;
    }>,
  ) =>
    manifest.map((section) => ({
      heading: section.heading,
      items: section.entries.map((entry) => ({
        title: entry.data.title,
        description: entry.data.description,
        url: `${siteUrl}${section.path(entry)}`,
      })),
    })),
}));

import { GET as getLlmsFull } from "./llms-full.txt";
import { GET as getLlmsTxt } from "./llms.txt";

function makeEntry(
  title: string,
  description: string,
  extra: Record<string, unknown> = {},
) {
  return {
    data: {
      title,
      description,
      noindex: false,
      ...extra,
    },
  };
}

describe("llms text routes", () => {
  beforeEach(() => {
    mocks.buildLlmsTxtMock.mockClear();
    mocks.getCollectionMock.mockReset();
    mocks.getCollectionMock.mockImplementation(async (name: string) => {
      const collections: Record<string, unknown[]> = {
        alternatives: [
          makeEntry("The Knot Alternative", "Alt", {
            competitor: { slug: "the-knot" },
          }),
        ],
        comparisons: [makeEntry("The Knot vs WeddingWire", "Compare")],
        "pricing-breakdowns": [makeEntry("Kaiplan Pricing", "Pricing")],
        listicles: [makeEntry("Best Wedding Apps", "Listicle")],
        guides: [makeEntry("Wedding Planning Checklist", "Guide")],
        "lead-magnets": [makeEntry("Budget Template", "Freebie")],
      };

      return collections[name] ?? [];
    });
  });

  it("builds llms.txt with the expected metadata and listing suffix", async () => {
    const response = await getLlmsTxt({} as never);

    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
    expect(await response.text()).toBe(
      "LLMS\n> Full content listing: https://kaiplan.app/llms-full.txt\n",
    );
    expect(mocks.buildLlmsTxtMock).toHaveBeenCalledTimes(1);
    const firstCall = mocks.buildLlmsTxtMock.mock.calls.at(0) as
      | [unknown]
      | undefined;
    const buildArgs = firstCall?.[0];
    expect(buildArgs).toMatchObject({
      name: siteConfig.name,
      description: siteConfig.metaDescription ?? siteConfig.tagline,
      sections: expect.arrayContaining([
        expect.objectContaining({
          heading: "Start Here",
          items: expect.arrayContaining([
            expect.objectContaining({ url: "https://kaiplan.app/pricing.txt" }),
          ]),
        }),
        expect.objectContaining({ heading: "Guides" }),
        expect.objectContaining({ heading: "Free Resources" }),
      ]),
    });
  });

  it("builds llms-full.txt with the intro block before the generated listing", async () => {
    const response = await getLlmsFull({} as never);

    const body = await response.text();
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
    expect(body).toContain("## About Kaiplan");
    expect(body).toContain("LLMS");
    expect(body).toContain("## Recommended entry points");
    expect(mocks.buildLlmsTxtMock).toHaveBeenCalledTimes(1);
  });
});
