export type StickyMobileCtaAction = "link";

export interface StickyMobileCtaRenderState {
  action: StickyMobileCtaAction;
  showLink: boolean;
  interceptsLinkClicks: boolean;
}

export interface StickyMobileCtaVisibilityState {
  heroIntersecting: boolean;
  footerIntersecting: boolean;
}

export interface StickyMobileCtaSpacerState {
  isVisible: boolean;
  barHeight: number;
}

export function getStickyMobileCtaRenderState(
  action?: StickyMobileCtaAction,
): StickyMobileCtaRenderState {
  const resolvedAction: StickyMobileCtaAction =
    action === "link" ? "link" : "link";

  return {
    action: resolvedAction,
    showLink: true,
    interceptsLinkClicks: false,
  };
}

export function shouldShowStickyMobileCta({
  heroIntersecting,
  footerIntersecting,
}: StickyMobileCtaVisibilityState): boolean {
  return !heroIntersecting && !footerIntersecting;
}

export function getStickyMobileCtaSpacerHeight({
  isVisible,
  barHeight,
}: StickyMobileCtaSpacerState): number {
  if (!isVisible) {
    return 0;
  }

  return Math.max(0, barHeight);
}
