import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertExecutableSequencerEnv,
  buildBackfillEnrollments,
  buildLeadMagnetBackfillQuery,
  formatBackfillEnrollmentLabel,
  formatBackfillExecutionError,
  formatBackfillSummary,
  parseBackfillArgs,
  parseWranglerD1Rows,
  WRANGLER_D1_EXECUTE_TIMEOUT_MS,
} from "./lib/lead-magnet-sequencer-backfill";

describe("parseBackfillArgs", () => {
  it("defaults to dry-run mode with a bounded limit", () => {
    expect(parseBackfillArgs([])).toEqual({
      dryRun: true,
      afterDownloadId: 0,
      limit: 100,
    });
  });

  it("requires explicit execute mode for live enrollment", () => {
    expect(
      parseBackfillArgs([
        "--execute",
        "--limit",
        "25",
        "--after-download-id",
        "1000",
      ]),
    ).toEqual({
      dryRun: false,
      afterDownloadId: 1000,
      limit: 25,
    });
  });

  it("rejects unknown arguments and invalid limits", () => {
    expect(() => parseBackfillArgs(["--wat"])).toThrow(/Unknown argument/);
    expect(() => parseBackfillArgs(["--limit", "0"])).toThrow(
      /positive integer/,
    );
    expect(() => parseBackfillArgs(["--after-download-id", "-1"])).toThrow(
      /non-negative integer/,
    );
  });
});

describe("backfill script wrapper", () => {
  it("bounds Wrangler D1 execution so backfills cannot hang indefinitely", () => {
    const script = readFileSync("scripts/backfill-lead-magnet-sequencer.ts", {
      encoding: "utf8",
    });

    expect(WRANGLER_D1_EXECUTE_TIMEOUT_MS).toBe(300_000);
    expect(script).toContain("timeout: WRANGLER_D1_EXECUTE_TIMEOUT_MS");
  });
});

describe("buildLeadMagnetBackfillQuery", () => {
  it("queries lead magnet downloads joined to signup context", () => {
    const query = buildLeadMagnetBackfillQuery(50, 1000);

    expect(query).toContain("FROM lead_magnet_downloads d");
    expect(query).toContain("INNER JOIN signups s");
    expect(query).toContain("WHERE d.id > 1000");
    expect(query).toContain("LIMIT 50");
  });

  it("keeps the wrangler command SQL argument on one line for Windows shells", () => {
    expect(buildLeadMagnetBackfillQuery(50)).not.toMatch(/\r|\n/);
  });
});

describe("parseWranglerD1Rows", () => {
  it("parses wrangler d1 execute JSON output", () => {
    expect(
      parseWranglerD1Rows(
        JSON.stringify([
          {
            results: [
              {
                signupId: 42,
                downloadId: 1001,
                email: "lead@example.com",
                sourcePage: "/free/budget-template",
                leadMagnetSlug: "budget-template",
                leadMagnetTitle: "Budget Template",
              },
            ],
          },
        ]),
      ),
    ).toEqual([
      {
        signupId: 42,
        downloadId: 1001,
        email: "lead@example.com",
        sourcePage: "/free/budget-template",
        leadMagnetSlug: "budget-template",
        leadMagnetTitle: "Budget Template",
      },
    ]);
  });

  it("rejects malformed row data", () => {
    expect(() =>
      parseWranglerD1Rows(JSON.stringify([{ results: [{ email: "" }] }])),
    ).toThrow(/invalid signup row/);
  });
});

describe("buildBackfillEnrollments", () => {
  it("uses canonical lead magnet sequence metadata", () => {
    expect(
      buildBackfillEnrollments([
        {
          signupId: 7,
          downloadId: 1001,
          email: "lead@example.com",
          sourcePage: "/free/budget-template",
          leadMagnetSlug: "budget-template",
          leadMagnetTitle: null,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        email: "lead@example.com",
        leadMagnetSlug: "budget-template",
        sequenceSlug: "kaiplan-lead-magnet-nurture",
        externalId: "7:budget-template",
        leadMagnetTitle: expect.stringContaining(
          "Free Wedding Budget Template",
        ),
      }),
    ]);
  });

  it("derives the title from the download slug instead of stale signup metadata", () => {
    expect(
      buildBackfillEnrollments([
        {
          signupId: 7,
          downloadId: 1001,
          email: "lead@example.com",
          sourcePage: "/free/budget-template",
          leadMagnetSlug: "budget-template",
          leadMagnetTitle: "Wrong Previous Magnet",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        leadMagnetSlug: "budget-template",
        leadMagnetTitle: expect.stringContaining(
          "Free Wedding Budget Template",
        ),
      }),
    ]);
  });

  it("skips rows with unknown lead magnet slugs", () => {
    expect(
      buildBackfillEnrollments([
        {
          signupId: 7,
          downloadId: 1001,
          email: "lead@example.com",
          sourcePage: "/free/unknown",
          leadMagnetSlug: "unknown",
          leadMagnetTitle: null,
        },
      ]),
    ).toEqual([]);
  });
});

describe("assertExecutableSequencerEnv", () => {
  it("requires all Sequencer credentials before execute mode", () => {
    expect(() => assertExecutableSequencerEnv({})).toThrow(
      /SEQUENCER_BASE_URL/,
    );
  });

  it("accepts a complete Sequencer environment", () => {
    expect(() =>
      assertExecutableSequencerEnv({
        SEQUENCER_BASE_URL: "https://sequencer.example.com",
        SEQUENCER_CF_ACCESS_CLIENT_ID: "client",
        SEQUENCER_CF_ACCESS_CLIENT_SECRET: "secret",
      }),
    ).not.toThrow();
  });
});

describe("formatBackfillSummary", () => {
  const enrollment = {
    signupId: 7,
    downloadId: 1001,
    email: "lead@example.com",
    sourcePage: "/free/budget-template",
    leadMagnetSlug: "budget-template",
    leadMagnetTitle: "Budget Template",
    sequenceSlug: "kaiplan-lead-magnet-nurture",
    externalId: "7:budget-template",
  };

  it("formats dry-run output with planned sequence enrollments", () => {
    const summary = formatBackfillSummary([enrollment], 1, 1002);

    expect(summary).toContain("1 planned enrollment(s), 1 skipped row(s)");
    expect(summary).toContain(
      "Re-run with --after-download-id 1002 for the next batch.",
    );
    expect(summary).toContain("signup 7");
    expect(summary).not.toContain("lead@example.com");
  });

  it("formats enrollment labels without exposing email addresses", () => {
    expect(formatBackfillEnrollmentLabel(enrollment)).toBe(
      "download 1001 -> signup 7 -> lead magnet budget-template -> sequence kaiplan-lead-magnet-nurture -> external 7:budget-template",
    );
  });
});

describe("formatBackfillExecutionError", () => {
  it("redacts echoed email addresses from Sequencer failures", () => {
    const enrollment = {
      signupId: 7,
      downloadId: 1001,
      email: "lead@example.com",
      sourcePage: "/free/budget-template",
      leadMagnetSlug: "budget-template",
      leadMagnetTitle: "Budget Template",
      sequenceSlug: "kaiplan-lead-magnet-nurture",
      externalId: "7:budget-template",
    };
    const message = formatBackfillExecutionError(
      new Error('Sequencer request failed: {"email":"lead@example.com"}'),
      enrollment,
    );

    expect(message).toContain("signup 7");
    expect(message).toContain("[redacted-email]");
    expect(message).not.toContain("lead@example.com");
  });
});
