import { describe, expect, it } from "vitest";
import { countPdfPages, hasPdfMagic } from "./pdf-utils.js";

function stringToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

describe("hasPdfMagic", () => {
  it("returns true for a buffer starting with %PDF", () => {
    expect(hasPdfMagic(stringToBytes("%PDF-1.7\nrest"))).toBe(true);
  });

  it("returns false for any other prefix", () => {
    expect(hasPdfMagic(stringToBytes("HTML<"))).toBe(false);
  });

  it("returns false for a buffer shorter than 4 bytes", () => {
    expect(hasPdfMagic(stringToBytes("%PD"))).toBe(false);
  });
});

describe("countPdfPages", () => {
  it("counts distinct /Type /Page occurrences (but not /Pages)", () => {
    const src =
      "%PDF-1.7\n1 0 obj <</Type /Pages /Count 3>>\n" +
      "2 0 obj <</Type /Page>> endobj\n" +
      "3 0 obj <</Type /Page>> endobj\n" +
      "4 0 obj <</Type /Page>> endobj\n";
    expect(countPdfPages(stringToBytes(src))).toBe(3);
  });

  it("tolerates extra whitespace between /Type and /Page", () => {
    const src = "%PDF\n/Type   /Page\n/Type\t/Page\n";
    expect(countPdfPages(stringToBytes(src))).toBe(2);
  });

  it("falls back to /Count N when no /Type /Page markers exist", () => {
    const src = "%PDF\n/Count 7\n";
    expect(countPdfPages(stringToBytes(src))).toBe(7);
  });

  it("returns 0 when neither marker is present", () => {
    expect(countPdfPages(stringToBytes("%PDF empty"))).toBe(0);
  });

  it("handles buffers larger than the 0x8000 chunk boundary", () => {
    const head = "/Type /Page\n";
    const filler = "x".repeat(0x9000);
    const src = head + filler + "/Type /Page\n";
    expect(countPdfPages(stringToBytes(src))).toBe(2);
  });
});
