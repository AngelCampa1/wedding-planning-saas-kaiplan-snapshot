import { describe, expect, it } from "vitest";
import { filterIndexableEntries } from "./indexable-content";

describe("filterIndexableEntries", () => {
  it("keeps entries that are indexable by default", () => {
    const entries = [
      { id: "a", data: { title: "A" } },
      { id: "b", data: { title: "B", noindex: false } },
    ];

    expect(filterIndexableEntries(entries)).toEqual(entries);
  });

  it("removes entries marked noindex", () => {
    const entries = [
      { id: "a", data: { title: "A", noindex: false } },
      { id: "b", data: { title: "B", noindex: true } },
      { id: "c", data: { title: "C" } },
    ];

    expect(filterIndexableEntries(entries)).toEqual([
      { id: "a", data: { title: "A", noindex: false } },
      { id: "c", data: { title: "C" } },
    ]);
  });
});
