import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  captureLiveEvidence,
  LIVE_REPORT_PATH,
  type LiveCleanupEntry,
  type LiveIssue,
  type LiveScenario,
  sanitizeUrl,
  writeLiveReport,
} from "../../helpers/live-report";

const MARKETING_ORIGIN = "https://kaiplan.app";
const APP_ORIGIN = "https://my.kaiplan.app";
const API_ORIGIN = "https://api.kaiplan.app";
const LIVE_FLAG = process.env.KAIPLAN_LIVE_E2E === "true";
const SEEDED_EMAIL = process.env.KAIPLAN_LIVE_E2E_EMAIL;
const SEEDED_PASSWORD = process.env.KAIPLAN_LIVE_E2E_PASSWORD;
const SEEDED_ACCOUNT_LABEL =
  process.env.KAIPLAN_LIVE_E2E_ACCOUNT_LABEL ?? "seeded-live-e2e";

const startedAt = new Date().toISOString();
const scenarios: LiveScenario[] = [];
const issues: LiveIssue[] = [];
const cleanup: LiveCleanupEntry[] = [];
const createdWeddingIds: string[] = [];
const createdSlugs: string[] = [];

type FirstPartyFailure = {
  source: "console" | "response";
  flow: string;
  message: string;
  url?: string;
};

const firstPartyFailures: FirstPartyFailure[] = [];

function recordScenario(
  name: string,
  status: LiveScenario["status"],
  notes?: string,
) {
  scenarios.push({ name, status, notes });
}

function recordIssue(issue: LiveIssue) {
  issues.push(issue);
}

function firstPartyUrl(url: string) {
  return (
    url.startsWith(MARKETING_ORIGIN) ||
    url.startsWith(APP_ORIGIN) ||
    url.startsWith(API_ORIGIN)
  );
}

function installLiveDiagnostics(page: Page, flow: string) {
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    firstPartyFailures.push({
      source: "console",
      flow,
      message: message.text(),
      url: page.url(),
    });
  });

  page.on("response", (response) => {
    const url = response.url();
    if (response.status() < 400 || !firstPartyUrl(url)) {
      return;
    }
    if (
      url.startsWith(`${API_ORIGIN}/api/weddings/accept-invite`) &&
      [401, 403].includes(response.status())
    ) {
      return;
    }

    firstPartyFailures.push({
      source: "response",
      flow,
      message: `${response.status()} ${sanitizeUrl(url)}`,
      url,
    });
  });
}

async function checkedGet(
  request: APIRequestContext,
  url: string,
  expected: string,
) {
  try {
    const response = await request.get(url, { failOnStatusCode: false });
    if (response.status() !== 200) {
      recordIssue({
        severity: "blocker",
        title: `Live host did not return 200: ${new URL(url).hostname}`,
        flow: "preflight",
        affectedUrl: url,
        steps: [`GET ${sanitizeUrl(url)}`],
        expected,
        actual: `HTTP ${response.status()}`,
        ownerArea: "Cloudflare/DNS routing",
      });
      return false;
    }
    return true;
  } catch (error) {
    recordIssue({
      severity: "blocker",
      title: `Live host request failed: ${new URL(url).hostname}`,
      flow: "preflight",
      affectedUrl: url,
      steps: [`GET ${sanitizeUrl(url)}`],
      expected,
      actual:
        error instanceof Error
          ? error.message.split("\n")[0]!
          : "Request failed",
      ownerArea: "DNS/Cloudflare routing",
    });
    return false;
  }
}

async function runPreflight(page: Page, request: APIRequestContext) {
  installLiveDiagnostics(page, "preflight");

  const marketingOk = await checkedGet(
    request,
    MARKETING_ORIGIN,
    "Marketing site should load successfully.",
  );
  const appOk = await checkedGet(
    request,
    `${APP_ORIGIN}/signup`,
    "App signup page should load successfully.",
  );
  const apiOk = await checkedGet(
    request,
    `${API_ORIGIN}/api/health`,
    "API health endpoint should load successfully.",
  );

  if (marketingOk) {
    const response = await page.goto(MARKETING_ORIGIN, {
      waitUntil: "domcontentloaded",
    });
    if (!response || response.status() !== 200) {
      recordIssue({
        severity: "blocker",
        title: "Marketing page navigation failed during CTA preflight",
        flow: "preflight",
        affectedUrl: MARKETING_ORIGIN,
        steps: [`Open ${MARKETING_ORIGIN}`],
        expected: "The marketing home page should render for CTA inspection.",
        actual: response
          ? `HTTP ${response.status()}`
          : "No navigation response",
        ownerArea: "Marketing/Cloudflare routing",
      });
    } else {
      const signupLinks = await page.$$eval("a[href]", (anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
      );
      const hasAppSignupCta = signupLinks.some((href) => {
        try {
          const url = new URL(href);
          return (
            url.origin === "https://my.kaiplan.app" &&
            url.pathname === "/signup"
          );
        } catch {
          return false;
        }
      });

      if (!hasAppSignupCta) {
        recordIssue({
          severity: "major",
          title: "Marketing CTAs do not point to the canonical app signup",
          flow: "preflight",
          affectedUrl: MARKETING_ORIGIN,
          steps: [
            `Open ${MARKETING_ORIGIN}`,
            "Inspect anchor href values on the rendered page.",
          ],
          expected:
            "At least one CTA should link to https://my.kaiplan.app/signup.",
          actual: "No canonical app signup CTA was found.",
          evidence: [await captureLiveEvidence(page, "missing-signup-cta")],
          ownerArea: "Marketing app links",
        });
      }
    }
  }

  const passed = marketingOk && appOk && apiOk;
  recordScenario(
    "Preflight",
    passed ? "passed" : "failed",
    passed
      ? "All canonical hosts responded."
      : "One or more live hosts failed.",
  );
  return passed;
}

async function clickMarketingSignupCta(page: Page) {
  await page.goto(MARKETING_ORIGIN, { waitUntil: "domcontentloaded" });
  const canonicalSignupLink = page
    .locator(`a[href^="${APP_ORIGIN}/signup"], a[href="${APP_ORIGIN}/signup"]`)
    .first();

  if ((await canonicalSignupLink.count()) === 0) {
    throw new Error("No canonical signup CTA was found on the marketing site.");
  }

  await canonicalSignupLink.click();
  await page.waitForURL((url) => {
    return url.origin === APP_ORIGIN && url.pathname === "/signup";
  });
}

async function runSignupLane(page: Page) {
  installLiveDiagnostics(page, "signup lane");
  const timestamp = Date.now();
  const signupEmail = `live-e2e-signup-${timestamp}@example.com`;
  const password = `LiveE2E-${timestamp}`;

  try {
    await clickMarketingSignupCta(page);
    await page.locator("#name").fill("Live E2E Signup");
    await page.locator("#email").fill(signupEmail);
    await page.locator("#password").fill(password);
    await page
      .getByRole("button", { name: "Create my planning workspace" })
      .click();

    await expect(
      page.getByRole("heading", { name: /check your email/i }),
    ).toBeVisible();
    await expect(
      page.getByText(`We sent a verification link to ${signupEmail}.`),
    ).toBeVisible();

    recordScenario(
      "Signup lane",
      "passed",
      "Marketing CTA and email/password signup reached the production verification state.",
    );
  } catch (error) {
    recordIssue({
      severity: "critical",
      title: "Signup lane failed",
      flow: "signup lane",
      affectedUrl: page.url(),
      steps: [
        "Start on marketing home page.",
        "Click the canonical signup CTA.",
        "Create a unique email account.",
        "Confirm the email verification state.",
      ],
      expected:
        "The signup lane should reach the email verification state without errors.",
      actual: error instanceof Error ? error.message : "Signup lane failed.",
      evidence: [await captureLiveEvidence(page, "signup-lane-failure")],
      ownerArea: "Marketing/app onboarding",
    });
    recordScenario("Signup lane", "failed", "Signup lane threw an error.");
  }
}

async function loginSeededPaidUser(page: Page) {
  if (!SEEDED_EMAIL || !SEEDED_PASSWORD) {
    throw new Error(
      "KAIPLAN_LIVE_E2E_EMAIL and KAIPLAN_LIVE_E2E_PASSWORD are required.",
    );
  }

  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email").fill(SEEDED_EMAIL);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|onboarding|subscribe|settings)/, {
    timeout: 20_000,
  });
}

async function createWeddingViaApi(
  request: APIRequestContext,
  timestamp: number,
) {
  const response = await request.post(`${API_ORIGIN}/api/weddings`, {
    headers: { Origin: APP_ORIGIN },
    data: {
      name: `Live E2E Aha ${timestamp}`,
      date: "2027-06-20",
      budgetCents: 2500000,
      currency: "USD",
      timezone: "America/Mexico_City",
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Could not create live e2e wedding: ${response.status()} ${await response.text()}`,
    );
  }

  const wedding = (await response.json()) as { id: string; name: string };
  createdWeddingIds.push(wedding.id);
  return wedding;
}

async function setActiveWedding(page: Page, weddingId: string) {
  await page.goto(`${APP_ORIGIN}/dashboard`);
  await page.evaluate((id) => {
    sessionStorage.setItem("kaiplan:activeWeddingId", id);
  }, weddingId);
}

async function addGuestHousehold(page: Page) {
  await page.goto(`${APP_ORIGIN}/guests`);
  await page.getByRole("heading", { name: "Guest List" }).waitFor();
  await page.getByRole("button", { name: "Add Guest" }).first().click();
  const guestDialog = page.getByRole("dialog", { name: "Add Guest" });
  await page.getByLabel("First Name").fill("Ava");
  await page.getByLabel("Last Name").fill("Rivera");
  await page.getByLabel("Email").fill("ava.live-e2e@example.com");
  await guestDialog.getByRole("button", { name: "Add Guest" }).click();
  await expect(guestDialog).toBeHidden();
  await expect(page.getByText("Ava Rivera")).toBeVisible();

  await page
    .getByRole("button", { name: /add plus-one to ava rivera/i })
    .click();
  const plusOneDialog = page.getByRole("dialog", {
    name: /add plus-one for ava rivera/i,
  });
  await page.getByLabel("First Name").fill("Sam");
  await page.getByLabel("Last Name").fill("Rivera");
  await plusOneDialog.getByRole("button", { name: "Add Plus-One" }).click();
  await expect(plusOneDialog).toBeHidden();
  await expect(page.getByText("+1")).toBeVisible();
}

async function publishWebsiteAndGetInvite(page: Page, timestamp: number) {
  const slug = `live-e2e-${timestamp}`;
  createdSlugs.push(slug);

  await page.goto(`${APP_ORIGIN}/website`);
  await page.getByRole("heading", { name: "Wedding Website" }).waitFor();
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel(/^Title$/).fill("Ava & Sam");
  await page.getByLabel("Venue name").fill("The Palm House");
  await page.getByRole("button", { name: "Publish live" }).click();
  await expect(page.getByText("Website published.")).toBeVisible({
    timeout: 20_000,
  });

  await expect(
    page.getByRole("button", { name: /generate invite link/i }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /generate invite link/i }).click();
  const openRsvpLink = page.getByRole("link", { name: "Open RSVP" });
  await expect(openRsvpLink).toBeVisible();
  const inviteLink = await openRsvpLink.getAttribute("href");
  if (!inviteLink || !inviteLink.includes("?token=")) {
    throw new Error("Invite link was not rendered.");
  }

  return inviteLink;
}

async function submitPublicRsvp(page: Page, inviteLink: string) {
  await page.goto(inviteLink);
  await expect(
    page.getByRole("heading", { name: /please rsvp/i }),
  ).toBeVisible();
  await expect(page.getByText("Ava Rivera")).toBeVisible();
  await expect(page.getByText("Sam Rivera")).toBeVisible();
  await page
    .locator("label", { hasText: "Joyfully attending" })
    .first()
    .click();
  await page.locator("label", { hasText: "Joyfully attending" }).nth(1).click();
  await page.getByRole("button", { name: "Send RSVP" }).click();
  await expect(page.locator("[data-rsvp-status]")).toContainText(
    /rsvp has been saved/i,
  );
}

async function assertPlannerRsvpAccepted(page: Page) {
  await page.goto(`${APP_ORIGIN}/guests`);
  await page
    .getByRole("button", { name: /expand ava rivera plus-ones/i })
    .click();
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: "Ava Rivera" })
      .getByText("Accepted"),
  ).toBeVisible();
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: "Sam Rivera" })
      .getByText("Accepted"),
  ).toBeVisible();
}

async function cleanupCreatedWeddings(request: APIRequestContext) {
  if (createdWeddingIds.length === 0) {
    cleanup.push({
      item: "created weddings",
      status: "skipped",
      notes: "No live e2e weddings were created.",
    });
    return;
  }

  for (const weddingId of createdWeddingIds) {
    const response = await request.delete(
      `${API_ORIGIN}/api/weddings/${weddingId}`,
      {
        headers: { Origin: APP_ORIGIN },
      },
    );
    cleanup.push({
      item: `wedding ${weddingId}`,
      status: response.ok() ? "succeeded" : "failed",
      notes: response.ok()
        ? "Deleted via authenticated API cleanup."
        : `HTTP ${response.status()}`,
    });
  }
}

async function runAhaLane(page: Page) {
  installLiveDiagnostics(page, "aha lane");

  if (!SEEDED_EMAIL || !SEEDED_PASSWORD) {
    recordIssue({
      severity: "blocker",
      title: "Seeded paid live e2e credentials are missing",
      flow: "aha lane",
      affectedUrl: APP_ORIGIN,
      steps: [
        "Set KAIPLAN_LIVE_E2E_EMAIL.",
        "Set KAIPLAN_LIVE_E2E_PASSWORD.",
        "Run the live Playwright suite again.",
      ],
      expected: "A paid Pro or Lifetime live e2e account should be available.",
      actual: "One or both credential environment variables were missing.",
      ownerArea: "Test environment",
    });
    recordScenario(
      "Aha lane",
      "skipped",
      "Seeded account credentials missing.",
    );
    return;
  }

  try {
    const timestamp = Date.now();
    await loginSeededPaidUser(page);
    const wedding = await createWeddingViaApi(page.request, timestamp);
    await setActiveWedding(page, wedding.id);
    await addGuestHousehold(page);
    const inviteLink = await publishWebsiteAndGetInvite(page, timestamp);
    const publicPage = await page.context().newPage();
    installLiveDiagnostics(publicPage, "public RSVP");
    await submitPublicRsvp(publicPage, inviteLink);
    await publicPage.close();
    await assertPlannerRsvpAccepted(page);
    recordScenario(
      "Aha lane",
      "passed",
      "Guest RSVP loop completed and reflected in planner.",
    );
  } catch (error) {
    recordIssue({
      severity: "critical",
      title: "Aha lane failed",
      flow: "aha lane",
      affectedUrl: page.url(),
      steps: [
        "Log in with the seeded paid live e2e user.",
        "Create a unique wedding.",
        "Add a guest and plus-one.",
        "Publish a wedding website.",
        "Submit public RSVP.",
        "Confirm accepted RSVP state inside the planner.",
      ],
      expected:
        "The public RSVP loop should complete and sync back to the planner.",
      actual: error instanceof Error ? error.message : "Aha lane failed.",
      evidence: [await captureLiveEvidence(page, "aha-lane-failure")],
      ownerArea: "Planner/guest/website/RSVP",
    });
    recordScenario("Aha lane", "failed", "Aha lane threw an error.");
  } finally {
    await cleanupCreatedWeddings(page.request);
  }
}

function recordDiagnosticsAsIssues() {
  const unique = new Map<string, FirstPartyFailure>();
  for (const failure of firstPartyFailures) {
    unique.set(
      `${failure.source}:${failure.flow}:${failure.message}:${failure.url ?? ""}`,
      failure,
    );
  }

  for (const failure of unique.values()) {
    recordIssue({
      severity: failure.source === "response" ? "major" : "minor",
      title:
        failure.source === "response"
          ? "First-party request failed"
          : "Unexpected browser console error",
      flow: failure.flow,
      affectedUrl: failure.url,
      steps: ["Run the live Playwright e2e flow and inspect diagnostics."],
      expected: "No first-party request failures or unexpected console errors.",
      actual: failure.message,
      ownerArea:
        failure.source === "response"
          ? "First-party API/page response"
          : "Frontend runtime",
    });
  }
}

function writeReport() {
  recordDiagnosticsAsIssues();
  writeLiveReport({
    startedAt,
    finishedAt: new Date().toISOString(),
    domains: {
      marketing: MARKETING_ORIGIN,
      app: APP_ORIGIN,
      api: API_ORIGIN,
    },
    browser: "chromium-live",
    envFlags: [
      LIVE_FLAG ? "KAIPLAN_LIVE_E2E=true" : "KAIPLAN_LIVE_E2E=false",
      process.env.KAIPLAN_LIVE_E2E_HEADLESS === "false"
        ? "KAIPLAN_LIVE_E2E_HEADLESS=false"
        : "KAIPLAN_LIVE_E2E_HEADLESS=true",
    ],
    seededAccountLabel: SEEDED_ACCOUNT_LABEL,
    scenarios,
    issues,
    cleanup: [
      ...cleanup,
      ...createdSlugs.map((slug) => ({
        item: `public slug ${slug}`,
        status: "succeeded" as const,
        notes: "Slug was tied to the created wedding cleanup.",
      })),
    ],
  });
}

test.describe.configure({ mode: "serial" });

test("marketing to RSVP aha live e2e", async ({ page, request }) => {
  if (!LIVE_FLAG) {
    recordIssue({
      severity: "blocker",
      title: "Live e2e run was not explicitly enabled",
      flow: "guard",
      affectedUrl: MARKETING_ORIGIN,
      steps: ["Run with KAIPLAN_LIVE_E2E=true."],
      expected: "Live e2e tests require an explicit opt-in flag.",
      actual: "KAIPLAN_LIVE_E2E was not true.",
      ownerArea: "Test environment",
    });
    recordScenario("Guard", "failed", "Missing KAIPLAN_LIVE_E2E=true.");
    writeReport();
    throw new Error(`Live e2e guard failed. Report: ${LIVE_REPORT_PATH}`);
  }

  const preflightPassed = await runPreflight(page, request);
  if (preflightPassed) {
    await runSignupLane(page);
    await runAhaLane(page);
  } else {
    recordScenario("Signup lane", "skipped", "Preflight failed.");
    recordScenario("Aha lane", "skipped", "Preflight failed.");
    cleanup.push({
      item: "created weddings",
      status: "skipped",
      notes: "Preflight failed before live data creation.",
    });
  }

  writeReport();

  const actionableIssues = issues.filter((issue) =>
    ["blocker", "critical", "major"].includes(issue.severity),
  );
  expect(
    actionableIssues,
    `Live e2e found ${actionableIssues.length} actionable issue(s). Report: ${LIVE_REPORT_PATH}`,
  ).toEqual([]);
});
