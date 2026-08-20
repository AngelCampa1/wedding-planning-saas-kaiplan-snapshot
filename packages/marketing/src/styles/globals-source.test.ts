import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(join(currentDir, relativePath), "utf8");
}

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("public global styles source regressions", () => {
  it("does not expose dark-mode activation selectors", () => {
    const marketingGlobals = readSource("./globals.css");
    const webGlobals = readSource("../../../../apps/web/src/styles/global.css");
    const shippedCss = stripCssComments(`${marketingGlobals}\n${webGlobals}`);

    expect(shippedCss).not.toContain("@media (prefers-color-scheme: dark)");
    expect(shippedCss).not.toContain(":root.dark");
    expect(shippedCss).not.toContain("html.dark");
  });

  it("keeps remote font loading out of web global CSS", () => {
    const webGlobals = readSource("../../../../apps/web/src/styles/global.css");

    expect(webGlobals).not.toContain("fonts.googleapis.com");
    expect(webGlobals).not.toContain("fonts.gstatic.com");
  });
});
