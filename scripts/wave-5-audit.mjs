/**
 * Wave 5 screenshot + axe audit script.
 * Run with: node scripts/wave-5-audit.mjs
 */
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const auditDir = resolve(__dirname, "../apps/web/e2e/audit");

const BASE = "http://localhost:3030";

const pages = [
  {
    path: "/privacy/",
    screenshot: "wave-5-privacy-desktop.png",
    axe: true,
  },
  {
    path: "/this-page-does-not-exist-404/",
    screenshot: "wave-5-404-desktop.png",
    axe: true,
  },
];

await mkdir(auditDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});

let allViolations = 0;

for (const page of pages) {
  const p = await context.newPage();
  console.log(`Navigating to ${BASE}${page.path}…`);

  await p.goto(`${BASE}${page.path}`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  const screenshotPath = resolve(auditDir, page.screenshot);
  await p.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  Screenshot saved: ${screenshotPath}`);

  if (page.axe) {
    const results = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "best-practice"])
      .analyze();

    const violations = results.violations;
    if (violations.length === 0) {
      console.log(`  Axe: 0 violations ✓`);
    } else {
      console.error(`  Axe: ${violations.length} violations found`);
      for (const v of violations) {
        console.error(`    [${v.impact}] ${v.id}: ${v.description}`);
        for (const node of v.nodes) {
          console.error(`      Target: ${node.target.join(", ")}`);
        }
      }
      allViolations += violations.length;
    }
  }

  await p.close();
}

await browser.close();

if (allViolations > 0) {
  console.error(`\nAudit FAILED — ${allViolations} total axe violations.`);
  process.exit(1);
} else {
  console.log(`\nAudit PASSED — screenshots captured, 0 axe violations.`);
}
