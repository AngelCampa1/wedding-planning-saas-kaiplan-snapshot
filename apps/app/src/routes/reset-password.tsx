import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";
import { AuthShell } from "../components/auth/auth-shell";

interface ResetPasswordSearch {
  token?: string;
}

export function validateResetPasswordSearch(
  search: Record<string, unknown>,
): ResetPasswordSearch {
  const raw = search.token;
  if (typeof raw === "string" && raw.length > 0) {
    return { token: raw };
  }
  return {};
}

export const Route = createFileRoute("/reset-password")({
  beforeLoad: ({ context }) => {
    if (context.auth?.isAuthenticated) {
      throw redirect({ to: "/dashboard" });
    }
  },
  validateSearch: validateResetPasswordSearch,
  component: ResetPasswordPage,
});

export function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!token) {
        setError(
          "This reset link is missing its token. Request a new password reset email.",
        );
        return;
      }

      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        setError(
          result.error.message ?? "Password reset failed. Please try again.",
        );
      } else {
        await navigate({ to: "/login", search: { reset: "success" } });
      }
    } catch {
      setError("Password reset failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="New password"
      tagline="Enter your new password below."
      footer={
        <Link to="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="feedback-banner feedback-banner--error">{error}</div>
        )}

        <div>
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
            New password
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
          {loading ? "Resetting…" : "Reset password"}
        </button>
      </form>
    </AuthShell>
  );
}
