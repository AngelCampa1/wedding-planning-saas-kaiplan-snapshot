import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<object>("@tanstack/react-router");
  return {
    ...actual,
    useLocation: () => ({ pathname: "/dashboard" }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../../../src/lib/guidance-content", () => ({
  getHelpControl: () => null,
  getTourDefinition: (tourId: string) =>
    tourId === "targetless"
      ? {
          id: "targetless",
          title: "Targetless tour",
          description: "Exercises a centered step.",
          steps: [
            {
              route: "/dashboard",
              title: "Centered step",
              body: "This step has no highlighted target.",
            },
          ],
        }
      : undefined,
  helpControls: [],
}));

vi.mock("../../../src/lib/tour-storage", () => ({
  readHelpMode: () => false,
  shouldAutoStartTour: () => false,
  writeHelpMode: vi.fn(),
  writeTourStatus: vi.fn(),
}));

describe("TourProvider targetless steps", () => {
  it("centers a step that does not define a target key", async () => {
    const user = userEvent.setup();
    const { TourProvider, useTour } =
      await import("../../../src/components/guidance/tour-provider");

    function Harness() {
      const tour = useTour();
      return (
        <button type="button" onClick={() => tour.startTour("targetless")}>
          Start targetless tour
        </button>
      );
    }

    render(
      <TourProvider>
        <Harness />
      </TourProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Start targetless tour" }),
    );

    expect(screen.getByRole("dialog", { name: "Centered step" })).toHaveStyle({
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    });
  });
});
