import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/config/site";

const mocks = vi.hoisted(() => {
  const getCollectionMock = vi.fn();
  const contentItemToRssItemMock = vi.fn(
    ({
      title,
      description,
      publishedAt,
      link,
    }: {
      title: string;
      description: string;
      publishedAt: string;
      link: string;
    }) => ({
      title,
      description,
      link,
      pubDate: new Date(publishedAt),
    }),
  );
  const buildRssFeedOptionsMock = vi.fn((config, items) => ({
    config,
    items,
  }));
  const rssMock = vi.fn(
    (options) =>
      new Response(JSON.stringify(options), {
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      }),
  );

  return {
    getCollectionMock,
    contentItemToRssItemMock,
    buildRssFeedOptionsMock,
    rssMock,
  };
});

vi.mock("astro:content", () => ({
  getCollection: mocks.getCollectionMock,
}));

vi.mock("@astrojs/rss", () => ({
  default: mocks.rssMock,
}));

vi.mock("@kaiplan/marketing/lib/rss-utils", () => ({
  buildRssFeedOptions: mocks.buildRssFeedOptionsMock,
  contentItemToRssItem: mocks.contentItemToRssItemMock,
}));

import { GET } from "./rss.xml";

function makeEntry(
  title: string,
  description: string,
  publishedAt: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id: title.toLowerCase().replace(/\s+/g, "-"),
    data: {
      title,
      description,
      publishedAt,
      noindex: false,
      ...extra,
    },
  };
}

describe("rss.xml route", () => {
  beforeEach(() => {
    mocks.contentItemToRssItemMock.mockClear();
    mocks.buildRssFeedOptionsMock.mockClear();
    mocks.rssMock.mockClear();
    mocks.getCollectionMock.mockReset();
    mocks.getCollectionMock.mockImplementation(async (name: string) => {
      const collections: Record<string, unknown[]> = {
        alternatives: [
          makeEntry("The Knot Alternative", "Alt", "2026-01-01", {
            competitor: { slug: "the-knot" },
          }),
        ],
        comparisons: [
          makeEntry("The Knot vs WeddingWire", "Compare", "2026-01-03"),
        ],
        "pricing-breakdowns": [
          makeEntry("Kaiplan Pricing", "Pricing", "2026-01-02"),
        ],
        listicles: [makeEntry("Best Wedding Apps", "Listicle", "2026-01-04")],
        guides: [
          makeEntry("Wedding Planning Checklist", "Guide", "2026-01-05"),
        ],
      };

      return collections[name] ?? [];
    });
  });

  it("builds the feed from all content collections and sorts newest first", async () => {
    const response = await GET({} as never);
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe(
      "text/xml; charset=utf-8",
    );
    expect(mocks.contentItemToRssItemMock).toHaveBeenCalledTimes(5);
    expect(mocks.buildRssFeedOptionsMock).toHaveBeenCalledWith(
      siteConfig,
      expect.any(Array),
    );
    expect(
      mocks.buildRssFeedOptionsMock.mock.calls[0][1].map(
        (item: { title: string }) => item.title,
      ),
    ).toEqual([
      "Wedding Planning Checklist",
      "Best Wedding Apps",
      "The Knot vs WeddingWire",
      "Kaiplan Pricing",
      "The Knot Alternative",
    ]);
    expect(body).toContain("Wedding Planning Checklist");
    expect(mocks.rssMock).toHaveBeenCalledTimes(1);
  });
});
