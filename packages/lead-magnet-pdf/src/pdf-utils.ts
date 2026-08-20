/**
 * Count the number of `/Type /Page` objects in a rendered PDF buffer. The
 * cover-plus-content shell ensures this is at least 2 for any real content.
 * Falls back to parsing the `/Count N` entry of the page tree if no direct
 * `/Type /Page` markers are found (rare for Chromium output).
 */
export function countPdfPages(buffer: Uint8Array): number {
  const text = bufferToLatin1(buffer);
  // Match `/Type /Page` but NOT `/Type /Pages` (the tree root).
  const pageMatches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  if (pageMatches && pageMatches.length > 0) {
    return pageMatches.length;
  }
  const countMatch = text.match(/\/Count\s+(\d+)/);
  if (countMatch && countMatch[1]) {
    return Number.parseInt(countMatch[1], 10);
  }
  return 0;
}

/** Return true when the bytes begin with the `%PDF` magic header. */
export function hasPdfMagic(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 // F
  );
}

function bufferToLatin1(buffer: Uint8Array): string {
  // Decode as latin1 so every byte round-trips to a char (PDFs are binary but
  // the structural markers we inspect are ASCII).
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    const slice = buffer.subarray(i, Math.min(i + chunk, buffer.length));
    out += String.fromCharCode(...slice);
  }
  return out;
}
