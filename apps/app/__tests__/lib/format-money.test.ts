import { describe, it, expect } from "vitest";
import {
  formatMoney,
  centsToDollars,
  dollarsToCents,
} from "../../src/lib/format-money";

describe("formatMoney", () => {
  it("formats cents to dollars", () => {
    expect(formatMoney(500000, "USD")).toBe("$5,000.00");
  });
  it("formats zero", () => {
    expect(formatMoney(0, "USD")).toBe("$0.00");
  });
  it("formats fractional", () => {
    expect(formatMoney(420050, "USD")).toBe("$4,200.50");
  });
  it("formats single cent", () => {
    expect(formatMoney(1, "USD")).toBe("$0.01");
  });
  it("formats large", () => {
    expect(formatMoney(999999999, "USD")).toBe("$9,999,999.99");
  });
  it("defaults to USD", () => {
    expect(formatMoney(100)).toBe("$1.00");
  });
  it("formats EUR", () => {
    expect(formatMoney(500000, "EUR")).toContain("5,000");
  });
});

describe("centsToDollars", () => {
  it("converts cents to dollar string", () => {
    expect(centsToDollars(500000)).toBe("5000.00");
  });

  it("converts zero", () => {
    expect(centsToDollars(0)).toBe("0.00");
  });

  it("converts fractional cents", () => {
    expect(centsToDollars(199)).toBe("1.99");
  });

  it("converts single cent", () => {
    expect(centsToDollars(1)).toBe("0.01");
  });
});

describe("dollarsToCents", () => {
  it("converts dollar string to cents", () => {
    expect(dollarsToCents("50.00")).toBe(5000);
  });

  it("converts zero", () => {
    expect(dollarsToCents("0")).toBe(0);
  });

  it("returns 0 for NaN input", () => {
    expect(dollarsToCents("")).toBe(0);
    expect(dollarsToCents("abc")).toBe(0);
  });

  it("rounds to nearest cent", () => {
    expect(dollarsToCents("19.999")).toBe(2000);
  });

  it("handles whole dollar amounts", () => {
    expect(dollarsToCents("100")).toBe(10000);
  });
});
