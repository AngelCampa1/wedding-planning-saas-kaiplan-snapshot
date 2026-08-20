import { describe, it, expect, vi } from "vitest";
import {
  INDEXNOW_KEY,
  INDEXNOW_KEY_FILENAME,
  parseSitemapIndex,
  parseSitemap,
  buildIndexNowPayload,
  submitToIndexNow,
} from "./indexnow";

describe("INDEXNOW_KEY", () => {
  it("is a 32-char hex string", () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("INDEXNOW_KEY_FILENAME", () => {
  it("equals INDEXNOW_KEY.txt", () => {
    expect(INDEXNOW_KEY_FILENAME).toBe(`${INDEXNOW_KEY}.txt`);
  });
});

describe("parseSitemapIndex", () => {
  it("extracts child sitemap URLs from sitemap-index.xml with multiple sitemaps", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://crewroute.app/sitemap-0.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://crewroute.app/sitemap-1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://crewroute.app/sitemap-2.xml</loc>
  </sitemap>
</sitemapindex>`;
    const result = parseSitemapIndex(xml);
    expect(result).toEqual([
      "https://crewroute.app/sitemap-0.xml",
      "https://crewroute.app/sitemap-1.xml",
      "https://crewroute.app/sitemap-2.xml",
    ]);
  });

  it("returns empty array for XML with no <loc> tags", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</sitemapindex>`;
    expect(parseSitemapIndex(xml)).toEqual([]);
  });
});

describe("parseSitemap", () => {
  it("extracts page URLs from a single sitemap XML with multiple URLs", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://crewroute.app/</loc>
  </url>
  <url>
    <loc>https://crewroute.app/pricing/</loc>
  </url>
  <url>
    <loc>https://crewroute.app/alternatives/jobber/</loc>
  </url>
</urlset>`;
    const result = parseSitemap(xml);
    expect(result).toEqual([
      "https://crewroute.app/",
      "https://crewroute.app/pricing/",
      "https://crewroute.app/alternatives/jobber/",
    ]);
  });

  it("returns empty array for empty URL set", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    expect(parseSitemap(xml)).toEqual([]);
  });
});

describe("buildIndexNowPayload", () => {
  it("returns correct shape with host/key/keyLocation/urlList", () => {
    const host = "crewroute.app";
    const urls = ["https://crewroute.app/", "https://crewroute.app/pricing/"];
    const payload = buildIndexNowPayload(host, urls);
    expect(payload).toEqual({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `https://${host}/${INDEXNOW_KEY_FILENAME}`,
      urlList: urls,
    });
  });

  it("sets keyLocation to https://{host}/{INDEXNOW_KEY_FILENAME}", () => {
    const host = "example.com";
    const payload = buildIndexNowPayload(host, []);
    expect(payload.keyLocation).toBe(
      `https://example.com/${INDEXNOW_KEY_FILENAME}`,
    );
  });
});

describe("submitToIndexNow", () => {
  it("calls fetch with correct URL, method POST, correct headers, serialized body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
    });
    const payload = buildIndexNowPayload("crewroute.app", [
      "https://crewroute.app/",
    ]);
    await submitToIndexNow(payload, mockFetch as unknown as typeof fetch);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.indexnow.org/indexnow",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      },
    );
  });

  it("returns success=true when fetch returns status 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
    });
    const payload = buildIndexNowPayload("crewroute.app", [
      "https://crewroute.app/",
    ]);
    const result = await submitToIndexNow(
      payload,
      mockFetch as unknown as typeof fetch,
    );
    expect(result).toEqual({ success: true, status: 200, message: "OK" });
  });

  it("returns success=true when fetch returns status 202 (Accepted)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 202,
      statusText: "Accepted",
    });
    const payload = buildIndexNowPayload("crewroute.app", [
      "https://crewroute.app/",
    ]);
    const result = await submitToIndexNow(
      payload,
      mockFetch as unknown as typeof fetch,
    );
    expect(result).toEqual({ success: true, status: 202, message: "Accepted" });
  });

  it("returns success=false when fetch returns status 422", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 422,
      statusText: "Unprocessable Entity",
    });
    const payload = buildIndexNowPayload("crewroute.app", [
      "https://crewroute.app/",
    ]);
    const result = await submitToIndexNow(
      payload,
      mockFetch as unknown as typeof fetch,
    );
    expect(result).toEqual({
      success: false,
      status: 422,
      message: "Unprocessable Entity",
    });
  });

  it("uses provided fetchFn instead of global fetch", async () => {
    const globalFetch = vi.spyOn(global, "fetch");
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
    });
    const payload = buildIndexNowPayload("crewroute.app", [
      "https://crewroute.app/",
    ]);
    await submitToIndexNow(payload, mockFetch as unknown as typeof fetch);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });

  it("returns success=false with status=0 when fetch throws", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const payload = buildIndexNowPayload("crewroute.app", [
      "https://crewroute.app/",
    ]);
    const result = await submitToIndexNow(
      payload,
      mockFetch as unknown as typeof fetch,
    );
    expect(result).toEqual({
      success: false,
      status: 0,
      message: "Network error",
    });
  });

  it("returns success=false with stringified message when fetch throws a non-Error", async () => {
    const mockFetch = vi.fn().mockRejectedValue("connection refused");
    const payload = buildIndexNowPayload("crewroute.app", [
      "https://crewroute.app/",
    ]);
    const result = await submitToIndexNow(
      payload,
      mockFetch as unknown as typeof fetch,
    );
    expect(result).toEqual({
      success: false,
      status: 0,
      message: "connection refused",
    });
  });
});
