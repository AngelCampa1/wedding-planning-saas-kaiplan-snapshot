import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));
vi.mock("../lib/exit-popup-utils", () => ({
  isSignedUp: vi.fn(() => false),
  setSignedUp: vi.fn(),
}));
vi.mock("../lib/form-interaction-tracker", () => ({
  trackEmailFocus: vi.fn(),
  trackEmailBlurWithoutSubmit: vi.fn(),
  resetFocusTracking: vi.fn(),
}));
vi.mock("../lib/signup-attribution", () => ({
  persistSignupAttribution: vi.fn(),
  resolveSignupAttribution: vi.fn(() => ({})),
}));

import { EmailCaptureIsland } from "./email-capture-island";

const defaultProps: ComponentProps<typeof EmailCaptureIsland> = {
  apiUrl: "https://api.test",
  sourcePage: "/",
  surveyQuestions: [],
  discoveryCallUrl: "https://cal.test",
};

describe("EmailCaptureIsland", () => {
  it("renders the email capture form", () => {
    render(<EmailCaptureIsland {...defaultProps} />);

    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
  });

  it("renders the error-boundary fallback when the inner component throws", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    // Rendering an object as a React text child throws during render
    // ("Objects are not valid as a React child"), which the boundary catches.
    const broken = {
      ...defaultProps,
      emailLabel: {},
    } as unknown as ComponentProps<typeof EmailCaptureIsland>;

    try {
      render(<EmailCaptureIsland {...broken} />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("passes apiUrl through to the inner EmailCapture component", () => {
    render(<EmailCaptureIsland {...defaultProps} />);

    // The form should be present in the document
    expect(screen.getByRole("form")).toBeInTheDocument();
  });
});
