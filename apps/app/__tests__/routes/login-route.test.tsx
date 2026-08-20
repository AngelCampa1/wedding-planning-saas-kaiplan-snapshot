import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  routeSearch: { plan: "starter" as const, interval: "year" as const },
  redirectFn: vi.fn(),
  signInSocial: vi.fn(),
  signInEmail: vi.fn(),
  acceptPendingInvite: vi.fn(),
  storeInviteToken: vi.fn(),
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
    search?: { plan?: string; interval?: string };
    children: ReactNode;
  }) => {
    const url = new URL(to, "http://localhost");
    if (search?.plan) {
      url.searchParams.set("plan", search.plan);
    }
    if (search?.interval) {
      url.searchParams.set("interval", search.interval);
    }
    return <a href={url.pathname + url.search}>{children}</a>;
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
  },
}));

import { LoginPage, readLoginSearch } from "../../src/routes/login";
import { Route } from "../../src/routes/login";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInSocial.mockResolvedValue({});
    mocks.signInEmail.mockResolvedValue({ error: null });
    mocks.acceptPendingInvite.mockResolvedValue(undefined);
    mocks.storeInviteToken.mockReset();
  });

  it("threads plan and interval search params into signup link", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/signup?plan=starter&interval=year");
  });

  it("signs in with Google and passes the plan callback URL", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/settings?plan=starter&interval=year",
    });
    expect(mocks.storeInviteToken).not.toHaveBeenCalled();
    expect(mocks.acceptPendingInvite).not.toHaveBeenCalled();
  });

  it("stores invite tokens before Google redirects", async () => {
    const user = userEvent.setup();
    mocks.routeSearch = {
      plan: "starter",
      interval: "year",
      inviteToken: "invite-token-1",
    } as typeof mocks.routeSearch;

    render(<LoginPage />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(mocks.storeInviteToken).toHaveBeenCalledWith("invite-token-1");
    expect(mocks.acceptPendingInvite).not.toHaveBeenCalled();
  });

  it("signs in with email and navigates to the plan destination", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "angel@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mocks.signInEmail).toHaveBeenCalledWith({
      email: "angel@example.com",
      password: "password123",
      callbackURL: "/settings?plan=starter&interval=year",
    });
    expect(mocks.acceptPendingInvite).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/settings",
      search: { plan: "starter", interval: "year" },
    });
  });

  it("readLoginSearch rejects protocol-relative next values to prevent open redirect", () => {
    expect(readLoginSearch({ next: "//evil.com/steal" })).not.toHaveProperty(
      "next",
    );
    expect(readLoginSearch({ next: "//attacker.io" })).not.toHaveProperty(
      "next",
    );
    expect(readLoginSearch({ next: "/dashboard" })).toMatchObject({
      next: "/dashboard",
    });
    expect(readLoginSearch({ next: "/settings?plan=pro" })).toMatchObject({
      next: "/settings?plan=pro",
    });
    expect(readLoginSearch({ next: "http://evil.com" })).not.toHaveProperty(
      "next",
    );
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
        search: { plan: "pro", interval: "year" },
      }),
    ).toThrow('redirect:/settings:{"plan":"pro","interval":"year"}');
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
