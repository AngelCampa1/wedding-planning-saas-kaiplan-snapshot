import { describe, expect, it } from "vitest";
import { GET } from "../pages/site.webmanifest/index";

describe("site web manifest endpoint", () => {
  it("serves install metadata as manifest JSON", async () => {
    const response = GET();
    const manifest = await response.json();

    expect(response.headers.get("content-type")).toContain(
      "application/manifest+json",
    );
    expect(manifest.short_name).toBe("Kaiplan");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/favicon.svg" }),
      ]),
    );
  });
});
