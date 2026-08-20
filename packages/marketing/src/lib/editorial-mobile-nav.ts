/**
 * Editorial mobile-nav controller. Wires up an oversized italic overlay
 * that opens from the masthead hamburger, traps focus while open, locks
 * page scroll, and closes on link click, escape, or the close button.
 *
 * The overlay keeps the editorial aesthetic: full-bleed paper background,
 * oversized italic links, no hard chrome. This module is the JS twin of
 * the `.editorial-mobile-nav-*` styles in `editorial.css`.
 */

import { lockScroll, unlockScroll } from "./scroll-lock";

type Cleanup = () => void;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[hidden]") && getComputedStyle(el).display !== "none",
  );
}

function trapTab(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const focusable = getFocusable(container);
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

type HiddenSibling = {
  element: HTMLElement;
  ariaHidden: string | null;
  inert: boolean;
};

/**
 * Initialize the editorial mobile-nav overlay.
 *
 * `root` should be the wrapper element that contains both the trigger
 * button (`[data-editorial-nav-trigger]`), the close button
 * (`[data-editorial-nav-close]`), and the overlay element
 * (`[data-editorial-nav-overlay]`). The overlay is expected to start
 * hidden via the `hidden` attribute.
 */
export function initEditorialMobileNav(root: HTMLElement): Cleanup {
  const trigger = root.querySelector<HTMLButtonElement>(
    "[data-editorial-nav-trigger]",
  );
  const overlay = root.querySelector<HTMLElement>(
    "[data-editorial-nav-overlay]",
  );
  const close = root.querySelector<HTMLButtonElement>(
    "[data-editorial-nav-close]",
  );

  if (!trigger || !overlay) {
    return () => {};
  }

  const links = Array.from(
    overlay.querySelectorAll<HTMLAnchorElement>("a[href]"),
  );

  let isOpen = false;
  let isScrollLocked = false;
  let hiddenSiblings: HiddenSibling[] = [];

  const hidePageSiblings = () => {
    if (hiddenSiblings.length > 0) return;

    const bodyChildren = Array.from(document.body.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child !== root,
    );

    hiddenSiblings = bodyChildren.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: Boolean(element.inert),
    }));

    for (const { element } of hiddenSiblings) {
      element.setAttribute("aria-hidden", "true");
      element.inert = true;
    }
  };

  const restorePageSiblings = () => {
    for (const { element, ariaHidden, inert } of hiddenSiblings) {
      if (ariaHidden === null) {
        element.removeAttribute("aria-hidden");
      } else {
        element.setAttribute("aria-hidden", ariaHidden);
      }
      element.inert = inert;
    }
    hiddenSiblings = [];
  };

  const sync = () => {
    overlay.toggleAttribute("hidden", !isOpen);
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (isOpen && !isScrollLocked) {
      lockScroll();
      isScrollLocked = true;
      hidePageSiblings();
    } else if (!isOpen && isScrollLocked) {
      unlockScroll();
      isScrollLocked = false;
      restorePageSiblings();
    }
  };

  const open = () => {
    isOpen = true;
    sync();
    const target = close ?? links[0] ?? trigger;
    target.focus({ preventScroll: true });
  };

  const closeOverlay = () => {
    isOpen = false;
    sync();
    trigger.focus({ preventScroll: true });
  };

  const onTriggerClick = () => {
    if (isOpen) {
      closeOverlay();
    } else {
      open();
    }
  };

  const onCloseClick = () => {
    closeOverlay();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
      return;
    }
    trapTab(overlay, event);
  };

  const onLinkClick = () => {
    closeOverlay();
  };

  trigger.addEventListener("click", onTriggerClick);
  close?.addEventListener("click", onCloseClick);
  document.addEventListener("keydown", onKeyDown);
  links.forEach((link) => link.addEventListener("click", onLinkClick));

  sync();

  return () => {
    trigger.removeEventListener("click", onTriggerClick);
    close?.removeEventListener("click", onCloseClick);
    document.removeEventListener("keydown", onKeyDown);
    links.forEach((link) => link.removeEventListener("click", onLinkClick));
    if (isScrollLocked) {
      unlockScroll();
      isScrollLocked = false;
    }
    restorePageSiblings();
  };
}
