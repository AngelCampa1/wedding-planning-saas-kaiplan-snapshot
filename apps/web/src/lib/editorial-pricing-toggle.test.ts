/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPricingInterval,
  initEditorialPricingToggle,
  readInitialInterval,
  type EditorialPricingToggleElements,
} from "./editorial-pricing-toggle";

function buildElements(): {
  elements: EditorialPricingToggleElements;
  setIntervalSpy: ReturnType<typeof vi.fn>;
} {
  const monthly = document.createElement("button");
  monthly.type = "button";
  monthly.setAttribute("aria-pressed", "true");
  monthly.textContent = "Monthly";

  const annual = document.createElement("button");
  annual.type = "button";
  annual.setAttribute("aria-pressed", "false");
  annual.textContent = "Annually";

  const priceCell = document.createElement("p");
  priceCell.dataset.monthlyPrice = "$20/mo";
  priceCell.dataset.annualPrice = "$200/yr";
  priceCell.textContent = "$20/mo";

  const priceCellNoAnnual = document.createElement("p");
  priceCellNoAnnual.dataset.monthlyPrice = "$100 one-time";
  priceCellNoAnnual.textContent = "$100 one-time";

  const ctaAnchor = document.createElement("a");
  ctaAnchor.href = "https://my.kaiplan.app/signup?plan=starter";
  ctaAnchor.dataset.ctaMonthlyHref =
    "https://my.kaiplan.app/signup?plan=starter";
  ctaAnchor.dataset.ctaAnnualHref =
    "https://my.kaiplan.app/signup?plan=starter&interval=year";

  const ctaAnchorNoAnnual = document.createElement("a");
  ctaAnchorNoAnnual.href = "https://my.kaiplan.app/signup?plan=lifetime";

  document.body.append(
    monthly,
    annual,
    priceCell,
    priceCellNoAnnual,
    ctaAnchor,
    ctaAnchorNoAnnual,
  );

  const setIntervalSpy = vi.fn();

  return {
    setIntervalSpy,
    elements: {
      monthly,
      annual,
      priceCells: [priceCell, priceCellNoAnnual],
      ctaAnchors: [ctaAnchor, ctaAnchorNoAnnual],
      setIntervalParam: setIntervalSpy,
    },
  };
}

describe("readInitialInterval", () => {
  it("returns 'year' when interval=year is in the search", () => {
    expect(readInitialInterval("?interval=year")).toBe("year");
  });

  it("returns 'year' when interval is missing (annual is the default)", () => {
    expect(readInitialInterval("")).toBe("year");
  });

  it("returns 'month' when interval=month is explicitly set", () => {
    expect(readInitialInterval("?interval=month")).toBe("month");
  });

  it("returns 'year' when interval has an unrecognised value", () => {
    expect(readInitialInterval("?interval=quarter")).toBe("year");
  });
});

describe("applyPricingInterval", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("rewrites prices, CTAs, and aria-pressed to the annual view", () => {
    const { elements, setIntervalSpy } = buildElements();
    applyPricingInterval("year", elements);

    expect(elements.monthly.getAttribute("aria-pressed")).toBe("false");
    expect(elements.annual.getAttribute("aria-pressed")).toBe("true");
    expect(elements.priceCells[0]!.textContent).toBe("$200/yr");
    expect(elements.priceCells[1]!.textContent).toBe("$100 one-time");
    expect(elements.ctaAnchors[0]!.href).toBe(
      "https://my.kaiplan.app/signup?plan=starter&interval=year",
    );
    expect(elements.ctaAnchors[1]!.href).toContain(
      "https://my.kaiplan.app/signup?plan=lifetime",
    );
    expect(setIntervalSpy).toHaveBeenCalledWith("year");
  });

  it("updates nested price labels without removing strikethrough markup", () => {
    const { elements } = buildElements();
    const priceCell = elements.priceCells[0]!;
    priceCell.innerHTML = `
      <span data-price-original>$24/mo</span>
      <span data-price-current>$20/mo</span>
      <span data-price-detail>billed monthly</span>
    `;
    priceCell.dataset.monthlyOriginalPrice = "$24/mo";
    priceCell.dataset.annualOriginalPrice = "$20/mo";
    priceCell.dataset.monthlyPrice = "$20/mo";
    priceCell.dataset.annualPrice = "$16.67/mo";
    priceCell.dataset.monthlyDetail = "billed monthly";
    priceCell.dataset.annualDetail = "billed annually - $200/yr";

    applyPricingInterval("year", elements);

    expect(priceCell.querySelector("[data-price-original]")?.textContent).toBe(
      "$20/mo",
    );
    expect(priceCell.querySelector("[data-price-current]")?.textContent).toBe(
      "$16.67/mo",
    );
    expect(priceCell.querySelector("[data-price-detail]")?.textContent).toBe(
      "billed annually - $200/yr",
    );
    expect(priceCell.querySelector("[data-price-original]")).not.toBeNull();

    applyPricingInterval("month", elements);

    expect(priceCell.querySelector("[data-price-original]")?.textContent).toBe(
      "$24/mo",
    );
    expect(priceCell.querySelector("[data-price-current]")?.textContent).toBe(
      "$20/mo",
    );
    expect(priceCell.querySelector("[data-price-detail]")?.textContent).toBe(
      "billed monthly",
    );
  });

  it("restores monthly view from annual state", () => {
    const { elements, setIntervalSpy } = buildElements();
    applyPricingInterval("year", elements);
    applyPricingInterval("month", elements);

    expect(elements.monthly.getAttribute("aria-pressed")).toBe("true");
    expect(elements.annual.getAttribute("aria-pressed")).toBe("false");
    expect(elements.priceCells[0]!.textContent).toBe("$20/mo");
    expect(elements.ctaAnchors[0]!.href).toBe(
      "https://my.kaiplan.app/signup?plan=starter",
    );
    expect(setIntervalSpy).toHaveBeenLastCalledWith("month");
  });

  it("falls back to empty string when a price cell has no monthlyPrice dataset", () => {
    const { elements, setIntervalSpy } = buildElements();
    const bareCell = document.createElement("p");
    // intentionally no data-monthly-price / data-annual-price
    bareCell.textContent = "placeholder";
    elements.priceCells.push(bareCell);

    applyPricingInterval("year", elements);
    expect(bareCell.textContent).toBe("");
    applyPricingInterval("month", elements);
    expect(bareCell.textContent).toBe("");
    expect(setIntervalSpy).toHaveBeenLastCalledWith("month");
  });

  it("skips overwriting original-price and detail nodes when the data attributes are absent", () => {
    const { elements } = buildElements();
    const priceCell = elements.priceCells[0]!;
    // Cell has [data-price-current] and [data-price-original]/[data-price-detail]
    // nodes, but only the annual data attributes are set — so switching to
    // monthly leaves originalPrice and detail as undefined.
    priceCell.innerHTML = `
      <span data-price-original>$200/yr</span>
      <span data-price-current>$16.67/mo</span>
      <span data-price-detail>billed annually</span>
    `;
    priceCell.dataset.annualOriginalPrice = "$200/yr";
    priceCell.dataset.annualPrice = "$16.67/mo";
    priceCell.dataset.annualDetail = "billed annually";
    // Intentionally no data-monthly-original-price, data-monthly-price, or
    // data-monthly-detail so the false branches at lines 63 and 68 are hit.
    delete priceCell.dataset.monthlyOriginalPrice;
    delete priceCell.dataset.monthlyDetail;
    priceCell.dataset.monthlyPrice = "$20/mo";

    applyPricingInterval("month", elements);

    // [data-price-original] and [data-price-detail] must not be overwritten.
    expect(priceCell.querySelector("[data-price-original]")?.textContent).toBe(
      "$200/yr",
    );
    expect(priceCell.querySelector("[data-price-detail]")?.textContent).toBe(
      "billed annually",
    );
    // [data-price-current] must update to the monthly price.
    expect(priceCell.querySelector("[data-price-current]")?.textContent).toBe(
      "$20/mo",
    );
  });

  it("falls back to anchor.href when a CTA has no monthly dataset", () => {
    const { elements } = buildElements();
    const bareAnchor = document.createElement("a");
    bareAnchor.href = "https://my.kaiplan.app/signup?plan=fallback";
    // intentionally no data-cta-monthly-href / data-cta-annual-href
    elements.ctaAnchors.push(bareAnchor);

    applyPricingInterval("year", elements);
    expect(bareAnchor.href).toContain("plan=fallback");
  });

  it("uses defaultSetIntervalParam when no override is supplied", () => {
    const { elements } = buildElements();
    delete (elements as { setIntervalParam?: unknown }).setIntervalParam;

    const initialUrl = "https://kaiplan.app/?utm=test";
    Object.defineProperty(window, "location", {
      value: new URL(initialUrl),
      writable: true,
    });
    const replaceStateSpy = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {});

    applyPricingInterval("year", elements);
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(String(replaceStateSpy.mock.calls[0]![2])).toContain(
      "interval=year",
    );

    applyPricingInterval("month", elements);
    expect(String(replaceStateSpy.mock.calls[1]![2])).not.toContain(
      "interval=year",
    );

    replaceStateSpy.mockRestore();
  });

  it("defaultSetIntervalParam is a no-op in non-browser environments", () => {
    // Simulate SSR by temporarily removing window for the duration of the
    // call. We restore it immediately after so subsequent tests still see
    // the jsdom window.
    const { elements } = buildElements();
    delete (elements as { setIntervalParam?: unknown }).setIntervalParam;

    const originalWindow = globalThis.window;
    delete (globalThis as { window?: unknown }).window;
    expect(() => applyPricingInterval("year", elements)).not.toThrow();
    (globalThis as { window?: unknown }).window = originalWindow;
  });
});

describe("initEditorialPricingToggle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("applies initial interval and toggles on click", () => {
    const { elements, setIntervalSpy } = buildElements();
    const cleanup = initEditorialPricingToggle(elements, "month");
    expect(setIntervalSpy).not.toHaveBeenCalled();

    elements.annual.click();
    expect(elements.annual.getAttribute("aria-pressed")).toBe("true");
    expect(setIntervalSpy).toHaveBeenLastCalledWith("year");

    elements.monthly.click();
    expect(elements.monthly.getAttribute("aria-pressed")).toBe("true");
    expect(setIntervalSpy).toHaveBeenLastCalledWith("month");

    cleanup();
  });

  it("respects the initial annual deep-link", () => {
    const { elements } = buildElements();
    const cleanup = initEditorialPricingToggle(elements, "year");
    expect(elements.annual.getAttribute("aria-pressed")).toBe("true");
    expect(elements.priceCells[0]!.textContent).toBe("$200/yr");
    cleanup();
  });

  it("defaults to annual when no interval is supplied", () => {
    const { elements } = buildElements();
    const cleanup = initEditorialPricingToggle(elements);
    expect(elements.annual.getAttribute("aria-pressed")).toBe("true");
    expect(elements.monthly.getAttribute("aria-pressed")).toBe("false");
    expect(elements.priceCells[0]!.textContent).toBe("$200/yr");
    cleanup();
  });

  it("does not mutate the URL while applying the initial default interval", () => {
    const { elements, setIntervalSpy } = buildElements();
    const cleanup = initEditorialPricingToggle(elements, "year");

    expect(setIntervalSpy).not.toHaveBeenCalled();

    cleanup();
  });

  it("removes click listeners on cleanup", () => {
    const { elements, setIntervalSpy } = buildElements();
    const cleanup = initEditorialPricingToggle(elements, "month");
    setIntervalSpy.mockClear();
    cleanup();

    elements.annual.click();
    elements.monthly.click();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
