import { describe, it, expect } from "vitest";
import type { SiteConfig } from "./types";

describe("SiteConfig.theme.dark", () => {
  it("accepts a config with all dark sub-fields populated", () => {
    const config = {
      theme: {
        primary: "#6366f1",
        accent: "#8b5cf6",
        dark: {
          surface: "#0f172a",
          surfaceSecondary: "#1e293b",
          text: "#f1f5f9",
          muted: "#94a3b8",
        },
        fonts: { heading: "Inter", body: "Inter" },
      },
    } satisfies Pick<SiteConfig, "theme">;

    expect(config.theme.dark?.surface).toBe("#0f172a");
    expect(config.theme.dark?.surfaceSecondary).toBe("#1e293b");
    expect(config.theme.dark?.text).toBe("#f1f5f9");
    expect(config.theme.dark?.muted).toBe("#94a3b8");
  });

  it("accepts a config without the dark sub-object (field is optional)", () => {
    const config = {
      theme: {
        primary: "#6366f1",
        accent: "#8b5cf6",
        fonts: { heading: "Inter", body: "Inter" },
      },
    } satisfies Pick<SiteConfig, "theme">;

    const theme: SiteConfig["theme"] = config.theme;
    expect(theme.dark).toBeUndefined();
  });

  it("accepts a config with only some dark sub-fields set", () => {
    const config = {
      theme: {
        primary: "#6366f1",
        accent: "#8b5cf6",
        dark: {
          surface: "#0f172a",
        },
        fonts: { heading: "Inter", body: "Inter" },
      },
    } satisfies Pick<SiteConfig, "theme">;

    const dark: SiteConfig["theme"]["dark"] = config.theme.dark;
    expect(dark?.surface).toBe("#0f172a");
    expect(dark?.surfaceSecondary).toBeUndefined();
    expect(dark?.text).toBeUndefined();
    expect(dark?.muted).toBeUndefined();
  });
});

describe("SiteConfig.survey.qualification", () => {
  it("accepts a serializable qualification config", () => {
    const config = {
      survey: {
        questions: [
          {
            id: "segment",
            text: "Who are you?",
            options: ["Women 40+", "Other"],
          },
        ],
        qualification: {
          logic: "any",
          rules: [
            {
              questionId: "segment",
              answers: ["Women 40+"],
            },
          ],
        },
      },
    } satisfies Pick<SiteConfig, "survey">;

    expect(config.survey.qualification?.logic).toBe("any");
    expect(config.survey.qualification?.rules[0]?.questionId).toBe("segment");
  });
});
