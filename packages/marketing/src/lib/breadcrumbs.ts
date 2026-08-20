/**
 * Converts a URL slug to a human-readable title-case label.
 * Only transforms if the string looks like a slug (contains hyphens, no spaces).
 * Leaves already-readable labels unchanged.
 *
 * @example
 * formatSlugAsLabel("best-apps-make-friends-adult") // "Best Apps Make Friends Adult"
 * formatSlugAsLabel("Resources")                     // "Resources" (unchanged)
 * formatSlugAsLabel("Software Roundups")             // "Software Roundups" (unchanged)
 */
export function formatSlugAsLabel(label: string): string {
  // If label contains a space, it's already human-readable — leave it alone
  if (label.includes(" ")) return label;
  // If it contains hyphens, convert slug to title case
  if (label.includes("-")) {
    return label
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
      .replace(/\s+/g, " ") // normalise multiple spaces from empty segments
      .trim();
  }
  // Single word, no hyphens — leave it alone (e.g., "Resources", "Home")
  return label;
}
