import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { bootstrapPlannerSession } from "../../helpers/planner-auth";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

async function createGuestViaApi(
  page: Page,
  weddingId: string,
  firstName: string,
  lastName: string,
  rsvpStatus: "accepted" | "invited" | "pending" = "accepted",
) {
  const response = await page.request.post(
    `${runtime.urls.api}/api/weddings/${weddingId}/guests`,
    {
      headers: { Origin: runtime.urls.app },
      data: {
        firstName,
        lastName,
        email: null,
        phone: null,
        side: "mutual",
        groupName: null,
        dietaryTags: [],
        dietaryNotes: null,
        rsvpStatus,
        primaryGuestId: null,
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { id: string };
}

async function fetchSeating(page: Page, weddingId: string) {
  const response = await page.request.get(
    `${runtime.urls.api}/api/weddings/${weddingId}/seating`,
    { headers: { Origin: runtime.urls.app } },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    chart: {
      width: number;
      height: number;
      tables: Array<{
        id: string;
        name: string;
        shape: "round" | "rectangle";
        capacity: number;
        x: number;
        y: number;
        orientation?: "horizontal" | "vertical";
        seats: Array<{ id: string; positionIndex: number; guestId?: string }>;
      }>;
    };
  };
}

async function saveSeating(
  page: Page,
  weddingId: string,
  chart: Awaited<ReturnType<typeof fetchSeating>>["chart"],
) {
  const response = await page.request.put(
    `${runtime.urls.api}/api/weddings/${weddingId}/seating`,
    {
      headers: { Origin: runtime.urls.app },
      data: chart,
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as Awaited<ReturnType<typeof fetchSeating>>;
}

test.describe("functional/seating", () => {
  test("empty state — no tables shows the add-a-table prompt", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createGuestViaApi(page, wedding.id, "Ready", "Guest");
    await page.goto(`${runtime.urls.app}/seating`);
    await expect(
      page.getByText(/add your first table to start placing guests/i),
    ).toBeVisible();
  });

  test("create, rename, change capacity, save, reload — persistence holds", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createGuestViaApi(page, wedding.id, "Ready", "Guest");
    await page.goto(`${runtime.urls.app}/seating`);

    await page.getByRole("button", { name: /add round table/i }).click();
    // Newly added table is auto-selected.
    const nameInput = page.locator('input[value^="Round Table"]').first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Head Table");

    const capacityInput = page.locator('input[type="number"]').first();
    await capacityInput.fill("10");
    // Blur to commit the numeric change before saving.
    await capacityInput.blur();

    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/weddings/${wedding.id}/seating`) &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: /save chart/i }).click();
    const saveResult = await saveResponse;
    expect(saveResult.ok()).toBeTruthy();

    await page.reload();
    await expect(page.getByText("Head Table")).toBeVisible();
    await expect(page.getByText("10 seats")).toBeVisible();
  });

  test("delete table removes it from the chart after confirmation", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createGuestViaApi(page, wedding.id, "Ready", "Guest");
    await page.goto(`${runtime.urls.app}/seating`);

    await page.getByRole("button", { name: /add round table/i }).click();
    const nameInput = page.locator('input[value^="Round Table"]').first();
    await nameInput.fill("Doomed Table");

    // The delete path uses window.confirm; auto-accept.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /delete table/i }).click();

    await expect(page.getByText("Doomed Table")).toBeHidden();
    await expect(
      page.getByText(/add your first table to start placing guests/i),
    ).toBeVisible();
  });

  test("capacity input is clamped (min 2, max 20) at the HTML level", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createGuestViaApi(page, wedding.id, "Ready", "Guest");
    await page.goto(`${runtime.urls.app}/seating`);

    await page.getByRole("button", { name: /add round table/i }).click();
    const capacityInput = page.locator('input[type="number"]').first();
    await expect(capacityInput).toHaveAttribute("min", "2");
    await expect(capacityInput).toHaveAttribute("max", "20");
  });

  test("keyboard: tab-to-focus and Enter on Add rectangle table", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createGuestViaApi(page, wedding.id, "Ready", "Guest");
    await page.goto(`${runtime.urls.app}/seating`);

    const addRect = page.getByRole("button", { name: /add rectangle/i });
    await addRect.focus();
    await expect(addRect).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText(/Rectangle Table 1/i)).toBeVisible();
  });

  test("assigning a guest via the API persists across reload", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    const guest = await createGuestViaApi(page, wedding.id, "Seat", "Me");

    await page.goto(`${runtime.urls.app}/seating`);
    await page.getByRole("button", { name: /add round table/i }).click();

    // Save to get a persisted table we can assign to.
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/weddings/${wedding.id}/seating`) &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: /save chart/i }).click();
    const saved = await saveResponse;
    expect(saved.ok()).toBeTruthy();

    const initial = await fetchSeating(page, wedding.id);
    expect(initial.chart.tables).toHaveLength(1);
    const table = initial.chart.tables[0];

    const updatedChart = {
      ...initial.chart,
      tables: [
        {
          ...table,
          seats: table.seats.map((seat, index) =>
            index === 0 ? { ...seat, guestId: guest.id } : seat,
          ),
        },
      ],
    };
    await saveSeating(page, wedding.id, updatedChart);

    await page.reload();
    await expect(page.getByText("Seat Me")).toBeVisible();
  });

  test("unassigning a guest via the API returns them to the rail", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    const guest = await createGuestViaApi(page, wedding.id, "Unseat", "Here");

    // Build a table with the guest already seated.
    const initial = await fetchSeating(page, wedding.id);
    const savedTableChart = {
      ...initial.chart,
      tables: [
        {
          id: randomUUID(),
          name: "Seeded",
          shape: "round" as const,
          capacity: 4,
          x: 100,
          y: 100,
          seats: Array.from({ length: 4 }, (_, index) => ({
            id: randomUUID(),
            positionIndex: index,
            guestId: index === 0 ? guest.id : undefined,
          })),
        },
      ],
    };
    await saveSeating(page, wedding.id, savedTableChart);

    await page.goto(`${runtime.urls.app}/seating`);
    await expect(page.getByText("Seeded")).toBeVisible();

    // Now unassign via API and confirm the guest is back on the rail.
    const unassignedChart = {
      ...savedTableChart,
      tables: [
        {
          ...savedTableChart.tables[0],
          seats: savedTableChart.tables[0].seats.map((seat, index) =>
            index === 0 ? { ...seat, guestId: undefined } : seat,
          ),
        },
      ],
    };
    await saveSeating(page, wedding.id, unassignedChart);

    await page.reload();
    await expect(
      page
        .locator("button")
        .filter({ hasText: /^Unseat Here/ })
        .first(),
    ).toBeVisible();
  });

  test("capacity resize below current assignments is limited by the API schema", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    const initial = await fetchSeating(page, wedding.id);
    const badChart = {
      ...initial.chart,
      tables: [
        {
          id: randomUUID(),
          name: "Too Small",
          shape: "round" as const,
          // Capacity of 1 is below the min=2 schema guard.
          capacity: 1,
          x: 100,
          y: 100,
          seats: [{ id: randomUUID(), positionIndex: 0 }],
        },
      ],
    };
    const response = await page.request.put(
      `${runtime.urls.api}/api/weddings/${wedding.id}/seating`,
      {
        headers: { Origin: runtime.urls.app },
        data: badChart,
      },
    );
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
