import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import {
  acceptPendingInvite,
  authClient,
  storeInviteToken,
} from "../lib/auth-client";
import { AuthShell } from "../components/auth/auth-shell";
import { GoogleIcon } from "../components/auth/google-icon";
import {
  buildPathWithPlan,
  buildPlanSearch,
  readPlanSearch,
  type PaidBillingPlan,
  type PlanSearch,
} from "../lib/plan-handoff";

interface LoginSearch extends PlanSearch {
  next?: string;
  reset?: "success";
  inviteToken?: string;
}

export function readLoginSearch(search: Record<string, unknown>): LoginSearch {
  const planSearch = readPlanSearch(search);
  const rawNext = search.next;
  const rawReset = search.reset;
  const rawInviteToken = search.inviteToken;
  const result: LoginSearch = { ...planSearch };
  if (
    typeof rawNext === "string" &&
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//")
  ) {
    result.next = rawNext;
  }
  if (rawReset === "success") {
    result.reset = "success";
  }
  if (typeof rawInviteToken === "string" && rawInviteToken.length <= 2048) {
    result.inviteToken = rawInviteToken;
  }
  return result;
}

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context, search }) => {
    if (context.auth?.isAuthenticated) {
      const planSearch = buildPlanSearch(search.plan, search.interval);
      const nextSearch =
        typeof search.inviteToken === "string"
          ? { ...(planSearch ?? {}), inviteToken: search.inviteToken }
          : planSearch;
      throw redirect({
        to: search.plan ? "/settings" : "/dashboard",
        search: nextSearch,
      });
    }
  },
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    readLoginSearch(search),
  component: LoginPage,
});

export function LoginPage() {
  const navigate = useNavigate();
  const { plan, interval, next, reset, inviteToken } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function getPostLoginPath(targetPlan: PaidBillingPlan | undefined) {
    if (next) return next;
    return buildPathWithPlan(
      targetPlan ? "/settings" : "/dashboard",
      targetPlan,
      interval,
    );
  }

  const signupSearch = {
    ...buildPlanSearch(plan, interval),
    ...(inviteToken ? { inviteToken } : {}),
  };

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    try {
      if (inviteToken) {
        storeInviteToken(inviteToken);
      }
      await authClient.signIn.social({
        provider: "google",
        callbackURL: getPostLoginPath(plan),
      });
      // On success, navigation away has started — do not reset loading to avoid
      // a state update on an unmounted component.
    } catch {
      setError("Google sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: getPostLoginPath(plan),
      });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed. Please try again.");
      } else if (next) {
        await acceptPendingInvite(inviteToken);
        await navigate({ to: next });
      } else {
        await acceptPendingInvite(inviteToken);
        await navigate({
          to: plan ? "/settings" : "/dashboard",
          search: buildPlanSearch(plan, interval),
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sign-in failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Returning"
      title="Welcome back."
      tagline="Sign in to pick up where you left off."
      footer={
        <span>
          New to Kaiplan?{" "}
          <Link
            to="/signup"
            search={signupSearch}
            className="font-medium text-foreground underline decoration-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] decoration-2 underline-offset-4 hover:decoration-[color-mix(in_srgb,var(--color-accent)_90%,transparent)]"
          >
            Create an account
          </Link>
          .
        </span>
      }
    >
      {reset === "success" && (
        <div className="feedback-banner feedback-banner--success">
          Password reset — please sign in.
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:border-foreground/30 hover:bg-surface disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="my-8 flex items-center gap-4">
        <div
          className="h-px flex-1"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--color-primary) 22%, transparent)",
          }}
        />
        <span
          className="font-body text-muted-foreground"
          style={{
            fontSize: "0.625rem",
            fontWeight: 500,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
          }}
        >
          or with email
        </span>
        <div
          className="h-px flex-1"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--color-primary) 22%, transparent)",
          }}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="feedback-banner feedback-banner--error">{error}</div>
        )}

        <div>
          <label
            htmlFor="email"
            className="font-body text-muted-foreground"
            style={{
              fontSize: "0.6875rem",
              fontWeight: 500,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
            }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 block w-full border-0 border-b border-border bg-transparent px-0 py-2.5 text-base text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-0"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="password"
              className="font-body text-muted-foreground"
              style={{
                fontSize: "0.6875rem",
                fontWeight: 500,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
              }}
            >
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground underline decoration-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] decoration-1 underline-offset-2 hover:text-foreground"
            >
              Forgot?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 block w-full border-0 border-b border-border bg-transparent px-0 py-2.5 text-base text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-0"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-full bg-foreground px-4 py-3.5 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:opacity-50"
          style={{ letterSpacing: "0.04em" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
