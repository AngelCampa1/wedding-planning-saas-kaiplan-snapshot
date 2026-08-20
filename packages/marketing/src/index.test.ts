import { describe, expect, it } from "vitest";
import * as ui from "./index";

describe("ui package exports", () => {
  it("re-exports the main runtime entry points", () => {
    expect(ui.EmailCapture).toBeTypeOf("function");
    expect(ui.PostSignupSurvey).toBeTypeOf("function");
    expect(ui.FakeDoorPricing).toBeTypeOf("function");
    expect(ui.buildFooterEmailCaptureProps).toBeTypeOf("function");
    expect(ui.trackEvent).toBeTypeOf("function");
  });
});
