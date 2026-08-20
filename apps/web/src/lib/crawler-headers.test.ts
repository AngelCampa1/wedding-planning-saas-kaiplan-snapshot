import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function readHeadersFile(): string {
  return readFileSync(resolve("public/_headers"), "utf-8");
}

function readRobotsFile(): string {
  return readFileSync(resolve("public/robots.txt"), "utf-8");
}

function readHeaderBlock(route: string): string {
  const lines = readHeadersFile().split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === route);
  if (start === -1) return "";

  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !line.startsWith(" ")) break;
    block.push(line);
  }

  return block.join("\n");
}

describe("crawler headers", () => {
  it("does not serve a crawler header block for the removed pricing markdown artifact", () => {
    expect(readHeaderBlock("/pricing.md")).toBe("");
  });

  it("keeps wedding websites out of the index", () => {
    expect(readHeaderBlock("/w/*")).toContain(
      "X-Robots-Tag: noindex, nofollow, noarchive",
    );
  });

  it("keeps API responses out of the index at the edge", () => {
    const block = readHeaderBlock("/api/*");

    expect(block).toContain("X-Robots-Tag: noindex, nofollow, noarchive");
    expect(block).toContain("Cache-Control: private, no-store");
  });

  it("sets explicit cache policy for machine-readable AI files", () => {
    for (const route of ["/llms.txt", "/llms-full.txt", "/pricing.txt"]) {
      expect(readHeaderBlock(route)).toContain(
        "Cache-Control: public, max-age=300, stale-while-revalidate=3600",
      );
    }
  });

  it("does not add a conflicting global X-Robots-Tag to indexable pages", () => {
    expect(readHeaderBlock("/*")).not.toContain("X-Robots-Tag");
  });

  it("allows AI bots for public pages while blocking private and API paths", () => {
    const robots = readRobotsFile();
    const bots = [
      "GPTBot",
      "ChatGPT-User",
      "PerplexityBot",
      "ClaudeBot",
      "anthropic-ai",
      "Google-Extended",
      "Applebot",
      "Amazonbot",
      "meta-externalagent",
      "CCBot",
      "Bytespider",
    ];

    for (const bot of bots) {
      const block = robots.match(
        new RegExp(`User-agent: ${bot}\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\r?\\n|$)`),
      )?.[1];

      expect(block, bot).toContain("Allow: /");
      expect(block, bot).toContain("Disallow: /w/");
      expect(block, bot).toContain("Disallow: /api/");
    }
  });
});
