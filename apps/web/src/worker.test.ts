import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(() => new Response("astro-ok", { status: 202 })),
  runScheduledTasks: vi.fn(() => Promise.resolve()),
}));

vi.mock("@astrojs/cloudflare/handler", () => ({
  handle: mocks.handle,
}));

vi.mock("@kaiplan/marketing-api", () => ({
  runScheduledTasks: mocks.runScheduledTasks,
}));

import worker from "./worker";

describe("custom Cloudflare worker entrypoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates fetch requests to the Astro Cloudflare handler", async () => {
    const request = new Request("https://kaiplan.app/free/budget-template/");
    const env = { PRODUCT_NAME: "Kaiplan" };
    const ctx = { waitUntil: vi.fn() };

    const response = await worker.fetch(request, env as never, ctx as never);

    expect(await response.text()).toBe("astro-ok");
    expect(response.status).toBe(202);
    expect(mocks.handle).toHaveBeenCalledWith(request, env, ctx);
  });

  it("redirects apex HTTP requests before Astro static asset handling", async () => {
    const request = new Request("http://kaiplan.app/compare?utm_source=test");
    const response = await worker.fetch(request, {} as never, {} as never);

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://kaiplan.app/compare/?utm_source=test",
    );
    expect(mocks.handle).not.toHaveBeenCalledWith(
      request,
      expect.anything(),
      expect.anything(),
    );
  });

  it("redirects www requests before Astro static asset handling", async () => {
    const request = new Request("https://www.kaiplan.app/features?ref=nav");
    const response = await worker.fetch(request, {} as never, {} as never);

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://kaiplan.app/features/?ref=nav",
    );
    expect(mocks.handle).not.toHaveBeenCalledWith(
      request,
      expect.anything(),
      expect.anything(),
    );
  });

  it("redirects slashless HTTPS routes before static asset handling", async () => {
    const request = new Request("https://kaiplan.app/templates");
    const response = await worker.fetch(request, {} as never, {} as never);

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://kaiplan.app/templates/",
    );
    expect(mocks.handle).not.toHaveBeenCalledWith(
      request,
      expect.anything(),
      expect.anything(),
    );
  });

  it("redirects legacy editorial slugs before static asset handling", async () => {
    const request = new Request(
      "https://kaiplan.app/resources/guides/the-knot-ftc-investigation-explained/",
    );
    const response = await worker.fetch(request, {} as never, {} as never);

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://kaiplan.app/resources/guides/the-knot-platform-scrutiny/",
    );
    expect(mocks.handle).not.toHaveBeenCalledWith(
      request,
      expect.anything(),
      expect.anything(),
    );
  });

  it("dispatches scheduled marketing tasks through waitUntil", () => {
    const env = {};
    const promise = Promise.resolve();
    mocks.runScheduledTasks.mockReturnValueOnce(promise);
    const ctx = { waitUntil: vi.fn() };

    worker.scheduled({} as never, env as never, ctx as never);

    expect(mocks.runScheduledTasks).toHaveBeenCalledWith(env);
    expect(ctx.waitUntil).toHaveBeenCalledWith(promise);
  });
});
