import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VendorDetail } from "@kaiplan/shared";
import { VendorForm } from "../../../src/components/vendor/vendor-form";

const categories = [
  {
    id: "cat-1",
    weddingId: "wedding-1",
    name: "Photography",
    estimatedCents: 250000,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "cat-2",
    weddingId: "wedding-1",
    name: "Music",
    estimatedCents: 150000,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

function makeVendor(overrides: Partial<VendorDetail> = {}): VendorDetail {
  return {
    id: "vendor-1",
    weddingId: "wedding-1",
    categoryId: "cat-1",
    primaryContactName: "Sofia Ramos",
    companyName: "Golden Hour Photo",
    email: "hello@example.com",
    phone: "555-1234",
    contractStatus: "sent",
    contractUrl: "https://example.com/contract",
    contractSentAt: "2026-04-01",
    contractSignedAt: null,
    notes: "Bring film backup",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    categoryName: "Photography",
    quotes: [],
    ...overrides,
  };
}

describe("VendorForm", () => {
  it("submits create values and normalizes empty optional fields to null", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <VendorForm
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        categories={categories}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveClass(
      "max-h-[calc(100dvh-2rem)]",
      "overflow-y-auto",
    );
    await user.type(screen.getByLabelText("Primary contact"), "Sofia Ramos");
    await user.type(screen.getByLabelText("Company"), "Golden Hour Photo");
    await user.selectOptions(screen.getByLabelText("Budget category"), "cat-2");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith({
      primaryContactName: "Sofia Ramos",
      companyName: "Golden Hour Photo",
      email: null,
      phone: null,
      categoryId: "cat-2",
      contractStatus: "none",
      contractUrl: null,
      contractSentAt: null,
      contractSignedAt: null,
      notes: null,
    });
  });

  it("renders edit values, supports cancel, and shows the saving label", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <VendorForm
        open
        onOpenChange={onOpenChange}
        onSubmit={() => {}}
        categories={categories}
        initialValues={makeVendor()}
        isSubmitting
      />,
    );

    expect(screen.getByLabelText("Primary contact")).toHaveValue("Sofia Ramos");
    expect(screen.getByLabelText("Company")).toHaveValue("Golden Hour Photo");
    expect(screen.getByLabelText("Contract URL")).toHaveValue(
      "https://example.com/contract",
    );
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("updates every editable field and preserves populated optional values", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <VendorForm
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        categories={categories}
        initialValues={makeVendor({ contractSignedAt: "2026-04-05" })}
      />,
    );

    await user.clear(screen.getByLabelText("Primary contact"));
    await user.type(screen.getByLabelText("Primary contact"), "Alex Flores");
    await user.clear(screen.getByLabelText("Company"));
    await user.type(screen.getByLabelText("Company"), "Moonlit Events");
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "alex@moonlit.test");
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "555-6789");
    await user.selectOptions(screen.getByLabelText("Budget category"), "cat-2");
    await user.selectOptions(
      screen.getByLabelText("Contract status"),
      "signed",
    );
    await user.clear(screen.getByLabelText("Contract URL"));
    await user.type(
      screen.getByLabelText("Contract URL"),
      "https://moonlit.test/contract",
    );
    await user.clear(screen.getByLabelText("Contract sent"));
    await user.type(screen.getByLabelText("Contract sent"), "2026-04-10");
    await user.clear(screen.getByLabelText("Contract signed"));
    await user.type(screen.getByLabelText("Contract signed"), "2026-04-12");
    await user.clear(screen.getByLabelText("Notes"));
    await user.type(screen.getByLabelText("Notes"), "Need uplighting add-on");
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(onSubmit).toHaveBeenCalledWith({
      primaryContactName: "Alex Flores",
      companyName: "Moonlit Events",
      email: "alex@moonlit.test",
      phone: "555-6789",
      categoryId: "cat-2",
      contractStatus: "signed",
      contractUrl: "https://moonlit.test/contract",
      contractSentAt: "2026-04-10",
      contractSignedAt: "2026-04-12",
      notes: "Need uplighting add-on",
    });
  }, 15000);

  it("slices full ISO datetime strings to YYYY-MM-DD for date inputs", async () => {
    render(
      <VendorForm
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        categories={categories}
        initialValues={makeVendor({
          contractSentAt: "2026-06-01T00:00:00Z",
          contractSignedAt: "2026-06-15T12:30:00.000Z",
        })}
      />,
    );

    const sentInput = screen.getByLabelText(
      "Contract sent",
    ) as HTMLInputElement;
    const signedInput = screen.getByLabelText(
      "Contract signed",
    ) as HTMLInputElement;

    expect(sentInput.value).toBe("2026-06-01");
    expect(signedInput.value).toBe("2026-06-15");
  });

  it("handles null date values without breaking the date inputs", () => {
    render(
      <VendorForm
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        categories={categories}
        initialValues={makeVendor({
          contractSentAt: null,
          contractSignedAt: null,
        })}
      />,
    );

    const sentInput = screen.getByLabelText(
      "Contract sent",
    ) as HTMLInputElement;
    const signedInput = screen.getByLabelText(
      "Contract signed",
    ) as HTMLInputElement;

    expect(sentInput.value).toBe("");
    expect(signedInput.value).toBe("");
  });

  it("guides the user when no budget categories exist yet", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <VendorForm
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        categories={[]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Create a budget category" }),
    ).toHaveAttribute("href", "/budget");
    expect(screen.getByText(/first to save this vendor\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();

    await user.type(screen.getByLabelText("Primary contact"), "Luna Events");
    await user.type(screen.getByLabelText("Company"), "Luna Events Co.");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
