import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  redirectFn: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  redirect: mocks.redirectFn,
  createFileRoute:
    () => (config: { beforeLoad?: (arg: { context: unknown }) => void }) => ({
      _config: config,
    }),
}));

import { Route } from "../../src/routes/index";

type RouteConfig = {
  _config: {
    beforeLoad?: (arg: {
      context: { auth?: { isAuthenticated?: boolean; user?: unknown } };
    }) => void;
  };
};

describe("Root index route beforeLoad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects authenticated users to /dashboard", () => {
    mocks.redirectFn.mockImplementation((opts: { to: string }) => {
      throw new Error(`redirect:${opts.to}`);
    });

    const beforeLoad = (Route as unknown as RouteConfig)._config?.beforeLoad;
    expect(beforeLoad).toBeDefined();

    expect(() =>
      beforeLoad!({ context: { auth: { isAuthenticated: true } } }),
    ).toThrow("redirect:/dashboard");
  });

  it("redirects unauthenticated users to /login (not /dashboard)", () => {
    mocks.redirectFn.mockImplementation((opts: { to: string }) => {
      throw new Error(`redirect:${opts.to}`);
    });

    const beforeLoad = (Route as unknown as RouteConfig)._config?.beforeLoad;
    expect(beforeLoad).toBeDefined();

    expect(() =>
      beforeLoad!({ context: { auth: { isAuthenticated: false } } }),
    ).toThrow("redirect:/login");
  });

  it("redirects users with no auth context to /login", () => {
    mocks.redirectFn.mockImplementation((opts: { to: string }) => {
      throw new Error(`redirect:${opts.to}`);
    });

    const beforeLoad = (Route as unknown as RouteConfig)._config?.beforeLoad;
    expect(beforeLoad).toBeDefined();

    expect(() => beforeLoad!({ context: {} })).toThrow("redirect:/login");
  });
});
