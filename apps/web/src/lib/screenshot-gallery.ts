import type { ScreenshotEntry } from "../config/site";

export interface ScreenshotGalleryProps {
  heading: string;
  intro: string;
  screenshots: ScreenshotEntry[];
}

export function buildScreenshotGalleryProps(
  screenshots: ScreenshotEntry[],
): ScreenshotGalleryProps {
  return {
    heading: "See exactly what you're building",
    intro:
      "Every feature your wedding actually needs: budget, guests, seating, and vendors in one workspace.",
    screenshots,
  };
}
