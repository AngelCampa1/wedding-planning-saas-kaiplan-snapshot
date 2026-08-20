import {
  createFileRoute,
  redirect,
  Link,
  Outlet,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MobileNavigation, Sidebar } from "../components/sidebar";
import { TopBar, TopBarHelpActions } from "../components/top-bar";
import { UserMenu } from "../components/user-menu";
import { WeddingPicker } from "../components/wedding-picker";
import { CrmFeedbackWidget } from "../components/crm-feedback-widget";
import { TourProvider } from "../components/guidance/tour-provider";
import { ErrorBoundaryFallback } from "../components/error-boundary-fallback";
import { TrialBanner } from "../components/trial-banner";
import { Button } from "../components/ui/button";
import { StatusBanner } from "../components/ui/status-banner";
import { useBillingSummary } from "../hooks/use-billing";
import { useWeddings } from "../hooks/use-weddings";
import {
  acceptPendingInvite,
  consumeStoredInviteToken,
  storeInviteToken,
} from "../lib/auth-client";
import { WeddingProvider, useActiveWedding } from "../lib/wedding-context";

const EMPTY_WEDDINGS: NonNullable<ReturnType<typeof useWeddings>["data"]> = [];

function AuthenticatedNotFound() {
  return (
    <main
      role="main"
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-muted">
        404
      </p>
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page doesn&rsquo;t exist. Head back to your dashboard to keep
        planning.
      </p>
      <Button asChild variant="outline">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </main>
  );
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/login",
        search: { next: location.pathname + (location.searchStr ?? "") },
      });
    }
  },
  component: AuthenticatedLayout,
  errorComponent: (props) => <ErrorBoundaryFallback {...props} reportError />,
  notFoundComponent: AuthenticatedNotFound,
});

function AuthenticatedShell() {
  const { auth } = Route.useRouteContext();
  const user = auth.user ?? { name: "", email: "" };
  const weddingsQuery = useWeddings();
  const weddings = weddingsQuery.data ?? EMPTY_WEDDINGS;
  const { activeWeddingId, setActiveWeddingId } = useActiveWedding();
  const loadedWeddingIds = new Set(weddings.map((wedding) => wedding.id));
  const isValidatingStoredWedding =
    !!activeWeddingId && weddingsQuery.isLoading;
  const hasStaleActiveWeddingId =
    !!activeWeddingId &&
    !weddingsQuery.isLoading &&
    !loadedWeddingIds.has(activeWeddingId);
  const resolvedWeddingId = hasStaleActiveWeddingId
    ? (weddings[0]?.id ?? "")
    : (activeWeddingId ?? weddings[0]?.id ?? "");
  const location = useLocation();
  const isOnboardingRoute = location.pathname === "/onboarding";
  const isSubscribeRoute = location.pathname === "/subscribe";
  const activeWedding = weddings.find((w) => w.id === resolvedWeddingId);
  const isActiveSharedWedding =
    !!activeWedding &&
    (activeWedding.role !== "owner" ||
      activeWedding.createdBy !== auth.user?.id);
  const isActiveOwnedWedding =
    !!activeWedding &&
    activeWedding.role === "owner" &&
    activeWedding.createdBy === auth.user?.id;
  const router = useRouter();
  const isFirstRender = useRef(true);
  const lastInviteAcceptKey = useRef<string | null>(null);
  const [inviteRetryAttempt, setInviteRetryAttempt] = useState(0);
  const billingSummaryQuery = useBillingSummary();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const urlInviteToken =
    typeof location.search.inviteToken === "string" &&
    location.search.inviteToken.length <= 2048
      ? location.search.inviteToken
      : undefined;

  useLayoutEffect(() => {
    if (!hasStaleActiveWeddingId) {
      return;
    }

    setActiveWeddingId(weddings[0]?.id ?? null);
  }, [hasStaleActiveWeddingId, setActiveWeddingId, weddings]);

  useEffect(() => {
    const userId = auth.user?.id ?? null;
    const storedInviteToken = consumeStoredInviteToken();
    const inviteToken = urlInviteToken ?? storedInviteToken;
    const acceptKey = `${userId ?? ""}:${inviteToken ?? ""}`;
    if (!userId || !inviteToken || lastInviteAcceptKey.current === acceptKey) {
      return;
    }

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    void acceptPendingInvite(inviteToken)
      .then(() => {
        if (cancelled) return;
        lastInviteAcceptKey.current = acceptKey;
        if (urlInviteToken && typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("inviteToken");
          window.history.replaceState(window.history.state, "", url);
        }
      })
      .catch(() => {
        if (cancelled) return;
        storeInviteToken(inviteToken);
        retryTimer = setTimeout(() => {
          setInviteRetryAttempt((attempt) => attempt + 1);
        }, 5_000);
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [auth.user?.id, inviteRetryAttempt, urlInviteToken]);

  useEffect(() => {
    if (
      billingSummaryQuery.isLoading ||
      billingSummaryQuery.isError ||
      isOnboardingRoute ||
      isSubscribeRoute ||
      isActiveSharedWedding ||
      !isActiveOwnedWedding ||
      !billingSummaryQuery.data?.billingGateRequired
    ) {
      return;
    }

    void router.navigate({
      to: "/subscribe",
      replace: true,
      search: { checkout: undefined },
    });
  }, [
    billingSummaryQuery.data?.billingGateRequired,
    billingSummaryQuery.isError,
    billingSummaryQuery.isLoading,
    isActiveOwnedWedding,
    isActiveSharedWedding,
    isOnboardingRoute,
    isSubscribeRoute,
    router,
  ]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void router.invalidate();
  }, [auth.user?.id, router]);

  if (!isOnboardingRoute && !isSubscribeRoute && billingSummaryQuery.isError) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-card border border-border bg-background p-6 text-center shadow-card">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
            Billing check
          </p>
          <h1 className="mt-3 font-heading text-2xl text-foreground">
            We couldn&apos;t verify your billing status.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Retry to continue. We keep billing verification in front of the app
            so the paywall can&apos;t be bypassed when the request fails.
          </p>
          <Button
            type="button"
            onClick={() => {
              void billingSummaryQuery.refetch();
            }}
            className="mt-6"
          >
            Retry billing check
          </Button>
        </div>
      </main>
    );
  }

  if (isValidatingStoredWedding || hasStaleActiveWeddingId) {
    return null;
  }

  return (
    <TourProvider>
      <div className="flex min-h-screen flex-col bg-surface md:h-screen md:flex-row">
        <Sidebar user={{ name: user.name, email: user.email }} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!isDesktop && (
            <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 shrink-0 md:hidden">
              <div className="flex min-w-0 items-center gap-3">
                {isOnboardingRoute ? null : <MobileNavigation />}
                <div className="min-w-0">
                  <WeddingPicker
                    weddings={weddings}
                    activeWeddingId={resolvedWeddingId}
                    onSelect={setActiveWeddingId}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <TopBarHelpActions compact />
                <UserMenu user={{ name: user.name, email: user.email }} />
              </div>
            </header>
          )}
          {isDesktop && !isOnboardingRoute && !isSubscribeRoute && (
            <TopBar
              user={{ name: user.name, email: user.email }}
              weddings={weddings}
              activeWeddingId={resolvedWeddingId}
              onSelectWedding={setActiveWeddingId}
            />
          )}
          {!isOnboardingRoute && !isSubscribeRoute && (
            <TrialBanner
              days={billingSummaryQuery.data?.trialDaysRemaining ?? null}
            />
          )}
          {activeWedding?.status === "archived" && (
            <StatusBanner
              tone="warning"
              action={{ to: "/settings", label: "Open settings" }}
            >
              This wedding is archived, so it is read-only.
            </StatusBanner>
          )}
          <Outlet />
        </div>
        <CrmFeedbackWidget />
      </div>
    </TourProvider>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

export function AuthenticatedLayout() {
  return (
    <WeddingProvider>
      <AuthenticatedShell />
    </WeddingProvider>
  );
}
