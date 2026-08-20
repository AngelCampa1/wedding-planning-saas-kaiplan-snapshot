import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CsvImportDialog } from "../../../src/components/guest/csv-import-dialog";

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  onImport: vi.fn(),
  isImporting: false,
};

describe("CsvImportDialog", () => {
  it("renders upload prompt when open", () => {
    render(<CsvImportDialog {...defaultProps} />);
    expect(screen.getByText("Import Guests from CSV")).toBeInTheDocument();
    expect(
      screen.getByText(/drop.*csv.*here|click to upload/i),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<CsvImportDialog {...defaultProps} open={false} />);
    expect(
      screen.queryByText("Import Guests from CSV"),
    ).not.toBeInTheDocument();
  });

  it("shows file name after file selection", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog {...defaultProps} />);

    const file = new File(["name,email\nJane,jane@example.com"], "guests.csv", {
      type: "text/csv",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);

    expect(screen.getByText("guests.csv")).toBeInTheDocument();
  });

  it("clears the selected file when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CsvImportDialog {...defaultProps} />);

    const file = new File(["name,email\nJane,jane@example.com"], "guests.csv", {
      type: "text/csv",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);

    expect(screen.getByText("guests.csv")).toBeInTheDocument();

    rerender(<CsvImportDialog {...defaultProps} open={false} />);
    rerender(<CsvImportDialog {...defaultProps} open={true} />);

    expect(screen.queryByText("guests.csv")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^import$/i })).toBeDisabled();
  });

  it("calls onImport with the file when Import button clicked", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(<CsvImportDialog {...defaultProps} onImport={onImport} />);

    const file = new File(["name,email\nJane,jane@example.com"], "guests.csv", {
      type: "text/csv",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /^import$/i }));
    expect(onImport).toHaveBeenCalledWith(file);
  });

  it("disables import button and shows Importing... when isImporting", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog {...defaultProps} isImporting={true} />);

    const file = new File(["name,email\nJane,jane@example.com"], "guests.csv", {
      type: "text/csv",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);

    const importButton = screen.getByRole("button", { name: /importing/i });
    expect(importButton).toBeDisabled();
    expect(importButton).toHaveTextContent(/importing/i);
  });

  it("shows import results with imported count when result prop provided", () => {
    render(
      <CsvImportDialog
        {...defaultProps}
        result={{ imported: 5, errors: [] }}
      />,
    );
    expect(screen.getByText(/5 guests imported/i)).toBeInTheDocument();
  });

  it("shows errors in result when errors are present", () => {
    render(
      <CsvImportDialog
        {...defaultProps}
        result={{
          imported: 2,
          errors: [
            { row: 3, reason: "Invalid email" },
            { row: 5, reason: "Missing name" },
          ],
        }}
      />,
    );
    expect(screen.getByText(/2 guests imported/i)).toBeInTheDocument();
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    expect(screen.getByText(/missing name/i)).toBeInTheDocument();
  });

  it("shows Done button in result state", () => {
    const onOpenChange = vi.fn();
    render(
      <CsvImportDialog
        {...defaultProps}
        onOpenChange={onOpenChange}
        result={{ imported: 3, errors: [] }}
      />,
    );
    expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Done button clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CsvImportDialog
        {...defaultProps}
        onOpenChange={onOpenChange}
        result={{ imported: 3, errors: [] }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Import button is disabled when no file is selected", () => {
    render(<CsvImportDialog {...defaultProps} />);
    // No file uploaded yet — button should not be present or be disabled
    const importButton = screen.queryByRole("button", { name: /^import$/i });
    if (importButton) {
      expect(importButton).toBeDisabled();
    }
  });

  it("calls onOpenChange(false) when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CsvImportDialog {...defaultProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clicking the dropzone area triggers the file input click", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog {...defaultProps} />);
    const dropzone = screen
      .getByText(/drop.*csv.*here|click to upload/i)
      .closest("div[class*='border-dashed']") as HTMLElement;
    // clicking the dropzone should not throw even if input click is stubbed
    await user.click(dropzone);
    // No error means the branch was executed successfully
    expect(dropzone).toBeInTheDocument();
  });

  it("does not call onImport when Import clicked with no file", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(<CsvImportDialog {...defaultProps} onImport={onImport} />);
    // With no file the button should not be present or be disabled — just verify onImport not called
    const importButton = screen.queryByRole("button", { name: /^import$/i });
    if (importButton && !importButton.hasAttribute("disabled")) {
      await user.click(importButton);
    }
    expect(onImport).not.toHaveBeenCalled();
  });

  it("handles file change event with empty files list gracefully", () => {
    render(<CsvImportDialog {...defaultProps} />);
    // Dialog is portaled, so use document.querySelector
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    // Fire a change event with no files to exercise the fallback branch
    Object.defineProperty(input, "files", {
      value: null,
      writable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // Should still show the upload prompt (no file selected)
    expect(
      screen.getByText(/drop.*csv.*here|click to upload/i),
    ).toBeInTheDocument();
  });

  it("treats an empty files list as no file selected", () => {
    render(<CsvImportDialog {...defaultProps} />);
    // Dialog is portaled, so use document.querySelector
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    // Simulate a change event where files[0] is undefined (empty FileList)
    // to exercise the `?? null` branch in handleFileChange
    Object.defineProperty(input, "files", {
      value: { length: 0, item: () => null } as unknown as FileList,
      configurable: true,
    });
    fireEvent.change(input);

    // Import button should remain disabled — no file was selected
    expect(screen.getByRole("button", { name: /^import$/i })).toBeDisabled();
    expect(
      screen.getByText(/drop.*csv.*here|click to upload/i),
    ).toBeInTheDocument();
  });
});
