import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("base layout source regressions", () => {
  it("does not hardcode a global apple touch icon path", () => {
    const source = readSource("./base-layout.astro");

    expect(source).toContain("appleTouchIcon");
    expect(source).not.toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    );
  });

  it("threads the optional appleTouchIcon prop from the shared site config", () => {
    const typesSource = readSource("../types.ts");

    expect(typesSource).toContain("appleTouchIcon?: string;");
  });

  it("supports site-level metadata preservation without changing the global default", () => {
    const layoutSource = readSource("./base-layout.astro");
    const typesSource = readSource("../types.ts");

    expect(layoutSource).toContain("preserveMetaTagCopy?: boolean");
    expect(layoutSource).toContain(
      "preserveAuthoredMetadata={preserveMetaTagCopy}",
    );
    expect(typesSource).toContain("preserveMetaTagCopy?: boolean;");
  });
});
