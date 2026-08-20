import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import sentry from "@sentry/astro";
import tailwindcss from "@tailwindcss/vite";
import { indexNowIntegration } from "@kaiplan/marketing/lib/indexnow-integration";
import { sitemapDatesIntegration } from "@kaiplan/marketing/lib/sitemap-dates-integration";
import { createSitemapSerializer } from "@kaiplan/marketing/lib/sitemap-utils";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { buildSitemapConfigOptions } from "./src/lib/sitemap-config";
import { rehypeCanonicalInternalLinks } from "./src/lib/rehype-canonical-internal-links";
import { resolveTurnstileSiteKey } from "./src/lib/turnstile-build-key";
import { parseJsonc } from "../../scripts/lib/cloudflare-web-config";

const localSentryAlias =
  process.env.LOCAL_MARKETING_API_STUB_SENTRY === "true"
    ? {
        "@sentry/cloudflare": fileURLToPath(
          new URL("./src/lib/local-sentry-cloudflare.ts", import.meta.url),
        ),
      }
    : undefined;

// The public Turnstile site key must be baked into the client bundle at build
// time. import.meta.env.PUBLIC_* is not populated from .env in this Cloudflare
// SSR setup, so we statically replace it via vite.define using the committed
// wrangler.jsonc value (overridable by a build-time process.env var).
const wranglerConfig = parseJsonc(
  readFileSync(
    fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)),
    "utf8",
  ),
);
const turnstileSiteKey = resolveTurnstileSiteKey(
  process.env.PUBLIC_TURNSTILE_SITE_KEY,
  wranglerConfig?.vars?.PUBLIC_TURNSTILE_SITE_KEY,
);

const sentryDsn = process.env.PUBLIC_SENTRY_DSN?.trim();
const sitemapConfigOptions = buildSitemapConfigOptions("https://kaiplan.app");
const { lastmodDates, ...sitemapOptions } = sitemapConfigOptions;
const sentryIntegration = sentryDsn
  ? sentry({
      dsn: sentryDsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? "production",
      release: process.env.SENTRY_RELEASE,
      sendDefaultPii: false,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_WEB_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      sourcemaps: {
        filesToDeleteAfterUpload: ["dist/**/*.map"],
      },
    })
  : undefined;

export default defineConfig({
  site: "https://kaiplan.app",
  output: "server",
  trailingSlash: "always",
  adapter: cloudflare({
    prerenderEnvironment: "node",
  }),
  markdown: {
    rehypePlugins: [rehypeCanonicalInternalLinks],
  },
  integrations: [
    react(),
    ...(sentryIntegration ? [sentryIntegration] : []),
    sitemap({
      ...sitemapOptions,
      serialize: createSitemapSerializer(lastmodDates),
    }),
    indexNowIntegration(),
    sitemapDatesIntegration(),
  ],
  server: {
    host: true,
    port: Number(process.env.PORT) || 4321,
  },
  vite: {
    plugins: [tailwindcss()],
    define: {
      "import.meta.env.PUBLIC_TURNSTILE_SITE_KEY":
        JSON.stringify(turnstileSiteKey),
    },
    resolve: {
      alias: localSentryAlias,
      dedupe: ["react", "react-dom"],
    },
    ssr: {
      noExternal: [
        "@kaiplan/marketing",
        "@kaiplan/marketing-api",
        "@sentry/cloudflare",
      ],
    },
    optimizeDeps: {
      exclude: ["@kaiplan/marketing-api", "@sentry/cloudflare"],
    },
    build: {
      sourcemap: "hidden",
      rollupOptions: {
        external: ["/pagefind/pagefind.js"],
      },
    },
  },
});
