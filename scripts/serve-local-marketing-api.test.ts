import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createStandaloneLocalMarketingApiRuntime,
  isLocalMarketingApiHealthPath,
} from "./serve-local-marketing-api";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const leadMagnetsDir = path.join(repoRoot, "apps", "web", ".lead-magnets");
const fixturePath = path.join(leadMagnetsDir, "budget-template.pdf");
// Minimal valid single-page PDF
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj " +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
    "3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n" +
    "0000000058 00000 n \n0000000115 00000 n \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF",
);

describe("isLocalMarketingApiHealthPath", () => {
  it("accepts the local marketing API health endpoint with or without a trailing slash", () => {
    expect(isLocalMarketingApiHealthPath("/api/health")).toBe(true);
    expect(isLocalMarketingApiHealthPath("/api/health/")).toBe(true);
  });

  it("rejects non-health paths", () => {
    expect(isLocalMarketingApiHealthPath("/api/signup")).toBe(false);
    expect(isLocalMarketingApiHealthPath("/api/health/check")).toBe(false);
  });
});

describe("createStandaloneLocalMarketingApiRuntime", () => {
  let fixtureCreatedByTest = false;

  beforeAll(() => {
    if (!fs.existsSync(fixturePath)) {
      fs.mkdirSync(leadMagnetsDir, { recursive: true });
      fs.writeFileSync(fixturePath, MINIMAL_PDF);
      fixtureCreatedByTest = true;
    }
  });

  afterAll(() => {
    if (fixtureCreatedByTest && fs.existsSync(fixturePath)) {
      fs.rmSync(fixturePath);
      try {
        fs.rmdirSync(leadMagnetsDir);
      } catch {
        // dir not empty or doesn't exist — leave it
      }
    }
  });

  it("defaults to the localhost web origin used by the local Astro proxy", async () => {
    const { env } = await createStandaloneLocalMarketingApiRuntime();

    expect(env.ALLOWED_ORIGIN).toBe("http://localhost:4321");
    expect(env.PRODUCT_DOMAIN).toBe("localhost:4321");
  });

  it("serves built lead magnet PDFs through the local R2-compatible binding", async () => {
    const { env } = await createStandaloneLocalMarketingApiRuntime();

    const bucket = env.LEAD_MAGNETS_R2;
    expect(bucket).toBeDefined();
    if (!bucket) {
      throw new Error("Local lead magnet bucket was not configured.");
    }

    const pdf = await bucket.get("budget-template.pdf");

    expect(pdf).not.toBeNull();
    expect(pdf?.httpMetadata?.contentType).toBe("application/pdf");

    const firstChunk = await pdf!.body.getReader().read();
    expect(firstChunk.value?.byteLength).toBeGreaterThan(0);
  });
});
