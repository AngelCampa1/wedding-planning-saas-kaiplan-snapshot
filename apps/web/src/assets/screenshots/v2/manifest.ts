/**
 * Wave 1 — Editorial screenshot plates manifest.
 *
 * Each entry pairs a real product screenshot (captured by
 * `scripts/capture-screenshots-v2.ts`) with the editorial copy
 * — alt text, italic caption, figure number — that the new marketing
 * pages render around the plate.
 *
 * Images are imported via Astro's image pipeline (`ImageMetadata`) so
 * page templates can pass them directly to `<Image src={...}>`. The
 * `srcLarge` field carries the 2× source for the `<Image>` `densities`
 * /`widths` props; `src` is a 1× thumbnail suitable for cards or
 * low-bandwidth previews.
 */

import type { ImageMetadata } from "astro";

import budgetLedger from "./budget-ledger.png";
import budgetLedger2x from "./budget-ledger@2x.png";
import guestList from "./guest-list.png";
import guestList2x from "./guest-list@2x.png";
import milestoneChecklist from "./milestone-checklist.png";
import milestoneChecklist2x from "./milestone-checklist@2x.png";
import seatingChart from "./seating-chart.png";
import seatingChart2x from "./seating-chart@2x.png";
import vendorTracker from "./vendor-tracker.png";
import vendorTracker2x from "./vendor-tracker@2x.png";
import weddingWebsite from "./wedding-website.png";
import weddingWebsite2x from "./wedding-website@2x.png";

export type ScreenshotOrientation = "landscape" | "portrait";

export interface ScreenshotPlate {
  /** Stable identifier (kebab-case). Use as a React/Astro key. */
  key: string;
  /** 1× image (~viewport width) — light, ideal for thumbnails. */
  src: ImageMetadata;
  /** 2× retina image — primary asset for editorial plates. */
  srcLarge: ImageMetadata;
  /** Aspect ratio of the capture. */
  orientation: ScreenshotOrientation;
  /** Accessible image description. Plain prose, no italics. */
  alt: string;
  /** Italic plate caption rendered under the figure. */
  caption: string;
  /** "Fig. N" label (without the trailing period). */
  figNumber: string;
}

export const screenshotPlates: ScreenshotPlate[] = [
  {
    key: "budget-ledger",
    src: budgetLedger,
    srcLarge: budgetLedger2x,
    orientation: "landscape",
    alt: "Kaiplan budget ledger showing six categories with totals, paid amounts, and remaining balance.",
    caption:
      "The ledger, on the morning your florist quote lands. Totals reconcile in real time.",
    figNumber: "Fig. 01",
  },
  {
    key: "guest-list",
    src: guestList,
    srcLarge: guestList2x,
    orientation: "landscape",
    alt: "Kaiplan guest list table with columns for name, side, group, RSVP status, and dietary notes.",
    caption:
      "Eighteen names, three RSVP states, and a quiet running count of who has and hasn't replied.",
    figNumber: "Fig. 02",
  },
  {
    key: "seating-chart",
    src: seatingChart,
    srcLarge: seatingChart2x,
    orientation: "landscape",
    alt: "Kaiplan seating chart canvas with eight round tables, an unseated guest rail, and an inspector panel.",
    caption:
      "Eight tables, a guest rail to drag from, and an inspector that does the table arithmetic for you.",
    figNumber: "Fig. 03",
  },
  {
    key: "vendor-tracker",
    src: vendorTracker,
    srcLarge: vendorTracker2x,
    orientation: "landscape",
    alt: "Kaiplan vendor tracker listing five vendors across categories with contract status and contact details.",
    caption:
      "Five vendors, three contract states, one place to find the email you sent two weeks ago.",
    figNumber: "Fig. 04",
  },
  {
    key: "wedding-website",
    src: weddingWebsite,
    srcLarge: weddingWebsite2x,
    orientation: "portrait",
    alt: "Public wedding website for Sam & Jordan with hero, story, venue, registry, and RSVP sections.",
    caption:
      "Your wedding website, published from the same place you keep the budget. No template store.",
    figNumber: "Fig. 05",
  },
  {
    key: "milestone-checklist",
    src: milestoneChecklist,
    srcLarge: milestoneChecklist2x,
    orientation: "portrait",
    alt: "Kaiplan milestone checklist grouped by months-out buckets with mixed completed and pending tasks.",
    caption:
      "A checklist that knows what month you're in, and stops nagging the ones you've already finished.",
    figNumber: "Fig. 06",
  },
];

/** Look up a single plate by its key. Throws if the key is unknown. */
export function getScreenshotPlate(key: string): ScreenshotPlate {
  const plate = screenshotPlates.find((p) => p.key === key);
  if (!plate) {
    throw new Error(`Unknown screenshot plate key: ${key}`);
  }
  return plate;
}
