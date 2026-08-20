import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  redirectFn: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  redirect: mocks.redirectFn,
  createFileRoute:
    () =>
    (config: {
      beforeLoad?: (arg: { context: unknown }) => void;
      component: unknown;
    }) => ({
      _config: config,
    }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("../../src/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: mocks.requestPasswordReset,
  },
}));

vi.mock("../../src/components/auth/auth-shell", () => ({
  AuthShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

import { ForgotPasswordPage, Route } from "../../src/routes/forgot-password";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPasswordReset.mockResolvedValue({ error: null });
  });

  it("beforeLoad redirects authenticated users to /dashboard", () => {
    mocks.redirectFn.mockImplementation((opts: { to: string }) => {
      throw new Error(`redirect:${opts.to}`);
    });

    const beforeLoad = (
      Route as unknown as {
        _config: {
          beforeLoad?: (arg: {
            context: { auth: { isAuthenticated: boolean } };
          }) => void;
        };
      }
    )._config?.beforeLoad;
    expect(beforeLoad).toBeDefined();

    expect(() =>
      beforeLoad!({ context: { auth: { isAuthenticated: true } } }),
    ).toThrow("redirect:/dashboard");
  });

  it("beforeLoad does NOT redirect unauthenticated users", () => {
    mocks.redirectFn.mockImplementation((opts: { to: string }) => {
      throw new Error(`redirect:${opts.to}`);
    });

    const beforeLoad = (
      Route as unknown as {
        _config: {
          beforeLoad?: (arg: {
            context: { auth: { isAuthenticated: boolean } };
          }) => void;
        };
      }
    )._config?.beforeLoad;
    expect(beforeLoad).toBeDefined();

    expect(() =>
      beforeLoad!({ context: { auth: { isAuthenticated: false } } }),
    ).not.toThrow();
  });

  it("submits the email and shows success message", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "angel@example.com",
      redirectTo: `${window.location.origin}/reset-password`,
    });

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    const user = userEvent.setup();
    mocks.requestPasswordReset.mockResolvedValue({
      error: { message: "No account found" },
    });
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "missing@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("No account found")).toBeInTheDocument();
  });

  it("shows fallback error message when error has no message", async () => {
    const user = userEvent.setup();
    mocks.requestPasswordReset.mockResolvedValue({
      error: {},
    });
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
  });

  it("shows fallback error message when requestPasswordReset throws", async () => {
    const user = userEvent.setup();
    mocks.requestPasswordReset.mockRejectedValue(new Error("Network error"));
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
  });
});
