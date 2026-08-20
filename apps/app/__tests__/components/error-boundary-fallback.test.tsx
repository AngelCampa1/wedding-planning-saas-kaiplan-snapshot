import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundaryFallback } from "../../src/components/error-boundary-fallback";

const { captureRouteErrorOnceMock } = vi.hoisted(() => ({
  captureRouteErrorOnceMock: vi.fn(() => "event-route-123"),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../src/lib/sentry", () => ({
  captureRouteErrorOnce: (error: unknown) => captureRouteErrorOnceMock(error),
}));

describe("ErrorBoundaryFallback", () => {
  it("renders the error heading and label", () => {
    render(<ErrorBoundaryFallback error={new Error("Something exploded")} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("displays the error message passed in", () => {
    render(<ErrorBoundaryFallback error={new Error("Connection timeout")} />);

    expect(screen.getByText("Connection timeout")).toBeInTheDocument();
  });

  it("renders a Go home link pointing to /", () => {
    render(<ErrorBoundaryFallback error={new Error("Oops")} />);

    const link = screen.getByRole("link", { name: "Go home" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders the Go home link as an outline Button (no hand-rolled rounded-full border classes)", () => {
    render(<ErrorBoundaryFallback error={new Error("Oops")} />);

    const link = screen.getByRole("link", { name: "Go home" });
    expect(link).toHaveAttribute("data-slot", "button");
    expect(link).toHaveAttribute("data-variant", "outline");
  });

  it("renders a main landmark for accessibility", () => {
    render(<ErrorBoundaryFallback error={new Error("Oops")} />);

    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("shows different error messages for different errors", () => {
    const { rerender } = render(
      <ErrorBoundaryFallback error={new Error("First error")} />,
    );
    expect(screen.getByText("First error")).toBeInTheDocument();

    rerender(<ErrorBoundaryFallback error={new Error("Second error")} />);
    expect(screen.getByText("Second error")).toBeInTheDocument();
    expect(screen.queryByText("First error")).not.toBeInTheDocument();
  });

  it("shows a generic message in production (import.meta.env.DEV = false)", () => {
    vi.stubEnv("DEV", false);
    try {
      render(
        <ErrorBoundaryFallback error={new Error("SELECT * FROM passwords")} />,
      );
      expect(
        screen.getByText(
          "An unexpected error occurred. Please try refreshing the page.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("SELECT * FROM passwords"),
      ).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("renders a custom action node instead of the default Go home link", () => {
    render(
      <ErrorBoundaryFallback
        error={new Error("Oops")}
        action={<button>Retry</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Go home" }),
    ).not.toBeInTheDocument();
  });

  it("reports route errors only when requested", () => {
    const error = new Error("Route exploded");

    render(<ErrorBoundaryFallback error={error} />);
    expect(captureRouteErrorOnceMock).not.toHaveBeenCalled();

    render(<ErrorBoundaryFallback error={error} reportError />);
    expect(captureRouteErrorOnceMock).toHaveBeenCalledWith(error);
  });

  it("shows a reference id when reporting returns one", () => {
    render(<ErrorBoundaryFallback error={new Error("Oops")} reportError />);

    expect(
      screen.getByText("Reference ID: event-route-123"),
    ).toBeInTheDocument();
  });
});
