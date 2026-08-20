import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => {
  const createLocalApiMock = vi.fn(async () => ({
    fetch: vi.fn(),
  }));
  const makeLocalEnvMock = vi.fn((overrides: Record<string, unknown>) => ({
    ALLOWED_ORIGIN: "https://kaiplan.app",
    PRODUCT_DOMAIN: "kaiplan.app",
    LOCAL_OUTBOX: { emails: [], apollo: [] },
    ...overrides,
  }));

  return {
    createLocalApiMock,
    makeLocalEnvMock,
  };
});

vi.mock("@kaiplan/marketing-api/integration", () => ({
  createLocalApi: mocks.createLocalApiMock,
  makeLocalEnv: mocks.makeLocalEnvMock,
}));

import {
  getLocalMarketingApiRuntime,
  getLocalMarketingOutbox,
  resetLocalMarketingApiRuntime,
} from "./local-marketing-api";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const leadMagnetsDir = path.resolve(
  moduleDir,
  "../../../../apps/web/.lead-magnets",
);
const fixturePath = path.join(leadMagnetsDir, "budget-template.pdf");
// Minimal valid single-page PDF (a well-known smallest-valid-PDF pattern)
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj " +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
    "3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n" +
    "0000000058 00000 n \n0000000115 00000 n \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF",
);

describe("local marketing api runtime", () => {
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
      // Remove the dir only if it's now empty and we created it
      try {
        fs.rmdirSync(leadMagnetsDir);
      } catch {
        // dir not empty or doesn't exist — leave it
      }
    }
  });

  beforeEach(() => {
    resetLocalMarketingApiRuntime();
    mocks.createLocalApiMock.mockClear();
    mocks.makeLocalEnvMock.mockClear();
  });

  it("builds and caches a runtime keyed by the first request origin", async () => {
    const first = await getLocalMarketingApiRuntime(
      "https://kaiplan.app/api/signup",
    );
    const second = await getLocalMarketingApiRuntime(
      "https://kaiplan.app/api/feedback",
    );

    expect(first).toBe(second);
    expect(mocks.makeLocalEnvMock).toHaveBeenCalledTimes(1);
    expect(mocks.makeLocalEnvMock).toHaveBeenCalledWith({
      ALLOWED_ORIGIN: "https://kaiplan.app",
      PRODUCT_DOMAIN: "kaiplan.app",
      LEAD_MAGNETS_R2: expect.objectContaining({
        get: expect.any(Function),
      }),
    });
    expect(mocks.createLocalApiMock).toHaveBeenCalledTimes(1);
  });

  it("creates a separate runtime for a different request origin", async () => {
    const first = await getLocalMarketingApiRuntime(
      "https://kaiplan.app/api/signup",
    );
    const second = await getLocalMarketingApiRuntime(
      "https://preview.kaiplan.app/api/signup",
    );

    expect(first).not.toBe(second);
    expect(mocks.makeLocalEnvMock).toHaveBeenCalledTimes(2);
    expect(mocks.makeLocalEnvMock.mock.calls[0]?.[0]).toMatchObject({
      ALLOWED_ORIGIN: "https://kaiplan.app",
      PRODUCT_DOMAIN: "kaiplan.app",
    });
    expect(mocks.makeLocalEnvMock.mock.calls[1]?.[0]).toMatchObject({
      ALLOWED_ORIGIN: "https://preview.kaiplan.app",
      PRODUCT_DOMAIN: "preview.kaiplan.app",
    });
    expect(mocks.createLocalApiMock).toHaveBeenCalledTimes(2);
  });

  it("exposes the local outbox from the cached runtime", async () => {
    const outbox = await getLocalMarketingOutbox(
      "https://kaiplan.app/api/signup",
    );

    expect(outbox).toEqual({
      emails: [],
      apollo: [],
    });
  });

  it("serves local lead magnet PDFs from the embedded bucket", async () => {
    const runtime = await getLocalMarketingApiRuntime(
      "https://kaiplan.app/api/signup",
    );

    const object = await runtime.env.LEAD_MAGNETS_R2?.get(
      "budget-template.pdf",
    );

    expect(object).toBeTruthy();
    expect(object?.httpMetadata?.contentType).toBe("application/pdf");
    await expect(new Response(object?.body).arrayBuffer()).resolves.toEqual(
      expect.any(ArrayBuffer),
    );
  });

  it("returns null from the embedded bucket for missing or non-PDF keys", async () => {
    const runtime = await getLocalMarketingApiRuntime(
      "https://kaiplan.app/api/signup",
    );

    await expect(
      runtime.env.LEAD_MAGNETS_R2?.get("missing.pdf"),
    ).resolves.toBeNull();
    await expect(
      runtime.env.LEAD_MAGNETS_R2?.get("../budget-template.txt"),
    ).resolves.toBeNull();
  });

  it("resets the cached runtime", async () => {
    await getLocalMarketingApiRuntime("https://kaiplan.app/api/signup");
    resetLocalMarketingApiRuntime();
    await getLocalMarketingApiRuntime("https://kaiplan.app/api/signup");

    expect(mocks.createLocalApiMock).toHaveBeenCalledTimes(2);
  });
});
