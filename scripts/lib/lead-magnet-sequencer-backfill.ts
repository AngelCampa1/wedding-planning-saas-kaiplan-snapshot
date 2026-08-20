import { leadMagnetMetadata } from "../../packages/marketing-api/src/lead-magnets";

export type BackfillArgs = {
  dryRun: boolean;
  afterDownloadId: number;
  limit: number;
};

export type BackfillSequencerEnv = {
  SEQUENCER_BASE_URL?: string;
  SEQUENCER_CF_ACCESS_CLIENT_ID?: string;
  SEQUENCER_CF_ACCESS_CLIENT_SECRET?: string;
};

export type BackfillSignupRow = {
  downloadId: number;
  signupId: number;
  email: string;
  sourcePage: string;
  leadMagnetSlug: string;
  leadMagnetTitle: string | null;
};

export type BackfillEnrollment = BackfillSignupRow & {
  sequenceSlug: string;
  externalId: string;
};

const DEFAULT_LIMIT = 100;
export const WRANGLER_D1_EXECUTE_TIMEOUT_MS = 300_000;

export function parseBackfillArgs(args: string[]): BackfillArgs {
  const parsed: BackfillArgs = {
    dryRun: true,
    afterDownloadId: 0,
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--execute") {
      parsed.dryRun = false;
      continue;
    }
    if (arg === "--limit") {
      const rawLimit = args[index + 1];
      if (!rawLimit) {
        throw new Error("--limit requires a positive integer");
      }
      const limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("--limit requires a positive integer");
      }
      parsed.limit = limit;
      index += 1;
      continue;
    }
    if (arg === "--after-download-id") {
      const rawDownloadId = args[index + 1];
      if (!rawDownloadId) {
        throw new Error("--after-download-id requires a non-negative integer");
      }
      const afterDownloadId = Number(rawDownloadId);
      if (!Number.isInteger(afterDownloadId) || afterDownloadId < 0) {
        throw new Error("--after-download-id requires a non-negative integer");
      }
      parsed.afterDownloadId = afterDownloadId;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

export function buildLeadMagnetBackfillQuery(
  limit: number,
  afterDownloadId = 0,
): string {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }
  if (!Number.isInteger(afterDownloadId) || afterDownloadId < 0) {
    throw new Error("afterDownloadId must be a non-negative integer");
  }

  return compactSql(`
SELECT
  d.id AS downloadId,
  s.id AS signupId,
  s.email AS email,
  s.source_page AS sourcePage,
  d.lead_magnet_slug AS leadMagnetSlug,
  s.lead_magnet_title AS leadMagnetTitle
FROM lead_magnet_downloads d
INNER JOIN signups s ON s.email = d.signup_email
WHERE d.id > ${afterDownloadId}
ORDER BY d.created_at ASC, d.id ASC
LIMIT ${limit}
`);
}

function compactSql(sql: string): string {
  return sql.trim().replace(/\s+/g, " ");
}

export function parseWranglerD1Rows(output: string): BackfillSignupRow[] {
  const payload = JSON.parse(output) as unknown;
  const commandResults = Array.isArray(payload) ? payload : [payload];
  const rows: unknown[] = [];

  for (const result of commandResults) {
    if (
      result &&
      typeof result === "object" &&
      "results" in result &&
      Array.isArray(result.results)
    ) {
      rows.push(...result.results);
    }
  }

  return rows.map((row) => {
    if (!row || typeof row !== "object") {
      throw new Error("Wrangler D1 result contained a non-object row");
    }
    const candidate = row as Record<string, unknown>;
    const downloadId = Number(candidate.downloadId);
    const signupId = Number(candidate.signupId);
    const email = String(candidate.email ?? "");
    const sourcePage = String(candidate.sourcePage ?? "");
    const leadMagnetSlug = String(candidate.leadMagnetSlug ?? "");
    const leadMagnetTitle =
      typeof candidate.leadMagnetTitle === "string"
        ? candidate.leadMagnetTitle
        : null;

    if (
      !Number.isInteger(signupId) ||
      !Number.isInteger(downloadId) ||
      downloadId < 1 ||
      signupId < 1 ||
      !email ||
      !sourcePage ||
      !leadMagnetSlug
    ) {
      throw new Error("Wrangler D1 result contained an invalid signup row");
    }

    return {
      downloadId,
      signupId,
      email,
      sourcePage,
      leadMagnetSlug,
      leadMagnetTitle,
    };
  });
}

export function buildBackfillEnrollments(
  rows: BackfillSignupRow[],
): BackfillEnrollment[] {
  return rows.flatMap((row) => {
    const metadata = leadMagnetMetadata[row.leadMagnetSlug];
    if (!metadata) return [];

    return [
      {
        ...row,
        leadMagnetTitle: metadata.title,
        sequenceSlug: metadata.nurtureSequenceId,
        externalId: `${row.signupId}:${row.leadMagnetSlug}`,
      },
    ];
  });
}

export function formatBackfillSummary(
  enrollments: BackfillEnrollment[],
  skippedCount: number,
  lastProcessedDownloadId: number | null = getLastProcessedDownloadId(
    enrollments,
  ),
): string {
  return [
    `Lead magnet Sequencer backfill: ${enrollments.length} planned enrollment(s), ${skippedCount} skipped row(s).`,
    lastProcessedDownloadId === null
      ? "Last processed download id: none."
      : `Last processed download id: ${lastProcessedDownloadId}. Re-run with --after-download-id ${lastProcessedDownloadId} for the next batch.`,
    ...enrollments.map(
      (enrollment) => `- ${formatBackfillEnrollmentLabel(enrollment)}`,
    ),
  ].join("\n");
}

function getLastProcessedDownloadId(
  enrollments: Pick<BackfillEnrollment, "downloadId">[],
): number | null {
  if (enrollments.length === 0) return null;
  return Math.max(...enrollments.map((enrollment) => enrollment.downloadId));
}

export function formatBackfillEnrollmentLabel(
  enrollment: Pick<
    BackfillEnrollment,
    "downloadId" | "signupId" | "leadMagnetSlug" | "sequenceSlug" | "externalId"
  >,
): string {
  return [
    `download ${enrollment.downloadId}`,
    `signup ${enrollment.signupId}`,
    `lead magnet ${enrollment.leadMagnetSlug}`,
    `sequence ${enrollment.sequenceSlug}`,
    `external ${enrollment.externalId}`,
  ].join(" -> ");
}

export function formatBackfillExecutionError(
  error: unknown,
  enrollment: Pick<BackfillEnrollment, "email"> &
    Parameters<typeof formatBackfillEnrollmentLabel>[0],
): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown Sequencer error";
  return [
    "Sequencer enrollment failed for",
    formatBackfillEnrollmentLabel(enrollment),
    redactLeadEmail(message, enrollment.email),
  ].join(": ");
}

function redactLeadEmail(message: string, email: string): string {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return message;
  return message.split(trimmedEmail).join("[redacted-email]");
}

export function assertExecutableSequencerEnv(env: BackfillSequencerEnv): void {
  const missing = [
    ["SEQUENCER_BASE_URL", env.SEQUENCER_BASE_URL],
    ["SEQUENCER_CF_ACCESS_CLIENT_ID", env.SEQUENCER_CF_ACCESS_CLIENT_ID],
    [
      "SEQUENCER_CF_ACCESS_CLIENT_SECRET",
      env.SEQUENCER_CF_ACCESS_CLIENT_SECRET,
    ],
  ]
    .filter(([, value]) => !String(value ?? "").trim())
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing Sequencer credential(s) for --execute: ${missing.join(", ")}`,
    );
  }
}
