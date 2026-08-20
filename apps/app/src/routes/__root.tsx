import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import type { AuthContext } from "../router";
import { ErrorBoundaryFallback } from "../components/error-boundary-fallback";

export interface RouterContext {
  auth: AuthContext;
}

function NotFoundComponent() {
  return (
    <main
      role="main"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 py-12 text-center"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-muted">
        404
      </p>
      <h1 className="font-heading text-3xl font-semibold text-foreground">
        Page not found
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
        Head back to your dashboard to keep planning.
      </p>
      <Link
        to="/dashboard"
        className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground"
      >
        Back to dashboard
      </Link>
    </main>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: NotFoundComponent,
  errorComponent: (props) => <ErrorBoundaryFallback {...props} reportError />,
});
