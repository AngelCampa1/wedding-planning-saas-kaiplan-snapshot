import { describe, expect, it } from "vitest";
import { createSiteWebManifestResponse } from "./site-webmanifest";

describe("site web manifest response", () => {
  it("serves install metadata as manifest JSON", async () => {
    const response = createSiteWebManifestResponse();
    const manifest = await response.json();

    expect(response.headers.get("content-type")).toBe(
      "application/manifest+json; charset=utf-8",
    );
    expect(manifest).toMatchObject({
      name: "Kaiplan - Wedding Planning Software",
      short_name: "Kaiplan",
      start_url: "/",
      display: "standalone",
      theme_color: "#b0432a",
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/favicon.svg", sizes: "any" }),
        expect.objectContaining({ src: "/apple-touch-icon.png" }),
      ]),
    );
  });
});
