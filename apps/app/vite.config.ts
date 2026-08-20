import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const remoteFontTags = [
  /^\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>\r?\n/m,
  /^\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>\r?\n/m,
  /^\s*<link\s+href="https:\/\/fonts\.googleapis\.com\/css2\?family=Instrument\+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist\+Mono:wght@400;500;700&display=swap"\s+rel="stylesheet"\s+\/>\r?\n/m,
];

const sentryPlugin =
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_APP_PROJECT
    ? sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_APP_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: {
          name: process.env.SENTRY_RELEASE,
        },
        sourcemaps: {
          filesToDeleteAfterUpload: ["dist/**/*.map"],
        },
        telemetry: false,
      })
    : [];

export default defineConfig({
  plugins: [
    {
      name: "kaiplan-disable-remote-fonts",
      transformIndexHtml(html) {
        if (process.env.VITE_DISABLE_REMOTE_FONTS !== "true") {
          return html;
        }

        return remoteFontTags.reduce(
          (updatedHtml, pattern) => updatedHtml.replace(pattern, ""),
          html,
        );
      },
    },
    tanstackRouter(),
    react(),
    tailwindcss(),
    ...sentryPlugin,
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: Number(process.env.PORT ?? "3000"),
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: "hidden",
  },
});
