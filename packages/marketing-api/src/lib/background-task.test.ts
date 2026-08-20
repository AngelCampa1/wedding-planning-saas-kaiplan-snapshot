import { describe, expect, it, vi } from "vitest";
import { scheduleBackgroundTask } from "./background-task";

describe("scheduleBackgroundTask", () => {
  it("uses waitUntil when available", async () => {
    const waitUntil = vi.fn();
    const task = Promise.resolve("done");

    scheduleBackgroundTask({ executionCtx: { waitUntil } }, task);

    expect(waitUntil).toHaveBeenCalledWith(task);
  });

  it("does not throw or block when waitUntil is unavailable", async () => {
    const task = Promise.reject(new Error("background failure"));

    expect(() =>
      scheduleBackgroundTask({ executionCtx: {} }, task),
    ).not.toThrow();
    await task.catch(() => undefined);
  });

  it("falls back when waitUntil throws", async () => {
    const waitUntil = vi.fn(() => {
      throw new Error("bad context");
    });
    const task = Promise.reject(new Error("background failure"));

    expect(() =>
      scheduleBackgroundTask({ executionCtx: { waitUntil } }, task),
    ).not.toThrow();
    await task.catch(() => undefined);
  });
});
