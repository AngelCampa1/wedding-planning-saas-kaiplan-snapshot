import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { ContentItem } from "../types";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));

import { FilterChipsIsland } from "./filter-chips-island";

const items: ContentItem[] = [
  {
    title: "Article A",
    href: "/a",
    description: "desc",
    publishedAt: "2024-01-01",
    updatedAt: "2024-01-01",
    buyerStage: "tofu",
    relatedPages: [],
  },
];

const defaultProps: ComponentProps<typeof FilterChipsIsland> = {
  items,
  filters: [
    {
      id: "buyerStage",
      label: "Stage",
      options: [{ value: "tofu", label: "Awareness" }],
    },
  ],
};

describe("FilterChipsIsland", () => {
  it("renders the filter chips UI", () => {
    render(<FilterChipsIsland {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: "Awareness" }),
    ).toBeInTheDocument();
  });

  it("renders the error-boundary fallback when the inner component throws", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const broken = {
      items: null,
    } as unknown as ComponentProps<typeof FilterChipsIsland>;

    try {
      render(<FilterChipsIsland {...broken} />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("passes items through to the inner FilterChips component", () => {
    render(<FilterChipsIsland {...defaultProps} />);

    // The filter chip button should be present
    expect(screen.getAllByRole("button", { name: "Awareness" })).toHaveLength(
      1,
    );
  });
});
