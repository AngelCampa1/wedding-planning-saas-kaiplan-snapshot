import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricStrip } from "../../../src/components/ui/metric-strip";

const metrics = [
  { label: "Guests", value: "128", tone: "primary" as const },
  { label: "Confirmed", value: "96", tone: "success" as const },
  { label: "Pending", value: "32", tone: "warning" as const },
  { label: "Budget", value: "$24,000", tone: "accent" as const },
];

describe("MetricStrip", () => {
  it("renders auto-fit metrics with tone classes and custom props", () => {
    render(
      <MetricStrip
        items={metrics}
        className="test-strip"
        aria-label="Planning metrics"
      />,
    );

    const strip = screen.getByLabelText("Planning metrics");

    expect(strip).toHaveAttribute("data-slot", "metric-strip");
    expect(strip).toHaveClass(
      "sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]",
    );
    expect(strip).toHaveClass("test-strip");
    expect(screen.getByText("128")).toHaveClass("text-primary");
    expect(screen.getByText("96")).toHaveClass("text-success");
    expect(screen.getByText("32")).toHaveClass("text-warning");
    expect(screen.getByText("$24,000")).toHaveClass("text-accent");
  });

  it("supports fixed four and five column layouts with neutral values", () => {
    const { rerender } = render(
      <MetricStrip
        columns={4}
        items={[{ label: "Open tasks", value: "12" }]}
      />,
    );

    expect(screen.getByText("12")).toHaveClass("text-foreground");
    expect(screen.getByText("Open tasks").closest("[data-slot]")).toHaveClass(
      "sm:grid-cols-4",
    );

    rerender(
      <MetricStrip
        columns={5}
        items={[{ label: "Booked vendors", value: "7" }]}
      />,
    );

    expect(
      screen.getByText("Booked vendors").closest("[data-slot]"),
    ).toHaveClass("sm:grid-cols-5");
  });
});
