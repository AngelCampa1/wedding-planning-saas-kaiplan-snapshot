import { test, expect } from "@playwright/test";

test.describe("pricing CTA links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pricing/");
  });

  test("tier CTAs start a generic free trial without preselecting a plan", async ({
    page,
  }) => {
    const trialCtas = page.getByRole("link", { name: /Start free trial/ });

    await expect(trialCtas).toHaveCount(3);
    for (const cta of await trialCtas.all()) {
      await expect(cta).toHaveAttribute("href", /\/signup$/);
      await expect(cta).not.toHaveAttribute("href", /plan=/);
      await expect(cta).not.toHaveAttribute("href", /interval=year/);
    }
  });

  test("billing interval toggle leaves trial CTAs generic", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Monthly" }).click();

    const trialCtas = page.getByRole("link", { name: /Start free trial/ });
    await expect(trialCtas).toHaveCount(3);
    for (const cta of await trialCtas.all()) {
      await expect(cta).toHaveAttribute("href", /\/signup$/);
      await expect(cta).not.toHaveAttribute("href", /plan=/);
      await expect(cta).not.toHaveAttribute("href", /interval=year/);
    }
  });
});
