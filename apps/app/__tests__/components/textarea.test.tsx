import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Textarea } from "../../src/components/ui/textarea";

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
  });

  it("applies additional className", () => {
    render(<Textarea className="custom-class" data-testid="ta" />);
    const el = screen.getByTestId("ta");
    expect(el.className).toContain("custom-class");
  });

  it("forwards ref to the underlying textarea element", () => {
    const ref = { current: null as HTMLTextAreaElement | null };
    render(<Textarea ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it("forwards arbitrary props to the textarea", () => {
    render(<Textarea rows={5} data-testid="ta2" />);
    const el = screen.getByTestId("ta2") as HTMLTextAreaElement;
    expect(el.rows).toBe(5);
  });
});
