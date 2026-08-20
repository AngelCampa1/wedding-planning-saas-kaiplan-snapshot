import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export type LiveIssueSeverity = "blocker" | "critical" | "major" | "minor";

export type LiveIssue = {
  severity: LiveIssueSeverity;
  title: string;
  flow: string;
  affectedUrl?: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence?: string[];
  ownerArea: string;
};

export type LiveScenario = {
  name: string;
  status: "passed" | "failed" | "skipped";
  notes?: string;
};

export type LiveCleanupEntry = {
  item: string;
  status: "succeeded" | "failed" | "skipped";
  notes?: string;
};

export type LiveReport = {
  startedAt: string;
  finishedAt: string;
  domains: {
    marketing: string;
    app: string;
    api: string;
  };
  browser: string;
  envFlags: string[];
  seededAccountLabel: string;
  scenarios: LiveScenario[];
  issues: LiveIssue[];
  cleanup: LiveCleanupEntry[];
};

export const LIVE_REPORT_PATH = path.resolve(
  "test-results",
  "live-e2e-report.md",
);

export const LIVE_EVIDENCE_DIR = path.resolve(
  "test-results",
  "live-e2e-evidence",
);

const SECRET_QUERY_KEYS = [
  "token",
  "t",
  "code",
  "state",
  "session",
  "secret",
  "password",
];
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  "g",
);

function redactQueryValue(key: string) {
  return SECRET_QUERY_KEYS.some((secretKey) =>
    key.toLowerCase().includes(secretKey),
  )
    ? "[redacted]"
    : "[present]";
}

export function sanitizeUrl(rawUrl: string | undefined) {
  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      url.searchParams.set(key, redactQueryValue(key));
    }
    if (url.hash) {
      url.hash = "#[redacted]";
    }
    return url.toString();
  } catch {
    return rawUrl
      .replace(
        /([?&][^=]*(token|code|state|secret|password)[^=]*=)[^&#]*/gi,
        "$1[redacted]",
      )
      .replace(/#.+$/, "#[redacted]");
  }
}

export function sanitizeText(value: string) {
  return value
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(
      /([?&][^=]*(token|code|state|secret|password)[^=]*=)[^&#\s]*/gi,
      "$1[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/(better-auth\.[A-Za-z0-9._-]+=)[^;\s]+/gi, "$1[redacted]");
}

export async function captureLiveEvidence(page: Page, name: string) {
  fs.mkdirSync(LIVE_EVIDENCE_DIR, { recursive: true });
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const filePath = path.join(
    LIVE_EVIDENCE_DIR,
    `${Date.now()}-${safeName || "evidence"}.png`,
  );

  await page.screenshot({ path: filePath, fullPage: true });
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function issueToMarkdown(issue: LiveIssue) {
  const lines = [
    `### ${issue.title}`,
    "",
    `- Severity: ${issue.severity}`,
    `- Flow: ${issue.flow}`,
    `- Affected URL: ${sanitizeUrl(issue.affectedUrl) ?? "n/a"}`,
    `- Owner area: ${issue.ownerArea}`,
    `- Expected: ${sanitizeText(issue.expected)}`,
    `- Actual: ${sanitizeText(issue.actual)}`,
    "- Steps to reproduce:",
    ...issue.steps.map((step) => `  - ${sanitizeText(step)}`),
    "- Evidence:",
    ...(issue.evidence && issue.evidence.length > 0
      ? issue.evidence.map((entry) => `  - ${sanitizeText(entry)}`)
      : ["  - n/a"]),
  ];

  return lines.join("\n");
}

function sectionForSeverity(issues: LiveIssue[], severity: LiveIssueSeverity) {
  const matching = issues.filter((issue) => issue.severity === severity);
  if (matching.length === 0) {
    return `## ${severity}\n\nNone.`;
  }

  return [
    `## ${severity}`,
    "",
    ...matching.map((issue) => issueToMarkdown(issue)),
  ].join("\n\n");
}

export function writeLiveReport(report: LiveReport) {
  fs.mkdirSync(path.dirname(LIVE_REPORT_PATH), { recursive: true });

  const environmentalIssues = report.issues.filter((issue) =>
    /dns|cloudflare|cors|stripe|webhook|host|domain|routing/i.test(
      `${issue.title} ${issue.ownerArea}`,
    ),
  );

  const content = [
    "# Live E2E Report",
    "",
    "## Run Metadata",
    "",
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Marketing domain: ${report.domains.marketing}`,
    `- App domain: ${report.domains.app}`,
    `- API domain: ${report.domains.api}`,
    `- Browser: ${report.browser}`,
    `- Env flags: ${report.envFlags.length > 0 ? report.envFlags.join(", ") : "none"}`,
    `- Seeded account: ${report.seededAccountLabel}`,
    "",
    "## Scenario Summary",
    "",
    "| Scenario | Status | Notes |",
    "| --- | --- | --- |",
    ...report.scenarios.map(
      (scenario) =>
        `| ${scenario.name} | ${scenario.status} | ${sanitizeText(
          scenario.notes ?? "",
        )} |`,
    ),
    "",
    sectionForSeverity(report.issues, "blocker"),
    "",
    sectionForSeverity(report.issues, "critical"),
    "",
    sectionForSeverity(report.issues, "major"),
    "",
    sectionForSeverity(report.issues, "minor"),
    "",
    "## Environmental Blockers",
    "",
    environmentalIssues.length > 0
      ? environmentalIssues
          .map(
            (issue) =>
              `- ${issue.severity}: ${issue.title} (${
                sanitizeUrl(issue.affectedUrl) ?? "n/a"
              })`,
          )
          .join("\n")
      : "None.",
    "",
    "## Cleanup Summary",
    "",
    report.cleanup.length > 0
      ? [
          "| Item | Status | Notes |",
          "| --- | --- | --- |",
          ...report.cleanup.map(
            (entry) =>
              `| ${sanitizeText(entry.item)} | ${entry.status} | ${sanitizeText(
                entry.notes ?? "",
              )} |`,
          ),
        ].join("\n")
      : "No cleanup actions were needed.",
    "",
    "## Sensitive Data Policy",
    "",
    "Passwords, auth cookies, invite tokens, RSVP tokens, raw customer data, and full secret-bearing URLs are intentionally omitted or redacted.",
    "",
  ].join("\n");

  fs.writeFileSync(LIVE_REPORT_PATH, content, "utf8");
}
