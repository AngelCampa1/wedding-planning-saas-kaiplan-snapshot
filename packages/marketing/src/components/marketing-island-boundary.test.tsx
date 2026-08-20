import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketingIslandBoundary } from "./marketing-island-boundary";

const { captureExceptionMock, reloadMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  reloadMock: vi.fn(),
}));

vi.mock("../lib/sentry-client", () => ({
  captureException: (error: unknown) => captureExceptionMock(error),
}));

function ThrowingWidget(): never {
  throw new Error("kaboom");
}

describe("MarketingIslandBoundary", () => {
  it("renders a generic fallback and reports the error when a child crashes", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      render(
        <MarketingIslandBoundary sectionName="Signup form">
          <ThrowingWidget />
        </MarketingIslandBoundary>,
      );

      expect(
        screen.getByRole("heading", {
          name: "Interactive section unavailable",
        }),
      ).toBeTruthy();
      expect(
        screen.getByText(
          "Signup form hit a problem before it could load. Refresh the page to try again.",
        ),
      ).toBeTruthy();
      expect(screen.queryByText("kaboom")).toBeNull();
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error));
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("refreshes the page from the fallback action", () => {
    const originalWindow = window;
    const fakeWindow = Object.create(window) as Window & typeof globalThis;

    Object.defineProperty(fakeWindow, "location", {
      configurable: true,
      value: { reload: reloadMock },
    });

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: fakeWindow,
    });

    render(
      <MarketingIslandBoundary>
        <button type="button">Still works</button>
      </MarketingIslandBoundary>,
    );

    // Force the fallback path for the action behavior check.
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      render(
        <MarketingIslandBoundary>
          <ThrowingWidget />
        </MarketingIslandBoundary>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Refresh page" }));
      expect(reloadMock).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
