import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(join(currentDir, relativePath), "utf8");
}

describe("editorial-tabs pill-canon source guard", () => {
  it(".editorial-tabs rule block contains border-radius: 9999px (pill shape)", () => {
    const source = readSource("./editorial.css");

    // Extract the .editorial-tabs rule block (everything between the selector and its closing brace)
    const match = source.match(/\.editorial-tabs\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    const ruleBlock = match![1];

    expect(ruleBlock).toContain("border-radius: 9999px");
  });
});
