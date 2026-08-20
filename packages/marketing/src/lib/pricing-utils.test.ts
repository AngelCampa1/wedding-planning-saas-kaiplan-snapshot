import { describe, it, expect } from "vitest";
import {
  formatAnnualPrice,
  formatAnnualMonthlyEquivalent,
} from "./pricing-utils";

describe("formatAnnualPrice", () => {
  it("returns $490/yr for 4900 cents", () => {
    expect(formatAnnualPrice(4900)).toBe("$490/yr");
  });

  it("returns $200/yr for 2000 cents", () => {
    expect(formatAnnualPrice(2000)).toBe("$200/yr");
  });

  it("returns $990/yr for 9900 cents", () => {
    expect(formatAnnualPrice(9900)).toBe("$990/yr");
  });

  it("returns $29.90/yr for 299 cents", () => {
    expect(formatAnnualPrice(299)).toBe("$29.90/yr");
  });

  it("returns $0/yr for 0 cents", () => {
    expect(formatAnnualPrice(0)).toBe("$0/yr");
  });

  it("returns $490/user/yr for 4900 cents with /user unitLabel", () => {
    expect(formatAnnualPrice(4900, "/user")).toBe("$490/user/yr");
  });

  it("returns $29.90/child/yr for 299 cents with /child unitLabel", () => {
    expect(formatAnnualPrice(299, "/child")).toBe("$29.90/child/yr");
  });

  it("returns $129.90/yr for 1299 cents", () => {
    expect(formatAnnualPrice(1299)).toBe("$129.90/yr");
  });

  it("returns $70/yr for 700 cents", () => {
    expect(formatAnnualPrice(700)).toBe("$70/yr");
  });

  it("returns $120/yr for 1200 cents", () => {
    expect(formatAnnualPrice(1200)).toBe("$120/yr");
  });

  it("returns $90/yr for 900 cents", () => {
    expect(formatAnnualPrice(900)).toBe("$90/yr");
  });
});

describe("formatAnnualMonthlyEquivalent", () => {
  it("returns ~$40.83/mo for 4900 cents", () => {
    expect(formatAnnualMonthlyEquivalent(4900)).toBe("~$40.83/mo");
  });

  it("returns ~$16.67/mo for 2000 cents", () => {
    expect(formatAnnualMonthlyEquivalent(2000)).toBe("~$16.67/mo");
  });

  it("returns ~$82.50/mo for 9900 cents", () => {
    expect(formatAnnualMonthlyEquivalent(9900)).toBe("~$82.50/mo");
  });

  it("returns ~$10/mo for 1200 cents (exact whole dollar)", () => {
    expect(formatAnnualMonthlyEquivalent(1200)).toBe("~$10/mo");
  });

  it("returns ~$40.83/user/mo for 4900 cents with /user unitLabel", () => {
    expect(formatAnnualMonthlyEquivalent(4900, "/user")).toBe(
      "~$40.83/user/mo",
    );
  });
});
