import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRootMock,
  routerProviderMock,
  rootErrorHandlers,
  setSentryUserMock,
  useAuthQueryResetMock,
  useSessionMock,
} = vi.hoisted(() => {
  const createRootMock = vi.fn();
  const routerProviderMock = vi.fn(({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ));
  const rootErrorHandlers = {
    onCaughtError: vi.fn(),
    onRecoverableError: vi.fn(),
    onUncaughtError: vi.fn(),
  };
  const setSentryUserMock = vi.fn();
  const useAuthQueryResetMock = vi.fn();
  const useSessionMock = vi.fn();

  return {
    createRootMock,
    routerProviderMock,
    rootErrorHandlers,
    setSentryUserMock,
    useAuthQueryResetMock,
    useSessionMock,
  };
});

let capturedElement: ReactElement | null = null;

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));

vi.mock("../src/lib/query-client", () => ({
  queryClient: {},
  registerGlobal401Handler: vi.fn(),
}));

vi.mock("../src/lib/sentry", () => ({
  getReactRootErrorHandlers: () => rootErrorHandlers,
  setSentryUser: (userId: string | null) => setSentryUserMock(userId),
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  QueryClientProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  RouterProvider: (props: { children?: ReactNode }) =>
    routerProviderMock(props),
}));

vi.mock("../src/lib/auth-client", () => ({
  authClient: {
    useSession: () => useSessionMock(),
  },
}));

vi.mock("../src/hooks/use-auth-query-reset", () => ({
  useAuthQueryReset: (userId: string | null | undefined) =>
    useAuthQueryResetMock(userId),
}));

vi.mock("../src/router", () => ({
  router: {},
}));

// Import once at module load. Each test calls bootstrap() to re-run the
// side-effectful entrypoint without the cost of `vi.resetModules()` +
// dynamic `import("../src/main")`, which was exceeding the 5s default
// testTimeout under turbo-parallel CPU contention and leaking prior DOM
// between test cases.
import { bootstrap } from "../src/main";

describe("main entrypoint", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    capturedElement = null;
    createRootMock.mockReset();
    routerProviderMock.mockReset();
    setSentryUserMock.mockReset();
    useAuthQueryResetMock.mockReset();
    useSessionMock.mockReset();
    createRootMock.mockImplementation(() => ({
      render: (element: ReactElement) => {
        capturedElement = element;
      },
    }));
    routerProviderMock.mockImplementation(
      ({ children }: { children?: ReactNode }) => <>{children}</>,
    );
  });

  it("passes the current user id to useAuthQueryReset", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: {
          id: "user-123",
          name: "Angel Campa",
          email: "angel@example.com",
        },
      },
      isPending: false,
    });

    bootstrap();

    expect(capturedElement).not.toBeNull();
    render(capturedElement!);

    expect(useAuthQueryResetMock).toHaveBeenCalledWith("user-123");
    expect(setSentryUserMock).toHaveBeenCalledWith("user-123");
  });

  it("passes React root Sentry error handlers to createRoot", () => {
    useSessionMock.mockReturnValue({
      data: null,
      isPending: false,
    });

    bootstrap();

    expect(createRootMock).toHaveBeenCalledWith(
      document.getElementById("root"),
      rootErrorHandlers,
    );
  });

  it("renders the full-page fallback when the app root throws during render", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      useSessionMock.mockReturnValue({
        data: {
          user: {
            id: "user-123",
            name: "Angel Campa",
            email: "angel@example.com",
          },
        },
        isPending: false,
      });
      routerProviderMock.mockImplementation(() => {
        throw new Error("Router mount exploded");
      });

      bootstrap();

      expect(capturedElement).not.toBeNull();
      render(capturedElement!);

      expect(
        await screen.findByRole("heading", { name: "Something went wrong" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Router mount exploded")).toBeInTheDocument();

      const link = screen.getByRole("link", { name: "Go home" });
      expect(link).toHaveAttribute("href", "/");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("preserves route-level error UI instead of replacing it with the root fallback", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: {
          id: "user-123",
          name: "Angel Campa",
          email: "angel@example.com",
        },
      },
      isPending: false,
    });
    routerProviderMock.mockImplementation(() => (
      <div>Route-level fallback rendered</div>
    ));

    bootstrap();

    expect(capturedElement).not.toBeNull();
    render(capturedElement!);

    expect(
      screen.getByText("Route-level fallback rendered"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Something went wrong" }),
    ).not.toBeInTheDocument();
  });
});
