import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
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
  type PlanSearch,
} from "../lib/plan-handoff";

interface SignupSearch extends PlanSearch {
  inviteToken?: string;
}

export const Route = createFileRoute("/signup")({
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
  validateSearch: (search: Record<string, unknown>): SignupSearch => {
    const result: SignupSearch = readPlanSearch(search);
    if (
      typeof search.inviteToken === "string" &&
      search.inviteToken.length <= 2048
    ) {
      result.inviteToken = search.inviteToken;
    }
    return result;
  },
  component: SignupPage,
});

const RATE_LIMIT_ERROR_MESSAGE =
  "Too many signup attempts. Please wait a few minutes, then try again.";

function getErrorString(error: unknown, key: "message" | "error") {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function isRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status =
    "status" in error && typeof error.status === "number"
      ? error.status
      : "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;

  if (status === 429) {
    return true;
  }

  const message = `${getErrorString(error, "message") ?? ""} ${
    getErrorString(error, "error") ?? ""
  }`;
  return /rate limit|too many/i.test(message);
}

function formatErrorMessage(error: unknown, fallback: string) {
  if (isRateLimitError(error)) {
    return RATE_LIMIT_ERROR_MESSAGE;
  }

  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : fallback;
  const errorId =
    error &&
    typeof error === "object" &&
    "errorId" in error &&
    typeof error.errorId === "string"
      ? error.errorId
      : undefined;

  return errorId ? `${message} Reference ID: ${errorId}` : message;
}

const PROBLEM_CARDS = [
  {
    title: "Budget that actually adds up",
    body: "Track estimates, quotes, paid amounts, and what is still due.",
  },
  {
    title: "Guests, RSVPs, and seating in one place",
    body: "Keep households, replies, meal notes, and table assignments connected.",
  },
  {
    title: "Vendors and contracts you don't lose track of",
    body: "Keep quotes, payment dates, notes, and contract status beside each vendor.",
  },
] as const;

function SignupSellPanel() {
  return (
    <div className="flex flex-col gap-8 pt-10">
      <div>
        <p className="font-body text-kicker text-muted-foreground">
          WEDDING PLANNING SOFTWARE
        </p>
        <h2
          className="mt-4 font-heading text-foreground"
          style={{
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "clamp(1.375rem, 2vw, 1.875rem)",
            lineHeight: 1.2,
          }}
        >
          Start with one calm workspace for the budget, guest list, seating
          plan, vendors, and checklist.
        </h2>
      </div>

      <div className="flex flex-col gap-5">
        {PROBLEM_CARDS.map((card) => (
          <div
            key={card.title}
            style={{ borderLeft: "2px solid var(--color-primary)" }}
            className="pl-4"
          >
            <p className="font-body text-sm font-semibold text-foreground">
              {card.title}
            </p>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              {card.body}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: "2px solid var(--color-primary)",
          paddingTop: "1rem",
        }}
      >
        <p className="font-body text-kicker text-muted-foreground">
          Full app access for {TRIAL_DURATION_DAYS} days | Choose a plan later
        </p>
      </div>
    </div>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const { plan, interval, inviteToken } = Route.useSearch();
  const onboardingPath = buildPathWithPlan("/onboarding", plan, interval);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loginSearch = {
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
        callbackURL: onboardingPath,
      });
      // On success, navigation away has started, so keep loading true.
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
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: onboardingPath,
      });
      if (result.error) {
        setError(
          formatErrorMessage(result.error, "Sign-up failed. Please try again."),
        );
      } else {
        await acceptPendingInvite(inviteToken);
        await navigate({
          to: "/onboarding",
          search: buildPlanSearch(plan, interval),
        });
      }
    } catch (error) {
      setError(formatErrorMessage(error, "Sign-up failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = {
    fontSize: "0.6875rem",
    fontWeight: 500 as const,
    letterSpacing: "0.28em",
    textTransform: "uppercase" as const,
  };

  return (
    <AuthShell
      eyebrow="Begin"
      title="Start your planning trial."
      tagline="Create the workspace first. You get the full app during the trial and choose a plan later."
      sellPanel={<SignupSellPanel />}
      footer={
        <span>
          Already with us?{" "}
          <Link
            to="/login"
            search={loginSearch}
            className="font-medium text-foreground underline decoration-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] decoration-2 underline-offset-4 hover:decoration-[color-mix(in_srgb,var(--color-accent)_90%,transparent)]"
          >
            Sign in
          </Link>
          .
        </span>
      }
    >
      <>
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
          <span className="font-body text-muted-foreground" style={labelStyle}>
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
            <div className="feedback-banner feedback-banner--error">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="name"
              className="font-body text-muted-foreground"
              style={labelStyle}
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 block w-full border-0 border-b border-border bg-transparent px-0 py-2.5 text-base text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-0"
              placeholder="Your name"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="font-body text-muted-foreground"
              style={labelStyle}
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
            <label
              htmlFor="password"
              className="font-body text-muted-foreground"
              style={labelStyle}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 block w-full border-0 border-b border-border bg-transparent px-0 py-2.5 text-base text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-0"
              placeholder="At least 12 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-full bg-foreground px-4 py-3.5 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:opacity-50"
            style={{ letterSpacing: "0.04em" }}
          >
            {loading ? "Creating account..." : "Create my planning workspace"}
          </button>
        </form>
      </>
    </AuthShell>
  );
}
