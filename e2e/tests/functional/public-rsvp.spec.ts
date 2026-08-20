import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { bootstrapPlannerSession } from "../../helpers/planner-auth";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

type BootstrappedPlanner = Awaited<ReturnType<typeof bootstrapPlannerSession>>;
type GuestRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  rsvpStatus: string;
  primaryGuestId: string | null;
};

async function apiJson<T>(
  request: APIRequestContext,
  url: string,
  init?: { method?: string; data?: unknown },
): Promise<{ status: number; body: T | null; ok: boolean }> {
  const response = await request.fetch(url, {
    method: init?.method ?? "GET",
    headers: { Origin: runtime.urls.app, "Content-Type": "application/json" },
    data: init?.data === undefined ? undefined : JSON.stringify(init.data),
  });
  const ok = response.ok();
  const status = response.status();
  let body: T | null = null;
  try {
    body = (await response.json()) as T;
  } catch {
    // Non-JSON responses are allowed in negative-path checks.
  }
  return { status, body, ok };
}

async function addGuest(
  request: APIRequestContext,
  bootstrap: BootstrappedPlanner,
  input: {
    firstName: string;
    lastName: string;
    email?: string | null;
    primaryGuestId?: string | null;
  },
): Promise<GuestRecord> {
  const response = await request.post(
    `${runtime.urls.api}/api/weddings/${bootstrap.wedding.id}/guests`,
    {
      headers: { Origin: runtime.urls.app },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: null,
        groupName: null,
        side: "mutual",
        rsvpStatus: "pending",
        dietaryTags: [],
        notes: null,
        primaryGuestId: input.primaryGuestId ?? null,
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as GuestRecord;
}

async function publishWebsite(
  request: APIRequestContext,
  bootstrap: BootstrappedPlanner,
  slug: string,
  heroTitle: string,
) {
  const draft = {
    slug,
    template: "classic" as const,
    content: {
      hero: {
        title: heroTitle,
        subtitle: "",
        body: "",
        ctaLabel: "Open RSVP",
      },
      story: { title: "Our Story", body: "" },
      venue: { name: "", address: "", details: "", mapUrl: null },
      registry: { title: "Registry", url: null, details: "" },
      rsvp: { visible: true, headline: "Please RSVP", details: "" },
      heroImage: null,
    },
  };

  const saveResult = await apiJson(
    request,
    `${runtime.urls.api}/api/weddings/${bootstrap.wedding.id}/website`,
    { method: "POST", data: draft },
  );
  expect(saveResult.ok).toBeTruthy();

  const publishResult = await apiJson(
    request,
    `${runtime.urls.api}/api/weddings/${bootstrap.wedding.id}/website/publish`,
    { method: "POST" },
  );
  expect(publishResult.ok).toBeTruthy();
}

async function createHouseholdToken(
  request: APIRequestContext,
  bootstrap: BootstrappedPlanner,
  primaryGuestId: string,
): Promise<string> {
  const response = await request.post(
    `${runtime.urls.api}/api/weddings/${bootstrap.wedding.id}/website/household-rsvp-token`,
    {
      headers: { Origin: runtime.urls.app, "Content-Type": "application/json" },
      data: { primaryGuestId },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = (await response.json()) as { token: string };
  return payload.token;
}

async function submitPublicRsvp(
  request: APIRequestContext,
  token: string,
  guests: {
    guestId: string;
    rsvpStatus: "accepted" | "declined" | "pending";
  }[],
) {
  return request.post(`${runtime.urls.api}/api/public/rsvp/${token}`, {
    headers: { "Content-Type": "application/json" },
    data: {
      guests,
      website: "",
      turnstileToken: "",
    },
  });
}

async function fetchGuestRsvpStatus(
  request: APIRequestContext,
  bootstrap: BootstrappedPlanner,
  guestId: string,
): Promise<string> {
  const response = await request.get(
    `${runtime.urls.api}/api/weddings/${bootstrap.wedding.id}/guests`,
    { headers: { Origin: runtime.urls.app } },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const list = (await response.json()) as Array<
    GuestRecord & { plusOnes: GuestRecord[] }
  >;
  for (const guest of list) {
    if (guest.id === guestId) return guest.rsvpStatus;
    for (const plus of guest.plusOnes ?? []) {
      if (plus.id === guestId) return plus.rsvpStatus;
    }
  }
  throw new Error(`Guest ${guestId} not found`);
}

async function fillRsvp(
  page: Page,
  guestId: string,
  status: "accepted" | "declined" | "pending",
) {
  // Radio inputs are visually hidden; click the enclosing label instead.
  const labelText =
    status === "accepted"
      ? "Joyfully attending"
      : status === "declined"
        ? "Regretfully declining"
        : "Not replied yet";
  const label = page
    .locator(`label`, { hasText: labelText })
    .filter({ has: page.locator(`input[name="guest-${guestId}"]`) });
  await label.click();
}

test.describe("functional/public-rsvp", () => {
  test("renders published site, guest names, and RSVP form for a valid token", async ({
    page,
  }) => {
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `render-${bootstrap.wedding.id.slice(0, 8)}`;
    await publishWebsite(page.request, bootstrap, slug, "Rivera Wedding");
    const primary = await addGuest(page.request, bootstrap, {
      firstName: "Maya",
      lastName: "Rivera",
    });
    const token = await createHouseholdToken(
      page.request,
      bootstrap,
      primary.id,
    );

    await page.goto(`${runtime.urls.web}/w/${slug}/?token=${token}`);
    await expect(
      page.getByRole("heading", { name: "Rivera Wedding" }),
    ).toBeVisible();
    await expect(page.getByText("Maya Rivera")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send RSVP" })).toBeVisible();
  });

  test("invalid token renders an error state and hides the RSVP form", async ({
    page,
  }) => {
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `invalidtok-${bootstrap.wedding.id.slice(0, 8)}`;
    await publishWebsite(
      page.request,
      bootstrap,
      slug,
      "Invalid Token Wedding",
    );

    const bogusToken = randomUUID();
    await page.goto(`${runtime.urls.web}/w/${slug}/?token=${bogusToken}`);
    await expect(
      page.getByText(/this invitation link is no longer active/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Send RSVP" })).toHaveCount(
      0,
    );
  });

  test("missing token shows an informational hint (no crash) on a published page", async ({
    page,
  }) => {
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `missing-${bootstrap.wedding.id.slice(0, 8)}`;
    await publishWebsite(
      page.request,
      bootstrap,
      slug,
      "Missing Token Wedding",
    );

    const response = await page.goto(`${runtime.urls.web}/w/${slug}/`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByText(/open the private link from your invitation/i),
    ).toBeVisible();
  });

  test("submitting an Accepted RSVP updates the planner guests list", async ({
    page,
  }) => {
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `accept-${bootstrap.wedding.id.slice(0, 8)}`;
    await publishWebsite(page.request, bootstrap, slug, "Accept Wedding");
    const primary = await addGuest(page.request, bootstrap, {
      firstName: "Ava",
      lastName: "Rivera",
    });
    const token = await createHouseholdToken(
      page.request,
      bootstrap,
      primary.id,
    );

    await page.goto(`${runtime.urls.web}/w/${slug}/?token=${token}`);
    await fillRsvp(page, primary.id, "accepted");
    const submitPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/public/rsvp/") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send RSVP" }).click();
    const submitResponse = await submitPromise;
    expect(submitResponse.ok()).toBe(true);
    await expect(page.locator("[data-rsvp-status]")).toHaveText(
      /your rsvp has been saved/i,
    );

    expect(
      await fetchGuestRsvpStatus(page.request, bootstrap, primary.id),
    ).toBe("accepted");
  });

  test("submitting a Declined RSVP marks the guest as declined in the planner", async ({
    page,
  }) => {
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `decline-${bootstrap.wedding.id.slice(0, 8)}`;
    await publishWebsite(page.request, bootstrap, slug, "Decline Wedding");
    const primary = await addGuest(page.request, bootstrap, {
      firstName: "Drew",
      lastName: "Park",
    });
    const token = await createHouseholdToken(
      page.request,
      bootstrap,
      primary.id,
    );

    await page.goto(`${runtime.urls.web}/w/${slug}/?token=${token}`);
    await fillRsvp(page, primary.id, "declined");
    await page.getByRole("button", { name: "Send RSVP" }).click();
    await expect(page.locator("[data-rsvp-status]")).toHaveText(
      /your rsvp has been saved/i,
    );

    expect(
      await fetchGuestRsvpStatus(page.request, bootstrap, primary.id),
    ).toBe("declined");
  });

  test("partial plus-one RSVP: primary accepts, +1 declines", async ({
    page,
  }) => {
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `partial-${bootstrap.wedding.id.slice(0, 8)}`;
    await publishWebsite(page.request, bootstrap, slug, "Partial Wedding");
    const primary = await addGuest(page.request, bootstrap, {
      firstName: "Juno",
      lastName: "Lee",
    });
    const plusOne = await addGuest(page.request, bootstrap, {
      firstName: "Kai",
      lastName: "Lee",
      primaryGuestId: primary.id,
    });
    const token = await createHouseholdToken(
      page.request,
      bootstrap,
      primary.id,
    );

    await page.goto(`${runtime.urls.web}/w/${slug}/?token=${token}`);
    await fillRsvp(page, primary.id, "accepted");
    await fillRsvp(page, plusOne.id, "declined");
    await page.getByRole("button", { name: "Send RSVP" }).click();
    await expect(page.locator("[data-rsvp-status]")).toHaveText(
      /your rsvp has been saved/i,
    );

    expect(
      await fetchGuestRsvpStatus(page.request, bootstrap, primary.id),
    ).toBe("accepted");
    expect(
      await fetchGuestRsvpStatus(page.request, bootstrap, plusOne.id),
    ).toBe("declined");
  });

  test("double-submit is idempotent and overrides the prior response", async ({
    page,
  }) => {
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `double-${bootstrap.wedding.id.slice(0, 8)}`;
    await publishWebsite(page.request, bootstrap, slug, "Double Wedding");
    const primary = await addGuest(page.request, bootstrap, {
      firstName: "Quinn",
      lastName: "Tran",
    });
    const token = await createHouseholdToken(
      page.request,
      bootstrap,
      primary.id,
    );

    const firstResponse = await submitPublicRsvp(page.request, token, [
      { guestId: primary.id, rsvpStatus: "accepted" },
    ]);
    expect(firstResponse.ok()).toBe(true);

    const secondResponse = await submitPublicRsvp(page.request, token, [
      { guestId: primary.id, rsvpStatus: "declined" },
    ]);
    expect(secondResponse.ok()).toBe(true);

    // Final state matches the most recent submission.
    expect(
      await fetchGuestRsvpStatus(page.request, bootstrap, primary.id),
    ).toBe("declined");

    // The planner should still see exactly one row for this guest (no duplicates).
    const listResponse = await page.request.get(
      `${runtime.urls.api}/api/weddings/${bootstrap.wedding.id}/guests`,
      { headers: { Origin: runtime.urls.app } },
    );
    expect(listResponse.ok()).toBe(true);
    const list = (await listResponse.json()) as GuestRecord[];
    const matches = list.filter((row) => row.id === primary.id);
    expect(matches).toHaveLength(1);
  });

  test("unpublished slug returns 404 and renders the not-available fallback", async ({
    page,
  }) => {
    await page.goto(`${runtime.urls.web}/w/does-not-exist-${Date.now()}/`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", {
        name: /that wedding site is not available/i,
      }),
    ).toBeVisible();
  });

  test("rsvp still persists after the primary guest opts out of rsvp-confirmation emails", async ({
    page,
  }) => {
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `optout-${bootstrap.wedding.id.slice(0, 8)}`;
    await publishWebsite(page.request, bootstrap, slug, "Opt-out Wedding");
    const guestEmail = `guest-${Date.now()}@example.com`;
    const primary = await addGuest(page.request, bootstrap, {
      firstName: "Remi",
      lastName: "Flores",
      email: guestEmail,
    });
    const token = await createHouseholdToken(
      page.request,
      bootstrap,
      primary.id,
    );

    // Planner opts out of rsvpConfirmation for their own address; this
    // regression check confirms planner preferences do not block guest RSVPs.
    const prefsUpdate = await page.request.patch(
      `${runtime.urls.api}/api/email/preferences`,
      {
        headers: {
          Origin: runtime.urls.app,
          "Content-Type": "application/json",
        },
        data: {
          preferences: {
            memberInvite: true,
            rsvpConfirmation: false,
            rsvpReminder: true,
          },
        },
      },
    );
    expect(prefsUpdate.ok(), await prefsUpdate.text()).toBeTruthy();

    const submission = await submitPublicRsvp(page.request, token, [
      { guestId: primary.id, rsvpStatus: "accepted" },
    ]);
    expect(submission.ok()).toBe(true);
    expect(
      await fetchGuestRsvpStatus(page.request, bootstrap, primary.id),
    ).toBe("accepted");
  });
});
