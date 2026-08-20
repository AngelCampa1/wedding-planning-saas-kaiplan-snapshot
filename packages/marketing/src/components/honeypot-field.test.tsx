import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HoneypotField } from "./honeypot-field";

afterEach(() => {
  cleanup();
});

describe("HoneypotField", () => {
  it("renders a text input named exactly company_website", () => {
    render(<HoneypotField value="" onChange={vi.fn()} />);
    const input = document.querySelector<HTMLInputElement>(
      'input[name="company_website"]',
    );
    expect(input).not.toBeNull();
    expect(input?.type).toBe("text");
  });

  it("is removed from the tab order and disables autofill", () => {
    render(<HoneypotField value="" onChange={vi.fn()} />);
    const input = document.querySelector<HTMLInputElement>(
      'input[name="company_website"]',
    );
    expect(input?.tabIndex).toBe(-1);
    expect(input?.getAttribute("autocomplete")).toBe("off");
  });

  it("has no aria-hidden ancestor over the focusable input (axe aria-hidden-focus)", () => {
    render(<HoneypotField value="" onChange={vi.fn()} />);
    const input = document.querySelector<HTMLInputElement>(
      'input[name="company_website"]',
    );
    expect(input).not.toBeNull();
    let ancestor: HTMLElement | null = input;
    while (ancestor) {
      expect(ancestor.getAttribute("aria-hidden")).not.toBe("true");
      ancestor = ancestor.parentElement;
    }
  });

  it("exposes no meaningful accessible name to assistive tech", () => {
    render(<HoneypotField value="" onChange={vi.fn()} />);
    const input = document.querySelector<HTMLInputElement>(
      'input[name="company_website"]',
    );
    expect(input?.getAttribute("aria-label")).toBe("");
  });

  it("forwards typed values via onChange", () => {
    const onChange = vi.fn();
    render(<HoneypotField value="" onChange={onChange} />);
    const input = screen.getByDisplayValue("");
    fireEvent.change(input, { target: { value: "bot-value" } });
    expect(onChange).toHaveBeenCalledWith("bot-value");
  });
});
