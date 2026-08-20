import {
  buildFooterTemplate,
  buildLeadMagnetHtml,
  type BrandConfig,
} from "./html-shell.js";
import { countPdfPages, hasPdfMagic } from "./pdf-utils.js";

export type { BrandConfig } from "./html-shell.js";
export { buildLeadMagnetHtml, buildFooterTemplate } from "./html-shell.js";
export { countPdfPages, hasPdfMagic } from "./pdf-utils.js";

export interface RenderLeadMagnetPdfInput {
  slug: string;
  title: string;
  subtitle?: string;
  html: string;
  brand: BrandConfig;
}

export interface RenderLeadMagnetPdfResult {
  pdf: Uint8Array;
  pageCount: number;
}

/**
 * Render a lead-magnet article to a branded PDF using Playwright's bundled
 * Chromium. The renderer wraps the incoming article HTML in a print-optimized
 * shell (cover page + page-break + content), sets the content on a headless
 * page, waits for fonts and network idle, then invokes page.pdf() with letter
 * format, printed backgrounds, and a footer showing page X / Y.
 */
export async function renderLeadMagnetPdf(
  input: RenderLeadMagnetPdfInput,
): Promise<RenderLeadMagnetPdfResult> {
  const fullHtml = buildLeadMagnetHtml(input);
  const footerTemplate = buildFooterTemplate(input.brand);

  // Dynamic import so consumers that only use the HTML/PDF-utils helpers do
  // not need playwright installed at module load time.
  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle" });
    // Ensure all @font-face declarations have resolved before we snapshot.
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: {
        top: "0.75in",
        bottom: "0.75in",
        left: "0.6in",
        right: "0.6in",
      },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate,
    });
    const pdf = new Uint8Array(
      pdfBuffer.buffer,
      pdfBuffer.byteOffset,
      pdfBuffer.byteLength,
    );
    if (!hasPdfMagic(pdf)) {
      throw new Error(
        `Playwright returned a buffer that does not start with %PDF for slug=${input.slug}`,
      );
    }
    const pageCount = countPdfPages(pdf);
    return { pdf, pageCount };
  } finally {
    await browser.close();
  }
}
