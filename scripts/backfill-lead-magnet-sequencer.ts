import { execFileSync } from "node:child_process";
import { MARKETING_D1_DATABASE_NAME } from "./lib/cloudflare-web-config";
import { buildPnpmInvocation } from "./lib/pnpm-invocation";
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
import { enrollSequencerSequence } from "../packages/marketing-api/src/services/sequencer";

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2));
  const query = buildLeadMagnetBackfillQuery(args.limit, args.afterDownloadId);
  const wranglerCommand = buildPnpmInvocation([
    "exec",
    "wrangler",
    "d1",
    "execute",
    MARKETING_D1_DATABASE_NAME,
    "--remote",
    "--json",
    "--command",
    query,
  ]);
  const output = execFileSync(
    wranglerCommand.executable,
    wranglerCommand.args,
    {
      encoding: "utf8",
      timeout: WRANGLER_D1_EXECUTE_TIMEOUT_MS,
    },
  );

  const rows = parseWranglerD1Rows(output);
  const enrollments = buildBackfillEnrollments(rows);
  const skippedCount = rows.length - enrollments.length;
  const lastProcessedDownloadId =
    rows.length > 0 ? Math.max(...rows.map((row) => row.downloadId)) : null;

  console.log(
    formatBackfillSummary(enrollments, skippedCount, lastProcessedDownloadId),
  );

  if (args.dryRun) {
    console.log("[dry-run] Re-run with --execute to enroll these contacts.");
    return;
  }

  const env = {
    SEQUENCER_BASE_URL: process.env.SEQUENCER_BASE_URL,
    SEQUENCER_CF_ACCESS_CLIENT_ID: process.env.SEQUENCER_CF_ACCESS_CLIENT_ID,
    SEQUENCER_CF_ACCESS_CLIENT_SECRET:
      process.env.SEQUENCER_CF_ACCESS_CLIENT_SECRET,
  };
  assertExecutableSequencerEnv(env);

  for (const enrollment of enrollments) {
    const enrolled = await enrollSequencerSequence(env, {
      email: enrollment.email,
      sequenceSlug: enrollment.sequenceSlug,
      externalId: enrollment.externalId,
      metadata: {
        signupId: enrollment.signupId,
        sourcePage: enrollment.sourcePage,
        leadMagnetSlug: enrollment.leadMagnetSlug,
        leadMagnetTitle: enrollment.leadMagnetTitle,
      },
    }).catch((error: unknown) => {
      throw new Error(formatBackfillExecutionError(error, enrollment));
    });
    if (!enrolled) {
      throw new Error(
        `Sequencer enrollment did not run for ${formatBackfillEnrollmentLabel(enrollment)}`,
      );
    }
    console.log(`[enrolled] ${formatBackfillEnrollmentLabel(enrollment)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
