import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("shared copy source regressions", () => {
  it("does not hardcode the old B2B eyebrow into ProblemAgitation", () => {
    const source = readSource("./problem-agitation.astro");

    expect(source).not.toContain("The Planning Problem");
    expect(source).toContain("config.eyebrow");
  });

  it("does not default FAQ headings to team-evaluation language", () => {
    const source = readSource("./faq-section.astro");

    expect(source).not.toContain("Answers for teams evaluating the fit");
    expect(source).toContain("resolveFaqHeading");
  });
});
