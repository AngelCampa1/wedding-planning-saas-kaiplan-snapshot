import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { captureRouteErrorOnce } from "../lib/sentry";

interface ErrorBoundaryFallbackProps {
  error: Error;
  action?: ReactNode;
  reportError?: boolean;
}

export function ErrorBoundaryFallback({
  error,
  action,
  reportError = false,
}: ErrorBoundaryFallbackProps) {
  const errorId = reportError ? captureRouteErrorOnce(error) : undefined;

  return (
    <main
      role="main"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 py-12 text-center"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-muted">
        Error
      </p>
      <h1 className="font-heading text-3xl font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {import.meta.env.DEV
          ? error.message
          : "An unexpected error occurred. Please try refreshing the page."}
      </p>
      {errorId ? (
        <p className="text-xs font-medium text-muted-foreground">
          Reference ID: {errorId}
        </p>
      ) : null}
      {action ?? (
        <Button variant="outline" size="sm" className="rounded-full" asChild>
          <Link to="/">Go home</Link>
        </Button>
      )}
    </main>
  );
}
