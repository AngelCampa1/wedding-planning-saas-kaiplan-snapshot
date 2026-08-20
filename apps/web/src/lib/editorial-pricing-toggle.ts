/**
 * Editorial pricing tab pair (Wave 2).
 *
 * The new pricing spread renders a hairline tab pair (Monthly /
 * Annually) instead of an on/off switch. This module wires the pair up
 * so that toggling it:
 *   - flips `aria-pressed` on each tab
 *   - rewrites the displayed price for every `[data-monthly-price]` cell
 *   - rewrites every `[data-cta-monthly-href]` anchor to its annual href
 *   - mutates the URL with `?interval=year` so analytics keep working
 *     with the same query-param mechanic the legacy toggle used.
 *
 * Reads the initial state from the `interval` query-param so that
 * deep-links (e.g. `/?interval=year`) land already on the annual view.
 */

export interface EditorialPricingToggleElements {
  monthly: HTMLButtonElement;
  annual: HTMLButtonElement;
  priceCells: HTMLElement[];
  ctaAnchors: HTMLAnchorElement[];
  /**
   * Optional URL setter. Provided for tests so we can assert the URL
   * mutation without touching `window.history`.
   */
  setIntervalParam?: (interval: "month" | "year") => void;
}

export type Cleanup = () => void;

function defaultSetIntervalParam(interval: "month" | "year"): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (interval === "year") {
    url.searchParams.set("interval", "year");
  } else {
    url.searchParams.delete("interval");
  }
  window.history.replaceState({}, "", url.toString());
}

function updatePriceCell(cell: HTMLElement, interval: "month" | "year"): void {
  const isAnnual = interval === "year";
  const monthlyPrice = cell.dataset.monthlyPrice ?? "";
  const annualPrice = cell.dataset.annualPrice ?? monthlyPrice;
  const currentPrice = isAnnual ? annualPrice : monthlyPrice;
  const originalPrice = isAnnual
    ? (cell.dataset.annualOriginalPrice ?? cell.dataset.monthlyOriginalPrice)
    : cell.dataset.monthlyOriginalPrice;
  const detail = isAnnual
    ? (cell.dataset.annualDetail ?? cell.dataset.monthlyDetail)
    : cell.dataset.monthlyDetail;

  const currentNode = cell.querySelector<HTMLElement>("[data-price-current]");
  if (!currentNode) {
    cell.textContent = currentPrice;
    return;
  }

  currentNode.textContent = currentPrice;

  const originalNode = cell.querySelector<HTMLElement>("[data-price-original]");
  if (originalNode && originalPrice !== undefined) {
    originalNode.textContent = originalPrice;
  }

  const detailNode = cell.querySelector<HTMLElement>("[data-price-detail]");
  if (detailNode && detail !== undefined) {
    detailNode.textContent = detail;
  }
}

export function applyPricingInterval(
  interval: "month" | "year",
  elements: EditorialPricingToggleElements,
  options: { updateUrl?: boolean } = {},
): void {
  const { monthly, annual, priceCells, ctaAnchors, setIntervalParam } =
    elements;
  const isAnnual = interval === "year";

  monthly.setAttribute("aria-pressed", isAnnual ? "false" : "true");
  annual.setAttribute("aria-pressed", isAnnual ? "true" : "false");

  for (const cell of priceCells) {
    updatePriceCell(cell, interval);
  }

  for (const anchor of ctaAnchors) {
    const monthlyHref = anchor.dataset.ctaMonthlyHref ?? anchor.href;
    const annualHref = anchor.dataset.ctaAnnualHref ?? monthlyHref;
    anchor.href = isAnnual ? annualHref : monthlyHref;
  }

  if (options.updateUrl ?? true) {
    (setIntervalParam ?? defaultSetIntervalParam)(interval);
  }
}

export function readInitialInterval(search: string): "month" | "year" {
  const params = new URLSearchParams(search);
  return params.get("interval") === "month" ? "month" : "year";
}

export function initEditorialPricingToggle(
  elements: EditorialPricingToggleElements,
  initialInterval: "month" | "year" = "year",
): Cleanup {
  const { monthly, annual } = elements;

  applyPricingInterval(initialInterval, elements, { updateUrl: false });

  const onMonthly = () =>
    applyPricingInterval("month", elements, { updateUrl: true });
  const onAnnual = () =>
    applyPricingInterval("year", elements, { updateUrl: true });

  monthly.addEventListener("click", onMonthly);
  annual.addEventListener("click", onAnnual);

  return () => {
    monthly.removeEventListener("click", onMonthly);
    annual.removeEventListener("click", onAnnual);
  };
}
