import "./lib/sentry";
import { Component, StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { assertProdEnv } from "./lib/env-guard";
import { queryClient, registerGlobal401Handler } from "./lib/query-client";
import { router } from "./router";
import { authClient } from "./lib/auth-client";
import { useAuthQueryReset } from "./hooks/use-auth-query-reset";
import { ErrorBoundaryFallback } from "./components/error-boundary-fallback";
import { getReactRootErrorHandlers, setSentryUser } from "./lib/sentry";
import "./styles/globals.css";

function App() {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  useAuthQueryReset(userId);

  useEffect(() => {
    if (!isPending) {
      setSentryUser(userId);
    }
  }, [isPending, userId]);

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <RouterProvider
      router={router}
      context={{
        auth: {
          isAuthenticated: !!session?.user,
          user: session?.user
            ? {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
              }
            : null,
        },
      }}
    />
  );
}

interface RootErrorBoundaryState {
  error: Error | null;
}

class RootErrorBoundary extends Component<
  { children: ReactNode },
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          action={
            <a
              href="/"
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground"
            >
              Go home
            </a>
          }
        />
      );
    }

    return this.props.children;
  }
}

export function bootstrap(): void {
  assertProdEnv();

  registerGlobal401Handler({
    signOut: () => authClient.signOut(),
    navigate: (opts) => router.navigate(opts),
    clear: () => queryClient.clear(),
  });

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  createRoot(rootElement, getReactRootErrorHandlers()).render(
    <StrictMode>
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </RootErrorBoundary>
    </StrictMode>,
  );
}

// Auto-bootstrap in the browser runtime. Skipped under Vitest so tests can
// invoke `bootstrap()` explicitly per case without paying the cost of
// `vi.resetModules()` + dynamic re-import, which was flaking under turbo.
if (!import.meta.env.VITEST) {
  bootstrap();
}
