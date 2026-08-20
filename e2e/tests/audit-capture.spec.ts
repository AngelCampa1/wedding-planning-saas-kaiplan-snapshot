import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";
import { bootstrapPlannerSession } from "../helpers/planner-auth";
import {
  PUBLIC_WEB_SURFACES,
  SPA_PUBLIC_SURFACES,
  SPA_AUTHED_SURFACES,
  PUBLIC_WEDDING_SURFACES,
  VIEWPORTS,
  type Surface,
} from "../audit/manifest";

const runtime = readLocalE2ERuntime();
const OUT_ROOT = path.resolve(process.cwd(), "docs/audit");

type CaptureResult = {
  slug: string;
  viewport: string;
  url: string;
  status: "ok" | "error" | "skipped";
  loadError?: string;
  axeViolations: Array<{
    id: string;
    impact: string | null;
    nodes: number;
    help: string;
    helpUrl: string;
  }>;
  consoleErrors: string[];
};

async function capture(
  page: Page,
  surface: Surface,
  viewport: { name: string; width: number; height: number },
  ctx: { webBase: string; appBase: string; weddingSlug: string },
): Promise<CaptureResult> {
  const url = surface.url(ctx);
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  let loadError: string | undefined;
  try {
    const resp = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 20_000,
    });
    if (resp && resp.status() >= 500) {
      loadError = `HTTP ${resp.status()}`;
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  // Allow late renders + animations to settle
  await page.waitForTimeout(500);

  const screenshotDir = path.join(OUT_ROOT, "screenshots", viewport.name);
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, `${surface.slug}.png`);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (err) {
    if (!loadError)
      loadError = `screenshot failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  let axeViolations: CaptureResult["axeViolations"] = [];
  if (!loadError) {
    try {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      axeViolations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? null,
        nodes: v.nodes.length,
        help: v.help,
        helpUrl: v.helpUrl,
      }));

      const axeDir = path.join(OUT_ROOT, "axe", viewport.name);
      fs.mkdirSync(axeDir, { recursive: true });
      fs.writeFileSync(
        path.join(axeDir, `${surface.slug}.json`),
        JSON.stringify(results.violations, null, 2),
      );
    } catch (err) {
      // axe can fail if page never settles; capture and continue
      consoleErrors.push(
        `axe failure: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    slug: surface.slug,
    viewport: viewport.name,
    url,
    status: loadError ? "error" : "ok",
    loadError,
    axeViolations,
    consoleErrors,
  };
}

const results: CaptureResult[] = [];

test.describe.configure({ mode: "serial" });

test.afterAll(() => {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_ROOT, "capture-results.json"),
    JSON.stringify(results, null, 2),
  );
});

test("audit: capture all surfaces", async ({ browser }) => {
  test.setTimeout(900_000); // up to 15 min for the full sweep

  const ctxWeb = runtime.urls.web.replace(/\/$/, "");
  const ctxApp = runtime.urls.app.replace(/\/$/, "");

  // Bootstrap an authed planner; reuse for authed routes + wedding slug
  const bootstrapContext = await browser.newContext();
  const bootstrapPage = await bootstrapContext.newPage();
  const session = await bootstrapPlannerSession(bootstrapPage);

  // Try to derive a published-wedding slug from the planner; fall back to a placeholder
  let weddingSlug = "preview";
  try {
    const lookup = await bootstrapPage.request.get(
      `${runtime.urls.api}/api/weddings/${session.wedding.id}/website`,
    );
    if (lookup.ok()) {
      const json = await lookup.json();
      if (
        typeof json.publishedSlug === "string" &&
        json.publishedSlug.length > 0
      ) {
        weddingSlug = json.publishedSlug;
      } else if (typeof json.slug === "string" && json.slug.length > 0) {
        weddingSlug = json.slug;
      }
    }
  } catch {
    // fallback already set
  }
  await bootstrapContext.close();

  const captureCtx = { webBase: ctxWeb, appBase: ctxApp, weddingSlug };

  // Pass 1: anonymous surfaces (no auth cookies)
  for (const viewport of VIEWPORTS) {
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    for (const surface of [
      ...PUBLIC_WEB_SURFACES,
      ...SPA_PUBLIC_SURFACES,
      ...PUBLIC_WEDDING_SURFACES,
    ]) {
      const result = await capture(anonPage, surface, viewport, captureCtx);
      results.push(result);
      console.log(
        `[${viewport.name}] ${result.status} ${result.slug} (${result.axeViolations.length} a11y issues)`,
      );
    }
    await anonContext.close();
  }

  // Pass 2: authed surfaces (fresh planner session per viewport for clean state)
  for (const viewport of VIEWPORTS) {
    const authContext = await browser.newContext();
    const authPage = await authContext.newPage();
    const authSession = await bootstrapPlannerSession(authPage);
    void authSession;
    for (const surface of SPA_AUTHED_SURFACES) {
      const result = await capture(authPage, surface, viewport, captureCtx);
      results.push(result);
      console.log(
        `[${viewport.name}/auth] ${result.status} ${result.slug} (${result.axeViolations.length} a11y issues)`,
      );
    }
    await authContext.close();
  }

  expect(results.length).toBeGreaterThan(0);
});
