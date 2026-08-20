import { DIETARY_TAGS, createGuestSchema, csvRowSchema } from "@kaiplan/shared";
import type { CsvRowInput, DietaryTag } from "@kaiplan/shared";

const FORMULA_INJECTION_CHARS = /^[=+\-@\t\r\n]+/;

/**
 * Strips leading formula injection characters and trims whitespace.
 * Protects against CSV injection attacks when data is opened in spreadsheet apps.
 */
export function sanitizeCsvCell(value: string): string {
  return value.trim().replace(FORMULA_INJECTION_CHARS, "").trim();
}

/**
 * Parses a single CSV line, handling quoted fields (commas inside quotes,
 * escaped double-quotes as "").
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // Closing quote
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ",") {
      fields.push(current);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  fields.push(current);
  return fields;
}

const MAX_ROWS = 500;

type DietaryTagsParseResult =
  | { success: true; tags: DietaryTag[] }
  | { success: false; message: string };

export interface CsvParseResult {
  rows: Array<CsvRowInput & { rowNumber: number }>;
  errors: { row: number; message: string }[];
}

export function parseCsvDietaryTags(
  value: string | undefined,
): DietaryTagsParseResult {
  if (!value) {
    return { success: true, tags: [] };
  }

  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  const invalidTags = tags.filter(
    (tag) => !(DIETARY_TAGS as readonly string[]).includes(tag),
  );
  if (invalidTags.length > 0) {
    return {
      success: false,
      message: `Unknown dietary tag(s): ${invalidTags.join(", ")}`,
    };
  }
  const parsedTags = createGuestSchema.shape.dietaryTags.safeParse(tags);
  if (!parsedTags.success) {
    return {
      success: false,
      message: parsedTags.error.issues[0]!.message,
    };
  }
  return { success: true, tags: parsedTags.data };
}

/**
 * Parses CSV text into validated CsvRowInput records.
 *
 * - First line must be a header row with at minimum first_name and last_name.
 * - Each cell is sanitized against formula injection before validation.
 * - Maximum of 500 data rows enforced.
 * - Rows that fail Zod validation are collected as errors (1-based row index).
 */
export function parseCsvGuests(csvText: string): CsvParseResult {
  const rows: Array<CsvRowInput & { rowNumber: number }> = [];
  const errors: { row: number; message: string }[] = [];

  // Normalize line endings and split
  const normalized = csvText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  // The CSV always has at least a header line; index 0 is guaranteed to exist.
  const headerLine = lines[0] ?? "";
  const headers = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase());

  const dataLines = lines
    .slice(1)
    .map((line, index) => ({ line, rowNumber: index + 1 }))
    .filter(({ line }) => line.trim() !== "");

  if (dataLines.length > MAX_ROWS) {
    errors.push({
      row: 0,
      message: `CSV exceeds maximum of ${MAX_ROWS} rows. Found ${dataLines.length} data rows.`,
    });
    return { rows, errors };
  }

  for (let i = 0; i < dataLines.length; i++) {
    // Loop bound guarantees dataLines[i] exists.
    const { line, rowNumber } = dataLines[i]!;
    const cells = parseCsvLine(line);

    // Build raw object from header/cell mapping, sanitizing each cell
    const raw: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      // Loop bound guarantees headers[j] exists.
      const header = headers[j]!;
      const cellValue = cells[j] ?? "";
      const sanitized = sanitizeCsvCell(cellValue);
      if (sanitized !== "") {
        raw[header] = sanitized;
      }
    }

    const parsed = csvRowSchema.safeParse(raw);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const fieldNames = Object.keys(fieldErrors).join(", ");
      const firstMessages = Object.values(fieldErrors)
        .flat()
        .slice(0, 2)
        .join("; ");
      errors.push({
        row: rowNumber,
        message: `Row ${rowNumber} invalid — fields: ${fieldNames}. ${firstMessages}`,
      });
      continue;
    }

    const dietaryTags = parseCsvDietaryTags(parsed.data.dietary_tags);
    if (!dietaryTags.success) {
      errors.push({
        row: rowNumber,
        message: `Row ${rowNumber} invalid — fields: dietary_tags. ${dietaryTags.message}`,
      });
      continue;
    }

    rows.push({ ...parsed.data, rowNumber });
  }

  return { rows, errors };
}
