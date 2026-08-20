import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement ResizeObserver; provide a no-op stub so Radix UI
// components that call it (e.g. Tooltip, Popover) don't crash in tests.
if (typeof ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserverStub;
}

afterEach(() => {
  cleanup();
});
