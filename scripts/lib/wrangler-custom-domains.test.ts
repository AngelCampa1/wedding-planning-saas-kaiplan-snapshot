import { describe, expect, it } from "vitest";
import {
  extractWorkerRoutes,
  mergeWorkerRoutes,
} from "./wrangler-custom-domains";

describe("extractWorkerRoutes", () => {
  it("returns an empty array when routes is absent", () => {
    expect(extractWorkerRoutes({})).toEqual([]);
  });

  it("returns an empty array when routes is not an array", () => {
    expect(extractWorkerRoutes({ routes: "kaiplan.app/*" })).toEqual([]);
  });

  it("filters out entries missing both zone_name and zone_id", () => {
    expect(
      extractWorkerRoutes({
        routes: [
          { pattern: "kaiplan.app/*", zone_name: "kaiplan.app" },
          { pattern: "missing-zone" },
          { zone_name: "kaiplan.app" },
          null,
          42,
        ],
      }),
    ).toEqual([{ pattern: "kaiplan.app/*", zone_name: "kaiplan.app" }]);
  });

  it("accepts custom domain route entries", () => {
    expect(
      extractWorkerRoutes({
        routes: [{ pattern: "kaiplan.app", custom_domain: true }],
      }),
    ).toEqual([{ pattern: "kaiplan.app", custom_domain: true }]);
  });

  it("rejects disabled custom domain route entries without a zone", () => {
    expect(
      extractWorkerRoutes({
        routes: [{ pattern: "kaiplan.app", custom_domain: false }],
      }),
    ).toEqual([]);
  });

  it("accepts entries with zone_id instead of zone_name", () => {
    expect(
      extractWorkerRoutes({
        routes: [{ pattern: "kaiplan.app/*", zone_id: "abc123" }],
      }),
    ).toEqual([{ pattern: "kaiplan.app/*", zone_id: "abc123" }]);
  });

  it("returns all valid route entries", () => {
    expect(
      extractWorkerRoutes({
        routes: [
          { pattern: "kaiplan.app/*", zone_name: "kaiplan.app" },
          { pattern: "www.kaiplan.app/*", zone_name: "kaiplan.app" },
          { pattern: "www.kaiplan.app", custom_domain: true },
        ],
      }),
    ).toEqual([
      { pattern: "kaiplan.app/*", zone_name: "kaiplan.app" },
      { pattern: "www.kaiplan.app/*", zone_name: "kaiplan.app" },
      { pattern: "www.kaiplan.app", custom_domain: true },
    ]);
  });
});

describe("mergeWorkerRoutes", () => {
  it("returns the original config unchanged when routes list is empty", () => {
    const config = { name: "kaiplan-web" };
    expect(mergeWorkerRoutes(config, [])).toBe(config);
  });

  it("injects routes into the generated config", () => {
    expect(
      mergeWorkerRoutes({ name: "kaiplan-web" }, [
        { pattern: "kaiplan.app/*", zone_name: "kaiplan.app" },
        { pattern: "www.kaiplan.app/*", zone_name: "kaiplan.app" },
        { pattern: "www.kaiplan.app", custom_domain: true },
      ]),
    ).toEqual({
      name: "kaiplan-web",
      routes: [
        { pattern: "kaiplan.app/*", zone_name: "kaiplan.app" },
        { pattern: "www.kaiplan.app/*", zone_name: "kaiplan.app" },
        { pattern: "www.kaiplan.app", custom_domain: true },
      ],
    });
  });

  it("overwrites any existing routes in the generated config", () => {
    expect(
      mergeWorkerRoutes(
        {
          name: "kaiplan-web",
          routes: [{ pattern: "old.example/*", zone_name: "example.com" }],
        },
        [{ pattern: "kaiplan.app/*", zone_name: "kaiplan.app" }],
      ),
    ).toEqual({
      name: "kaiplan-web",
      routes: [{ pattern: "kaiplan.app/*", zone_name: "kaiplan.app" }],
    });
  });
});
