import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { CrmFeedbackWidget } from "../../src/components/crm-feedback-widget";

const DEFAULT_LOADER = "https://widgets.ventoralabs.com/w/v1.js";

describe("CrmFeedbackWidget", () => {
  beforeEach(() => {
    // Remove any scripts injected by previous tests
    document
      .querySelectorAll('script[data-widget="feedback-button"]')
      .forEach((s) => s.remove());
    vi.unstubAllEnvs();
  });

  it("injects nothing when VITE_CRM_WIDGET_KEY is not set", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "");
    render(<CrmFeedbackWidget />);
    expect(
      document.querySelector('script[data-widget="feedback-button"]'),
    ).toBeNull();
  });

  it("injects a script tag with the correct src when key is set", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_test123");
    vi.stubEnv("VITE_CRM_LOADER_URL", "");
    render(<CrmFeedbackWidget />);
    const script = document.querySelector(
      'script[data-product="wk_test123"][data-widget="feedback-button"]',
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script?.src).toBe(DEFAULT_LOADER);
  });

  it("uses a custom loader URL when VITE_CRM_LOADER_URL is set", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_test456");
    vi.stubEnv("VITE_CRM_LOADER_URL", "https://custom.example.com/w/v1.js");
    render(<CrmFeedbackWidget />);
    const script = document.querySelector(
      'script[data-product="wk_test456"][data-widget="feedback-button"]',
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script?.src).toBe("https://custom.example.com/w/v1.js");
  });

  it("sets data-product to the widget key", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_mykey");
    render(<CrmFeedbackWidget />);
    const script = document.querySelector(
      'script[data-widget="feedback-button"]',
    );
    expect(script?.getAttribute("data-product")).toBe("wk_mykey");
  });

  it("sets data-widget to feedback-button", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_datawidget");
    render(<CrmFeedbackWidget />);
    const script = document.querySelector(
      'script[data-product="wk_datawidget"]',
    );
    expect(script?.getAttribute("data-widget")).toBe("feedback-button");
  });

  it("does not inject a duplicate script when already present", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_dedup");
    render(<CrmFeedbackWidget />);
    render(<CrmFeedbackWidget />);
    const scripts = document.querySelectorAll(
      'script[data-product="wk_dedup"][data-widget="feedback-button"]',
    );
    expect(scripts.length).toBe(1);
  });

  it("removes the script when unmounted", () => {
    vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_unmount");
    const { unmount } = render(<CrmFeedbackWidget />);
    expect(
      document.querySelector('script[data-product="wk_unmount"]'),
    ).not.toBeNull();
    unmount();
    expect(
      document.querySelector('script[data-product="wk_unmount"]'),
    ).toBeNull();
  });
});
