import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedbackWidget } from "../../src/components/feedback-widget";
import * as useSessionModule from "../../src/hooks/use-session";

vi.mock("../../src/hooks/use-session", () => ({
  useSession: vi.fn(() => ({
    data: { user: { email: "logged-in@example.com" } },
  })),
}));

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { apiFetch } from "../../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

describe("FeedbackWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders floating button with aria-label Send feedback", () => {
    render(<FeedbackWidget />);
    expect(
      screen.getByRole("button", { name: "Send feedback" }),
    ).toBeInTheDocument();
  });

  it("opens dialog on button click", async () => {
    render(<FeedbackWidget />);
    const button = screen.getByRole("button", { name: "Send feedback" });
    await userEvent.click(button);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("prefills email from useSession", async () => {
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const emailInput = screen.getByDisplayValue("logged-in@example.com");
    expect(emailInput).toBeInTheDocument();
  });

  it("shows validation error when message is empty and form is submitted", async () => {
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const submitButton = screen.getByRole("button", { name: /send/i });
    await userEvent.click(submitButton);
    expect(screen.getByText(/message is required/i)).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("shows success state after successful apiFetch", async () => {
    mockedApiFetch.mockResolvedValue({ ok: true });
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const textarea = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(textarea, "Great app!");
    const submitButton = screen.getByRole("button", { name: /send/i });
    await userEvent.click(submitButton);
    await waitFor(() => {
      expect(screen.getByText(/thanks/i)).toBeInTheDocument();
    });
  });

  it("uses apiFetch (not raw fetch) so 401 errors go through the global handler", async () => {
    mockedApiFetch.mockResolvedValue({ ok: true });
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const textarea = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(textarea, "Great app!");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/api/feedback",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("passes correct body to apiFetch including message and pageUrl", async () => {
    mockedApiFetch.mockResolvedValue({ ok: true });
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const textarea = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(textarea, "Hello feedback");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalled();
    });
    const callArgs = mockedApiFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string) as {
      message: string;
      pageUrl: string;
    };
    expect(body.message).toBe("Hello feedback");
    expect(typeof body.pageUrl).toBe("string");
  });

  it("shows error state when apiFetch rejects", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network error"));
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const textarea = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(textarea, "Feedback text");
    const submitButton = screen.getByRole("button", { name: /send/i });
    await userEvent.click(submitButton);
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  it("disables submit button while submitting", async () => {
    let resolveFetch!: () => void;
    mockedApiFetch.mockReturnValue(
      new Promise<{ ok: boolean }>((resolve) => {
        resolveFetch = () => resolve({ ok: true });
      }),
    );
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const textarea = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(textarea, "Some feedback");
    const submitButton = screen.getByRole("button", { name: /send/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    });

    await act(async () => {
      resolveFetch();
    });
  });

  it("allows editing the email field", async () => {
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const emailInput = screen.getByDisplayValue("logged-in@example.com");
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "new@example.com");
    expect(emailInput).toHaveValue("new@example.com");
  });

  it("prefills empty email when user has no email in session", async () => {
    vi.mocked(useSessionModule.useSession).mockReturnValueOnce({
      data: null,
    } as unknown as ReturnType<typeof useSessionModule.useSession>);
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const emailInput = screen.getByLabelText(/your email/i) as HTMLInputElement;
    expect(emailInput.value).toBe("");
  });

  it("sends undefined for email when field is empty", async () => {
    mockedApiFetch.mockResolvedValue({ ok: true });
    vi.mocked(useSessionModule.useSession).mockReturnValueOnce({
      data: null,
    } as unknown as ReturnType<typeof useSessionModule.useSession>);
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const textarea = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(textarea, "No email feedback");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalled();
    });
    const callArgs = mockedApiFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string) as {
      email?: string;
    };
    expect(body.email).toBeUndefined();
  });

  it("auto-closes the dialog 2 seconds after successful submission", async () => {
    mockedApiFetch.mockResolvedValue({ ok: true });
    render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /message/i }),
      "Great app!",
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(screen.getByText(/thanks/i)).toBeInTheDocument(),
    );
    await waitFor(
      () => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
  }, 10000);

  it("clears the auto-close timeout when unmounted to prevent memory leaks", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    mockedApiFetch.mockResolvedValue({ ok: true });

    const { unmount } = render(<FeedbackWidget />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /message/i }),
      "Great app!",
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    // Wait for success state (which sets the timeout)
    await waitFor(() =>
      expect(screen.getByText(/thanks/i)).toBeInTheDocument(),
    );

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("resets form state when dialog is reopened", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network error"));
    render(<FeedbackWidget />);

    // Open and trigger error
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    const textarea = screen.getByRole("textbox", { name: /message/i });
    await userEvent.type(textarea, "Some feedback");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    // Close by pressing Escape
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Reopen
    await userEvent.click(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });
});
