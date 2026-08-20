import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

const routeSearch: { token?: string } = {};
const navigateFn = vi.fn();

const mocks = vi.hoisted(() => ({
  redirectFn: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  redirect: mocks.redirectFn,
  createFileRoute:
    () =>
    (config: {
      beforeLoad?: (arg: { context: unknown }) => void;
      component: unknown;
    }) => ({
      useSearch: () => routeSearch,
      _config: config,
    }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigateFn,
}));

vi.mock("../../src/lib/auth-client", () => ({
  authClient: {
    resetPassword: vi.fn(),
  },
}));

vi.mock("../../src/components/auth/auth-shell", () => ({
  AuthShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import {
  ResetPasswordPage,
  Route,
  validateResetPasswordSearch,
} from "../../src/routes/reset-password";
import { authClient } from "../../src/lib/auth-client";

const mockedResetPassword = vi.mocked(authClient.resetPassword);

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeSearch.token = "token-abc";
  });

  it("submits the new password with the token from search", async () => {
    const user = userEvent.setup();
    mockedResetPassword.mockResolvedValue({
      data: null,
      error: null,
    } as Awaited<ReturnType<typeof authClient.resetPassword>>);

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "strongpassword123");
    await user.click(screen.getByRole("button", { name: /Reset password/i }));

    expect(mockedResetPassword).toHaveBeenCalledWith({
      newPassword: "strongpassword123",
      token: "token-abc",
    });
  });

  it("requires 12-character passwords in the reset form", () => {
    render(<ResetPasswordPage />);

    const passwordInput = screen.getByLabelText("New password");
    expect(passwordInput).toHaveAttribute("minlength", "12");
    expect(passwordInput).toHaveAttribute(
      "placeholder",
      "At least 12 characters",
    );
  });

  it("shows a missing-token error when token is absent from search", async () => {
    const user = userEvent.setup();
    routeSearch.token = undefined;

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "anotherpass123");
    await user.click(screen.getByRole("button", { name: /Reset password/i }));

    expect(mockedResetPassword).not.toHaveBeenCalled();
    expect(
      screen.getByText(/This reset link is missing its token/i),
    ).toBeInTheDocument();
  });

  it("shows an error message when the reset call fails", async () => {
    const user = userEvent.setup();
    mockedResetPassword.mockResolvedValue({
      data: null,
      error: { message: "Token expired" },
    } as Awaited<ReturnType<typeof authClient.resetPassword>>);

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "anotherpass123");
    await user.click(screen.getByRole("button", { name: /Reset password/i }));

    expect(await screen.findByText("Token expired")).toBeInTheDocument();
  });

  it("validateResetPasswordSearch passes through a valid token", () => {
    expect(validateResetPasswordSearch({ token: "abc123" })).toEqual({
      token: "abc123",
    });
  });

  it("validateResetPasswordSearch drops non-string or empty tokens", () => {
    expect(validateResetPasswordSearch({})).toEqual({});
    expect(validateResetPasswordSearch({ token: "" })).toEqual({});
    expect(validateResetPasswordSearch({ token: 123 })).toEqual({});
    expect(validateResetPasswordSearch({ token: null })).toEqual({});
    expect(validateResetPasswordSearch({ token: undefined })).toEqual({});
  });

  it("navigates to /login?reset=success on successful reset", async () => {
    const user = userEvent.setup();
    mockedResetPassword.mockResolvedValue({
      data: null,
      error: null,
    } as Awaited<ReturnType<typeof authClient.resetPassword>>);

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "strongpassword123");
    await user.click(screen.getByRole("button", { name: /Reset password/i }));

    await vi.waitFor(() => {
      expect(navigateFn).toHaveBeenCalledWith({
        to: "/login",
        search: { reset: "success" },
      });
    });
  });

  it("shows fallback error when resetPassword throws", async () => {
    const user = userEvent.setup();
    mockedResetPassword.mockRejectedValue(new Error("Network error"));

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "strongpassword123");
    await user.click(screen.getByRole("button", { name: /Reset password/i }));

    expect(
      await screen.findByText("Password reset failed. Please try again."),
    ).toBeInTheDocument();
  });

  it("shows fallback error when error has no message", async () => {
    const user = userEvent.setup();
    mockedResetPassword.mockResolvedValue({
      data: null,
      error: {},
    } as Awaited<ReturnType<typeof authClient.resetPassword>>);

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "strongpassword123");
    await user.click(screen.getByRole("button", { name: /Reset password/i }));

    expect(
      await screen.findByText("Password reset failed. Please try again."),
    ).toBeInTheDocument();
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
});
