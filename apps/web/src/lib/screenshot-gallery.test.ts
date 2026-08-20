import { describe, expect, it } from "vitest";
import type { ImageMetadata } from "astro";
import type { ScreenshotEntry } from "../config/site";
import {
  buildScreenshotGalleryProps,
  type ScreenshotGalleryProps,
} from "./screenshot-gallery";

function mockImage(src: string): ImageMetadata {
  return {
    src,
    width: 1024,
    height: 640,
    format: "png",
  } as ImageMetadata;
}

describe("buildScreenshotGalleryProps", () => {
  const mockScreenshots: ScreenshotEntry[] = [
    {
      src: mockImage("/screenshots/ledger.png"),
      alt: "Kaiplan budget ledger",
      caption: "Real numbers, not estimates.",
      feature: "Budget Ledger",
    },
    {
      src: mockImage("/screenshots/guests.png"),
      alt: "Kaiplan guest list",
      caption: "Guest list linked to RSVP and seating.",
      feature: "Guest List",
    },
  ];

  it("returns a heading string", () => {
    const props: ScreenshotGalleryProps =
      buildScreenshotGalleryProps(mockScreenshots);
    expect(typeof props.heading).toBe("string");
    expect(props.heading.length).toBeGreaterThan(0);
  });

  it("returns an intro string", () => {
    const props = buildScreenshotGalleryProps(mockScreenshots);
    expect(typeof props.intro).toBe("string");
    expect(props.intro.length).toBeGreaterThan(0);
  });

  it("passes the screenshots array through unchanged", () => {
    const props = buildScreenshotGalleryProps(mockScreenshots);
    expect(props.screenshots).toEqual(mockScreenshots);
    expect(props.screenshots).toHaveLength(2);
  });

  it("returns props with all required fields", () => {
    const props = buildScreenshotGalleryProps(mockScreenshots);
    expect(props).toHaveProperty("heading");
    expect(props).toHaveProperty("intro");
    expect(props).toHaveProperty("screenshots");
  });

  it("works with an empty screenshots array", () => {
    const props = buildScreenshotGalleryProps([]);
    expect(props.screenshots).toHaveLength(0);
    expect(props.heading).toBeTruthy();
    expect(props.intro).toBeTruthy();
  });

  it("includes the expected heading text about building the planner", () => {
    const props = buildScreenshotGalleryProps(mockScreenshots);
    expect(props.heading).toContain("See exactly what you");
  });

  it("includes intro text mentioning key feature areas", () => {
    const props = buildScreenshotGalleryProps(mockScreenshots);
    expect(props.intro).toContain("budget");
    expect(props.intro).toContain("seating");
    expect(props.intro).toContain("vendors");
  });
});
