export interface BrandConfig {
  productName: string;
  domain: string;
  logoUrl?: string;
  brandColor: string;
  accentColor: string;
}

export interface HtmlShellInput {
  title: string;
  subtitle?: string;
  html: string;
  brand: BrandConfig;
}

/** Escape minimal set of HTML-significant chars for attribute/text injection. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap a rendered article HTML fragment in a branded, print-optimized full HTML
 * shell: cover page (brand-color background, accent-color divider) + page break
 * + article body. Intended to be rendered by Playwright Chromium via page.pdf().
 */
export function buildLeadMagnetHtml(input: HtmlShellInput): string {
  const { title, subtitle, html, brand } = input;
  const safeTitle = escapeHtml(title);
  const safeSubtitle = subtitle ? escapeHtml(subtitle) : "";
  const safeProduct = escapeHtml(brand.productName);
  const safeDomain = escapeHtml(brand.domain);
  const safeBrand = escapeHtml(brand.brandColor);
  const safeAccent = escapeHtml(brand.accentColor);
  const logoBlock = brand.logoUrl
    ? `<img class="cover-logo" src="${escapeHtml(brand.logoUrl)}" alt="${safeProduct} logo" />`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap');

@page { size: letter; margin: 0.75in 0.6in; }

html, body {
  margin: 0;
  padding: 0;
  font-family: 'DM Sans', system-ui, sans-serif;
  color: #1f2937;
  background: #f5f1ea;
  font-size: 11pt;
  line-height: 1.55;
}

h1, h2, h3, h4 {
  font-family: 'Fraunces', Georgia, serif;
  color: #1f2937;
  line-height: 1.2;
}

.cover {
  background: ${safeBrand};
  color: #ffffff;
  padding: 1.25in 0.75in;
  page-break-after: always;
  break-after: page;
  min-height: 9in;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  margin: -0.75in -0.6in;
}

.cover-logo {
  max-width: 1.5in;
  height: auto;
  display: block;
  margin-bottom: 0.25in;
}

.cover h1 {
  font-family: 'Fraunces', Georgia, serif;
  color: #ffffff;
  font-size: 32pt;
  font-weight: 700;
  margin: 0 0 0.2in;
  letter-spacing: -0.01em;
}

.cover .cover-divider {
  width: 1.6in;
  height: 6px;
  background: ${safeAccent};
  margin: 0.15in 0 0.25in;
  border-radius: 2px;
}

.cover .cover-subtitle {
  font-family: 'DM Sans', sans-serif;
  font-size: 14pt;
  line-height: 1.45;
  color: #ffffff;
  opacity: 0.92;
  max-width: 5.5in;
}

.cover .cover-footer {
  font-family: 'DM Sans', sans-serif;
  font-size: 10pt;
  color: #ffffff;
  opacity: 0.85;
  margin-top: 0.5in;
}

.content {
  padding: 0;
}

.content h2 {
  font-size: 18pt;
  margin-top: 0.4in;
  margin-bottom: 0.12in;
  padding-bottom: 0.08in;
  border-bottom: 2px solid ${safeAccent};
}

.content h3 {
  font-size: 14pt;
  margin-top: 0.25in;
  margin-bottom: 0.08in;
}

.content h1 {
  font-size: 22pt;
  margin-top: 0.2in;
}

.content p { margin: 0 0 0.12in; }

.content ul, .content ol {
  margin: 0 0 0.15in 0.25in;
  padding: 0;
}

.content li { margin-bottom: 0.05in; }

.content strong { color: #1f2937; font-weight: 600; }

.content blockquote {
  border-left: 3px solid ${safeAccent};
  padding: 0.05in 0.2in;
  margin: 0.15in 0;
  color: #3f3a33;
  background: #f3efe7;
}

.content table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.15in 0;
  font-size: 10pt;
}

.content th, .content td {
  border: 1px solid #d9d4c8;
  padding: 0.05in 0.08in;
  text-align: left;
}

.content th {
  background: ${safeBrand};
  color: #ffffff;
  font-weight: 600;
}

.content code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  background: #eee9dc;
  padding: 0 3px;
  border-radius: 3px;
  font-size: 0.9em;
}

.content a { color: ${safeBrand}; text-decoration: underline; }

h2, h3 { break-after: avoid; page-break-after: avoid; }
table, blockquote { break-inside: avoid; page-break-inside: avoid; }
</style>
</head>
<body>
<section class="cover" style="background:${safeBrand}">
  <div>
    ${logoBlock}
    <h1>${safeTitle}</h1>
    <div class="cover-divider" style="background:${safeAccent}"></div>
    ${safeSubtitle ? `<p class="cover-subtitle">${safeSubtitle}</p>` : ""}
  </div>
  <div class="cover-footer">Prepared by ${safeProduct} &middot; ${safeDomain}</div>
</section>
<main class="content">
${html}
</main>
</body>
</html>`;
}

/** Footer template for Playwright's page.pdf(displayHeaderFooter). */
export function buildFooterTemplate(brand: BrandConfig): string {
  const safeProduct = escapeHtml(brand.productName);
  const safeDomain = escapeHtml(brand.domain);
  return `<div style="font-size:8pt; color:#8A8478; width:100%; padding:0 0.6in; display:flex; justify-content:space-between; font-family: 'DM Sans', sans-serif;">
    <span>${safeProduct} &middot; ${safeDomain}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;
}
