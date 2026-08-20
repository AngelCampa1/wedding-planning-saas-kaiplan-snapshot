import { describe, it, expect } from "vitest";
import {
  sanitizeCsvCell,
  parseCsvGuests,
} from "../../src/routes/guest-csv-import";

// ---------------------------------------------------------------------------
// sanitizeCsvCell
// ---------------------------------------------------------------------------

describe("sanitizeCsvCell", () => {
  it("strips leading = (formula injection)", () => {
    expect(sanitizeCsvCell("=SUM(A1:A10)")).toBe("SUM(A1:A10)");
  });

  it("strips leading + char", () => {
    expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe("cmd|' /C calc'!A0");
  });

  it("strips leading - char", () => {
    expect(sanitizeCsvCell("-2+3")).toBe("2+3");
  });

  it("strips leading @ char", () => {
    expect(sanitizeCsvCell("@SUM(1+1)")).toBe("SUM(1+1)");
  });

  it("strips leading tab char", () => {
    expect(sanitizeCsvCell("\tinjected")).toBe("injected");
  });

  it("strips leading carriage return char", () => {
    expect(sanitizeCsvCell("\rinjected")).toBe("injected");
  });

  it("strips leading newline char", () => {
    expect(sanitizeCsvCell("\n=cmd")).toBe("cmd");
  });

  it("strips multiple leading formula chars", () => {
    expect(sanitizeCsvCell("==cmd")).toBe("cmd");
  });

  it("strips mixed leading formula chars", () => {
    expect(sanitizeCsvCell("=+@cmd")).toBe("cmd");
  });

  it("leaves normal text unchanged", () => {
    expect(sanitizeCsvCell("Alice")).toBe("Alice");
  });

  it("leaves text with formula chars in non-leading positions unchanged", () => {
    expect(sanitizeCsvCell("foo=bar")).toBe("foo=bar");
  });

  it("trims leading whitespace", () => {
    expect(sanitizeCsvCell("  Alice  ")).toBe("Alice");
  });

  it("strips formula chars after leading whitespace", () => {
    expect(sanitizeCsvCell("  =SUM(A1:A10)")).toBe("SUM(A1:A10)");
  });

  it("trims trailing whitespace", () => {
    expect(sanitizeCsvCell("Alice  ")).toBe("Alice");
  });

  it("handles empty string", () => {
    expect(sanitizeCsvCell("")).toBe("");
  });

  it("handles string with only formula chars", () => {
    expect(sanitizeCsvCell("===")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseCsvGuests
// ---------------------------------------------------------------------------

describe("parseCsvGuests", () => {
  it("parses valid CSV with required columns only", () => {
    const csv = `first_name,last_name\nAlice,Smith\nBob,Jones`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].first_name).toBe("Alice");
    expect(result.rows[0].rowNumber).toBe(1);
    expect(result.rows[0].last_name).toBe("Smith");
    expect(result.rows[1].first_name).toBe("Bob");
    expect(result.rows[1].rowNumber).toBe(2);
  });

  it("parses a UTF-8 BOM before the first header", () => {
    const csv = `\uFEFFfirst_name,last_name\nAlice,Smith`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].first_name).toBe("Alice");
    expect(result.rows[0].last_name).toBe("Smith");
  });

  it("parses valid CSV with all columns including quoted dietary_tags", () => {
    const csv = `first_name,last_name,email,phone,side,group_name,dietary_tags,dietary_notes\nAlice,Smith,alice@example.com,555-1234,partner1,Family,"vegetarian,vegan",No nuts`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.first_name).toBe("Alice");
    expect(row.last_name).toBe("Smith");
    expect(row.email).toBe("alice@example.com");
    expect(row.phone).toBe("555-1234");
    expect(row.side).toBe("partner1");
    expect(row.group_name).toBe("Family");
    expect(row.dietary_tags).toBe("vegetarian,vegan");
    expect(row.dietary_notes).toBe("No nuts");
  });

  it("reports errors for invalid rows and keeps valid ones", () => {
    const csv = `first_name,last_name,email\nAlice,Smith,alice@example.com\n,Jones,bob@example.com\nCarol,Williams,carol@example.com`;
    const result = parseCsvGuests(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.rowNumber)).toEqual([1, 3]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("first_name");
  });

  it("preserves original row numbers for valid rows after blank lines", () => {
    const csv = `first_name,last_name

Alice,Smith

Bob,Jones`;
    const result = parseCsvGuests(csv);

    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
  });

  it("sanitizes formula injection in cells", () => {
    const csv = `first_name,last_name\n=EVIL(),Smith\n+inject,Jones`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].first_name).toBe("EVIL()");
    expect(result.rows[1].first_name).toBe("inject");
  });

  it("rejects CSV exceeding 500 rows", () => {
    const header = "first_name,last_name";
    const dataRows = Array.from(
      { length: 501 },
      (_, i) => `Guest${i},Last${i}`,
    );
    const csv = [header, ...dataRows].join("\n");

    const result = parseCsvGuests(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(0);
    expect(result.errors[0].message).toMatch(/500/);
  });

  it("handles empty CSV body (header only)", () => {
    const csv = `first_name,last_name`;
    const result = parseCsvGuests(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects rows with invalid email", () => {
    const csv = `first_name,last_name,email\nAlice,Smith,not-an-email`;
    const result = parseCsvGuests(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].message).toContain("email");
  });

  it("rejects rows with invalid side value", () => {
    const csv = `first_name,last_name,side\nAlice,Smith,groom_side`;
    const result = parseCsvGuests(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].message).toContain("side");
  });

  it("rejects invalid dietary tags instead of silently dropping them", () => {
    const csv = `first_name,last_name,dietary_tags\nAlice,Smith,"vegan,not_a_real_tag"`;
    const result = parseCsvGuests(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].message).toContain("dietary_tags");
    expect(result.errors[0].message).toContain("not_a_real_tag");
  });

  it("rejects duplicate dietary tags", () => {
    const csv = `first_name,last_name,dietary_tags\nAlice,Smith,"vegan,vegan"`;
    const result = parseCsvGuests(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Dietary tags must be unique");
  });

  it("handles missing optional columns gracefully", () => {
    const csv = `first_name,last_name\nAlice,Smith`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].email).toBeUndefined();
    expect(result.rows[0].phone).toBeUndefined();
    expect(result.rows[0].side).toBeUndefined();
    expect(result.rows[0].group_name).toBeUndefined();
    expect(result.rows[0].dietary_tags).toBeUndefined();
    expect(result.rows[0].dietary_notes).toBeUndefined();
  });

  it("handles quoted fields containing commas", () => {
    const csv = `first_name,last_name,group_name\nAlice,Smith,"Smith, Jr. Family"`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].group_name).toBe("Smith, Jr. Family");
  });

  it("handles escaped quotes inside quoted fields", () => {
    const csv = `first_name,last_name,dietary_notes\nAlice,Smith,"He said ""no nuts"""`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].dietary_notes).toBe('He said "no nuts"');
  });

  it("handles CRLF line endings", () => {
    const csv = `first_name,last_name\r\nAlice,Smith\r\nBob,Jones`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
  });

  it("skips completely empty lines", () => {
    const csv = `first_name,last_name\nAlice,Smith\n\nBob,Jones`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
  });

  it("rejects CSV with entirely blank first_name after sanitization", () => {
    const csv = `first_name,last_name\n===,Smith`;
    const result = parseCsvGuests(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("handles valid side values: partner1, partner2, mutual", () => {
    const csv = `first_name,last_name,side\nAlice,Smith,partner1\nBob,Jones,partner2\nCarol,Williams,mutual`;
    const result = parseCsvGuests(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);
  });

  it("handles data row with fewer columns than header (missing trailing cells)", () => {
    // Row has first_name and last_name but header also has email and side
    // Missing cells should be treated as empty/undefined
    const csv = `first_name,last_name,email,side\nAlice,Smith`;
    const result = parseCsvGuests(csv);

    // first_name and last_name are present and valid; email/side are missing (undefined)
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].first_name).toBe("Alice");
    expect(result.rows[0].email).toBeUndefined();
    expect(result.rows[0].side).toBeUndefined();
  });
});
