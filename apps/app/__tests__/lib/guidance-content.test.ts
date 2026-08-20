import { describe, expect, it } from "vitest";
import { appHelpKnowledgeBundle } from "@kaiplan/knowledge/bundles";
import {
  getHelpControl,
  getHelpTopic,
  getTourDefinition,
  helpControls,
  helpTopics,
  tourDefinitions,
} from "../../src/lib/guidance-content";

describe("guidance content", () => {
  it("re-exports canonical app guidance from the knowledge package", () => {
    expect(helpControls).toBe(appHelpKnowledgeBundle.helpControls);
    expect(helpTopics).toBe(appHelpKnowledgeBundle.helpTopics);
    expect(tourDefinitions).toBe(appHelpKnowledgeBundle.tourDefinitions);
  });

  it("covers the planned product areas with route-backed topics", () => {
    expect(helpTopics.map((topic) => topic.id)).toEqual([
      "just-starting",
      "getting-started",
      "spreadsheets",
      "guests-rsvp",
      "budget-vendors",
      "worried-budget",
      "seating",
      "website",
      "account-safety",
    ]);

    for (const topic of helpTopics) {
      expect(topic.title).toBeTruthy();
      expect(topic.summary.length).toBeGreaterThan(30);
      expect(topic.route).toMatch(/^\//);
      expect(topic.steps.length).toBeGreaterThanOrEqual(3);
      expect(topic.controls.length).toBeGreaterThan(0);
    }
  });

  it("provides layered guidance metadata for low-tech users", () => {
    for (const control of helpControls) {
      expect(control.tooltip, `${control.key} needs tooltip copy`).toBeTruthy();
      expect(control.tooltip!.length).toBeLessThanOrEqual(96);
      expect(control.body.length).toBeGreaterThan(control.tooltip!.length);
    }

    expect(getHelpControl("guests-import")).toMatchObject({
      tone: "info",
      why: expect.stringContaining("spreadsheet"),
      nextAction: expect.stringContaining("CSV"),
    });
    expect(getHelpControl("website-publish")).toMatchObject({
      tone: "safety",
      why: expect.stringContaining("guests"),
    });
    expect(getHelpControl("settings-archive")).toMatchObject({
      tone: "safety",
      nextAction: expect.stringContaining("Export"),
    });
  });

  it("includes task-first help topics for common user questions", () => {
    expect(helpTopics.map((topic) => topic.id)).toEqual(
      expect.arrayContaining(["just-starting", "worried-budget", "website"]),
    );

    expect(getHelpTopic("just-starting")?.summary).toContain("first");
    expect(getHelpTopic("worried-budget")?.controls).toContain(
      "budget-summary",
    );
    expect(getHelpTopic("website")?.steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Save draft"),
        expect.stringContaining("Publish live"),
      ]),
    );
    expect(getHelpTopic("website")?.controls).toContain("website-publish");
  });

  it("keeps every referenced control resolvable", () => {
    const keys = new Set(helpControls.map((control) => control.key));

    for (const topic of helpTopics) {
      for (const key of topic.controls) {
        expect(keys.has(key), `${topic.id} references ${key}`).toBe(true);
      }
    }

    for (const tour of tourDefinitions) {
      for (const step of tour.steps) {
        if (step.targetKey) {
          expect(
            keys.has(step.targetKey),
            `${tour.id} targets ${step.targetKey}`,
          ).toBe(true);
        }
      }
    }
  });

  it("exposes lookup helpers for routes, controls, and tours", () => {
    expect(getHelpControl("guests-import")?.body).toContain("CSV");
    expect(getHelpTopic("website")?.route).toBe("/website");
    expect(getTourDefinition("dashboard")?.steps.length).toBeGreaterThan(5);

    expect(getHelpControl("missing")).toBeNull();
    expect(getHelpTopic("missing")).toBeNull();
    expect(getTourDefinition("missing")).toBeNull();
  });
});
