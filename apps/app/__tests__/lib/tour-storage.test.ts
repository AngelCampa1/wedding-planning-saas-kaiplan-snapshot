import { describe, expect, it } from "vitest";
import {
  getBrowserStorage,
  hasOpenedSeating,
  markSeatingOpened,
  queueTour,
  readHelpMode,
  readTourStatus,
  shouldAutoStartTour,
  writeHelpMode,
  writeTourStatus,
} from "../../src/lib/tour-storage";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("tour storage", () => {
  it("queues tours without overwriting completed or skipped status", () => {
    const storage = createStorage();

    queueTour("dashboard", storage);
    expect(readTourStatus("dashboard", storage)).toBe("queued");
    expect(shouldAutoStartTour("dashboard", storage)).toBe(true);

    writeTourStatus("dashboard", "completed", storage);
    queueTour("dashboard", storage);
    expect(readTourStatus("dashboard", storage)).toBe("completed");

    writeTourStatus("dashboard", "skipped", storage);
    queueTour("dashboard", storage);
    expect(readTourStatus("dashboard", storage)).toBe("skipped");
  });

  it("persists help mode and seating-opened state", () => {
    const storage = createStorage();

    expect(readHelpMode(storage)).toBe(false);
    writeHelpMode(true, storage);
    expect(readHelpMode(storage)).toBe(true);
    writeHelpMode(false, storage);
    expect(readHelpMode(storage)).toBe(false);

    expect(hasOpenedSeating(storage)).toBe(false);
    markSeatingOpened(storage);
    expect(hasOpenedSeating(storage)).toBe(true);
  });

  it("ignores unknown tour status values", () => {
    const storage = createStorage();
    storage.setItem("kaiplan:tour:dashboard:status", "mystery");

    expect(readTourStatus("dashboard", storage)).toBeNull();
  });

  it("returns browser storage when available", () => {
    expect(getBrowserStorage()).toBe(window.localStorage);
  });

  it("handles storage access failures", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    expect(getBrowserStorage()).toBeNull();

    if (original) {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});
