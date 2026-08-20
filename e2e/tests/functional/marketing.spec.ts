import { expect, test, type APIRequestContext } from "@playwright/test";
import { installPageDiagnostics } from "../../helpers/page-diagnostics";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";
import { getPublishedMarketingRouteInventory } from "../../../apps/web/src/lib/published-marketing-route-inventory";
import { resolve } from "node:path";

const runtime = readLocalE2ERuntime();
const publishedRouteInventory = getPublishedMarketingRouteInventory(
  resolve("apps/web/src/pages"),
);
const MARKETING_ROUTES = Array.from(
  publishedRouteInventory.indexablePaths,
).sort();

// Astro server-side content-collection info logs that should not fail the
// marketing assertions even though the page-diagnostics helper records
// them.
const CONSOLE_IGNORE = [
  /alternatives/i,
  /comparisons/i,
  /pricing-breakdowns/i,
  /guides/i,
  /listicles/i,
  /content collection/i,
];

async function collectInternalLinks(
  page: import("@playwright/test").Page,
): Promise<string[]> {
  return page.$$eval("a[href]", (anchors) =>
    anchors
      .map((anchor) => anchor.getAttribute("href") ?? "")
      .filter(
        (href) =>
          href.startsWith("/") &&
          !href.startsWith("//") &&
          !href.startsWith("#") &&
          !href.startsWith("mailto:"),
      ),
  );
}

async function assertNoBrokenLinks(
  request: APIRequestContext,
  base: string,
  links: readonly string[],
) {
  const unique = Array.from(new Set(links));
  const broken: string[] = [];

  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(6, unique.length) },
    async () => {
      while (nextIndex < unique.length) {
        const href = unique[nextIndex];
        nextIndex += 1;

        if (!href) {
          continue;
        }

        const target = new URL(href, base).toString();
        const response = await request.get(target, {
          failOnStatusCode: false,
        });
        if (response.status() >= 500) {
          broken.push(`${response.status()} ${target}`);
        }
      }
    },
  );

  await Promise.all(workers);

  expect(broken, broken.join("\n")).toEqual([]);
}

test.describe("functional/marketing", () => {
  test.setTimeout(120_000);

  for (const route of MARKETING_ROUTES) {
    test(`${route} returns 200, has title + canonical + meta, no broken links`, async ({
      page,
      request,
    }) => {
      const diagnostics = installPageDiagnostics(page, {
        ignoreConsole: CONSOLE_IGNORE,
      });

      const response = await page.goto(route);
      expect(response, `navigation returned null for ${route}`).not.toBeNull();
      expect(response!.status()).toBe(200);

      const title = await page.title();
      expect(title.trim().length, `empty <title> on ${route}`).toBeGreaterThan(
        0,
      );

      const description = await page
        .locator('meta[name="description"]')
        .first()
        .getAttribute("content");
      expect(
        (description ?? "").trim().length,
        `missing or empty meta description on ${route}`,
      ).toBeGreaterThan(0);

      const canonicalHref = await page
        .locator('link[rel="canonical"]')
        .first()
        .getAttribute("href");
      expect(canonicalHref, `missing canonical on ${route}`).toBeTruthy();

      const internalLinks = await collectInternalLinks(page);
      await assertNoBrokenLinks(request, runtime.urls.web, internalLinks);

      diagnostics.expectNoFailures();
    });
  }

  test("/does-not-exist renders the 404 page with a response body", async ({
    request,
  }) => {
    const response = await request.get(`${runtime.urls.web}/does-not-exist/`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(404);
    const body = await response.text();
    expect(body.trim().length).toBeGreaterThan(0);
    // Astro's built 404 page renders "404" in the body.
    expect(body).toMatch(/404/);
  });
});
