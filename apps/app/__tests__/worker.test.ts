import { describe, expect, it, vi } from "vitest";
import worker from "../src/worker";

describe("app worker", () => {
  it("delegates requests to the static asset binding", async () => {
    const request = new Request("https://app.kaiplan.app/dashboard");
    const response = new Response("asset response", { status: 200 });
    const fetch = vi.fn().mockResolvedValue(response);

    await expect(
      worker.fetch(request, {
        ASSETS: { fetch },
      }),
    ).resolves.toBe(response);
    expect(fetch).toHaveBeenCalledWith(request);
  });
});
