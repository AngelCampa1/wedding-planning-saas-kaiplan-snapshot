import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  redirectFn: vi.fn(),
  routeContext: { auth: { isAuthenticated: false } },
  signInSocial: vi.fn(),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  acceptPendingInvite: vi.fn(),
  storeInviteToken: vi.fn(),
  routeSearch: {} as {
    plan?: "starter" | "pro";
    interval?: "month" | "year";
    inviteToken?: string;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  redirect: mocks.redirectFn,
  createFileRoute:
    () =>
    (config: {
      beforeLoad?: (arg: { context: unknown; search: unknown }) => void;
      component: unknown;
    }) => ({
      useNavigate: () => mocks.navigate,
      useSearch: () => mocks.routeSearch,
      _config: config,
    }),
  Link: ({
    to,
    search,
    children,
  }: {
    to: string;
    search?: Record<string, string>;
    children: ReactNode;
  }) => {
    const params = search ? new URLSearchParams(search).toString() : "";
    return <a href={params ? `${to}?${params}` : to}>{children}</a>;
  },
}));

vi.mock("../../src/lib/auth-client", () => ({
  acceptPendingInvite: mocks.acceptPendingInvite,
  storeInviteToken: mocks.storeInviteToken,
  authClient: {
    signIn: {
      social: mocks.signInSocial,
      email: mocks.signInEmail,
    },
    signUp: {
      email: mocks.signUpEmail,
    },
  },
}));

import { SignupPage } from "../../src/routes/signup";
import { Route } from "../../src/routes/signup";

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.signInSocial.mockResolvedValue({});
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.signUpEmail.mockResolvedValue({ error: null });
    mocks.sendVerificationEmail.mockResolvedValue({ error: null });
    mocks.acceptPendingInvite.mockResolvedValue(undefined);
    mocks.storeInviteToken.mockReset();
    mocks.routeContext.auth.isAuthenticated = false;
    mocks.routeSearch = {};
  });

  it("signs up with email, accepts pending invites, and opens onboarding", async () => {
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Angel Campa");
    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(
      screen.getByRole("button", { name: "Create my planning workspace" }),
    );

    expect(mocks.signUpEmail).toHaveBeenCalledTimes(1);
    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(mocks.acceptPendingInvite).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: undefined,
    });
    expect(screen.queryByText("Check your email.")).not.toBeInTheDocument();
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("still renders signup when stored verification email cannot be read", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });

    render(<SignupPage />);

    expect(
      screen.getByRole("heading", { name: "Start your planning trial." }),
    ).toBeInTheDocument();

    getItemSpy.mockRestore();
  });

  it("frames signup as a full-app trial with plan choice later", () => {
    render(<SignupPage />);

    expect(
      screen.getByText(
        new RegExp(`full app access for ${TRIAL_DURATION_DAYS} days`, "i"),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/choose a plan later/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/card required/i)).not.toBeInTheDocument();
  });

  it("does not store verification state after signup", async () => {
    const user = userEvent.setup();
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Angel Campa");
    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(
      screen.getByRole("button", { name: "Create my planning workspace" }),
    );

    expect(screen.queryByText("Check your email.")).not.toBeInTheDocument();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: undefined,
    });

    setItemSpy.mockRestore();
  });

  it("sign-in link points to /login", () => {
    render(<SignupPage />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("signs in with Google and navigates to onboarding", async () => {
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/onboarding",
    });
    expect(mocks.storeInviteToken).not.toHaveBeenCalled();
    expect(mocks.acceptPendingInvite).not.toHaveBeenCalled();
  });

  it("stores invite tokens before Google signup redirects", async () => {
    const user = userEvent.setup();
    mocks.routeSearch = { inviteToken: "invite-token-1" };

    render(<SignupPage />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(mocks.storeInviteToken).toHaveBeenCalledWith("invite-token-1");
    expect(mocks.acceptPendingInvite).not.toHaveBeenCalled();
  });

  it("signs up with email using the onboarding callback", async () => {
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Angel Campa");
    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(
      screen.getByRole("button", { name: "Create my planning workspace" }),
    );

    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      name: "Angel Campa",
      email: "angel@example.com",
      password: "password123456",
      callbackURL: "/onboarding",
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: undefined,
    });
  });

  it("preserves selected plan and interval through email signup", async () => {
    const user = userEvent.setup();
    mocks.routeSearch = { plan: "pro", interval: "year" };

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Angel Campa");
    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(
      screen.getByRole("button", { name: "Create my planning workspace" }),
    );

    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      name: "Angel Campa",
      email: "angel@example.com",
      password: "password123456",
      callbackURL: "/onboarding?plan=pro&interval=year",
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/onboarding",
      search: { plan: "pro", interval: "year" },
    });
  });

  it("preserves selected plan and interval through Google signup", async () => {
    const user = userEvent.setup();
    mocks.routeSearch = { plan: "starter", interval: "year" };

    render(<SignupPage />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/onboarding?plan=starter&interval=year",
    });
  });

  it("shows sign-up reference IDs when the backend provides one", async () => {
    const user = userEvent.setup();
    mocks.signUpEmail.mockResolvedValue({
      error: {
        message: "Sign-up failed.",
        errorId: "event-signup-123",
      },
    });

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Angel Campa");
    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(
      screen.getByRole("button", { name: "Create my planning workspace" }),
    );

    expect(
      screen.getByText("Sign-up failed. Reference ID: event-signup-123"),
    ).toBeInTheDocument();
  });

  it("shows clear retry guidance when signup is rate-limited", async () => {
    const user = userEvent.setup();
    mocks.signUpEmail.mockResolvedValue({
      error: {
        status: 429,
        message: "Sign-up failed. Please try again.",
      },
    });

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Angel Campa");
    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(
      screen.getByRole("button", { name: "Create my planning workspace" }),
    );

    expect(
      screen.getByText(
        "Too many signup attempts. Please wait a few minutes, then try again.",
      ),
    ).toBeInTheDocument();
  });

  it("beforeLoad redirects authenticated users to /dashboard without plan intent", () => {
    mocks.redirectFn.mockImplementation(
      (opts: { to: string; search?: unknown }) => {
        throw new Error(`redirect:${opts.to}:${JSON.stringify(opts.search)}`);
      },
    );

    const beforeLoad = (
      Route as unknown as {
        _config: {
          beforeLoad?: (arg: {
            context: { auth: { isAuthenticated: boolean } };
            search: { plan?: "starter" | "pro"; interval?: "month" | "year" };
          }) => void;
        };
      }
    )._config?.beforeLoad;
    expect(beforeLoad).toBeDefined();

    expect(() =>
      beforeLoad!({
        context: { auth: { isAuthenticated: true } },
        search: {},
      }),
    ).toThrow("redirect:/dashboard:undefined");

    expect(() =>
      beforeLoad!({
        context: { auth: { isAuthenticated: false } },
        search: {},
      }),
    ).not.toThrow();
  });

  it("beforeLoad redirects authenticated users with plan intent to settings", () => {
    mocks.redirectFn.mockImplementation(
      (opts: { to: string; search?: unknown }) => {
        throw new Error(`redirect:${opts.to}:${JSON.stringify(opts.search)}`);
      },
    );

    const beforeLoad = (
      Route as unknown as {
        _config: {
          beforeLoad?: (arg: {
            context: { auth: { isAuthenticated: boolean } };
            search: { plan?: "starter" | "pro"; interval?: "month" | "year" };
          }) => void;
        };
      }
    )._config?.beforeLoad;

    expect(() =>
      beforeLoad!({
        context: { auth: { isAuthenticated: true } },
        search: { plan: "starter", interval: "month" },
      }),
    ).toThrow('redirect:/settings:{"plan":"starter","interval":"month"}');
  });

  it("beforeLoad preserves invite tokens for already-authenticated users", () => {
    mocks.redirectFn.mockImplementation(
      (opts: { to: string; search?: unknown }) => {
        throw new Error(`redirect:${opts.to}:${JSON.stringify(opts.search)}`);
      },
    );

    const beforeLoad = (
      Route as unknown as {
        _config: {
          beforeLoad?: (arg: {
            context: { auth: { isAuthenticated: boolean } };
            search: {
              plan?: "starter" | "pro";
              interval?: "month" | "year";
              inviteToken?: string;
            };
          }) => void;
        };
      }
    )._config?.beforeLoad;

    expect(() =>
      beforeLoad!({
        context: { auth: { isAuthenticated: true } },
        search: { inviteToken: "invite-token-1" },
      }),
    ).toThrow('redirect:/dashboard:{"inviteToken":"invite-token-1"}');
  });
});
