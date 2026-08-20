import type { AstroIntegration } from "astro";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  parseSitemapIndex,
  parseSitemap,
  buildIndexNowPayload,
  submitToIndexNow,
} from "./indexnow.js";

interface IndexNowIntegrationOptions {
  enabled?: boolean;
}

export function isIndexNowEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.INDEXNOW_ENABLED === "true") {
    return true;
  }

  return env.CF_PAGES === "1" && env.CF_PAGES_BRANCH === "master";
}

export function indexNowIntegration(
  options: IndexNowIntegrationOptions = {},
): AstroIntegration {
  return {
    name: "@validation/indexnow",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const enabled = options.enabled ?? isIndexNowEnabled();
        if (!enabled) {
          logger.info(
            "IndexNow: skipping submission because INDEXNOW_ENABLED is not true",
          );
          return;
        }

        // dir is a URL pointing to the build output directory
        const distPath = fileURLToPath(dir);

        // 1. Read sitemap-index.xml
        const sitemapIndexPath = join(distPath, "sitemap-index.xml");
        let sitemapIndexXml: string;
        try {
          sitemapIndexXml = readFileSync(sitemapIndexPath, "utf-8");
        } catch {
          logger.warn(
            "IndexNow: no sitemap-index.xml found, skipping submission",
          );
          return;
        }

        // 2. Parse child sitemap URLs
        const childSitemapUrls = parseSitemapIndex(sitemapIndexXml);
        if (childSitemapUrls.length === 0) {
          logger.warn("IndexNow: no sitemaps found in sitemap-index.xml");
          return;
        }

        // 3. Extract host from the first sitemap URL
        // e.g. "https://crewroute.app/sitemap-0.xml" → "crewroute.app"
        // Length was already confirmed > 0 by the check above.
        const firstUrl = new URL(childSitemapUrls[0]!);
        const host = firstUrl.hostname;

        // 4. Collect all page URLs from child sitemaps
        const allUrls: string[] = [];
        for (const childUrl of childSitemapUrls) {
          // Sitemap URL: "https://crewroute.app/sitemap-0.xml"
          // Local file: join(distPath, "sitemap-0.xml")
          const sitemapFilename = new URL(childUrl).pathname.replace(/^\//, "");
          const sitemapPath = join(distPath, sitemapFilename);
          try {
            const xml = readFileSync(sitemapPath, "utf-8");
            allUrls.push(...parseSitemap(xml));
          } catch {
            logger.warn(`IndexNow: could not read ${sitemapPath}`);
          }
        }

        if (allUrls.length === 0) {
          logger.warn("IndexNow: no URLs found in sitemaps");
          return;
        }

        // 5. Submit to IndexNow
        logger.info(`IndexNow: submitting ${allUrls.length} URLs for ${host}`);
        const payload = buildIndexNowPayload(host, allUrls);
        const result = await submitToIndexNow(payload);

        if (result.success) {
          logger.info(`IndexNow: submitted successfully (${result.status})`);
        } else {
          logger.warn(
            `IndexNow: submission failed (${result.status}: ${result.message})`,
          );
        }
      },
    },
  };
}
