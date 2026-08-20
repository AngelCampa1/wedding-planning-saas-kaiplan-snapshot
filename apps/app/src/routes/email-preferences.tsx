import { Link, createFileRoute } from "@tanstack/react-router";
import {
  usePublicEmailPreferences,
  useUpdatePublicEmailPreferences,
} from "../hooks/use-email-preferences";

interface EmailPreferencesSearch {
  token?: string;
}

export function validateEmailPreferencesSearch(
  search: Record<string, unknown>,
): EmailPreferencesSearch {
  const raw = search.token;
  if (typeof raw === "string" && raw.length > 0) {
    return { token: raw };
  }
  return {};
}

export const Route = createFileRoute("/email-preferences")({
  validateSearch: validateEmailPreferencesSearch,
  component: EmailPreferencesPage,
});

export function EmailPreferencesPage() {
  const { token } = Route.useSearch();
  const tokenOrNull = token ?? null;
  const preferencesQuery = usePublicEmailPreferences(tokenOrNull);
  const updatePreferences = useUpdatePublicEmailPreferences(tokenOrNull);
  const preferences = preferencesQuery.data?.preferences;
  const allowedTypes = preferencesQuery.data?.allowedTypes ?? [];

  async function handleToggle(
    key: "appLifecycle" | "memberInvite" | "rsvpConfirmation" | "rsvpReminder",
    enabled: boolean,
  ) {
    if (!preferences) {
      return;
    }

    await updatePreferences.mutateAsync({
      preferences: {
        ...preferences,
        [key]: enabled,
      },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border border-border bg-background p-6 shadow-sm">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-foreground">
            Email preferences
          </h1>
          <p className="mt-2 text-sm text-muted">
            Manage the optional wedding emails sent to this inbox.
          </p>
        </div>

        {!token ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
            This link is missing its email preference token.
          </div>
        ) : null}

        {preferencesQuery.isLoading ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
            Loading preferences...
          </div>
        ) : null}

        {preferencesQuery.isError ? (
          <div className="feedback-banner feedback-banner--error">
            {preferencesQuery.error.message}
          </div>
        ) : null}

        {preferences ? (
          <div className="space-y-3">
            {allowedTypes.includes("appLifecycle") ? (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm text-foreground">
                <span>Kaiplan planning emails</span>
                <input
                  type="checkbox"
                  checked={preferences.appLifecycle}
                  disabled={updatePreferences.isPending}
                  className="h-4 w-4 rounded border-border accent-primary disabled:cursor-not-allowed"
                  onChange={(event) => {
                    void handleToggle("appLifecycle", event.target.checked);
                  }}
                />
              </label>
            ) : null}
            {allowedTypes.includes("memberInvite") ? (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm text-foreground">
                <span>Member invites</span>
                <input
                  type="checkbox"
                  checked={preferences.memberInvite}
                  disabled={updatePreferences.isPending}
                  className="h-4 w-4 rounded border-border accent-primary disabled:cursor-not-allowed"
                  onChange={(event) => {
                    void handleToggle("memberInvite", event.target.checked);
                  }}
                />
              </label>
            ) : null}
            {allowedTypes.includes("rsvpConfirmation") ? (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm text-foreground">
                <span>RSVP confirmations</span>
                <input
                  type="checkbox"
                  checked={preferences.rsvpConfirmation}
                  disabled={updatePreferences.isPending}
                  className="h-4 w-4 rounded border-border accent-primary disabled:cursor-not-allowed"
                  onChange={(event) => {
                    void handleToggle("rsvpConfirmation", event.target.checked);
                  }}
                />
              </label>
            ) : null}
            {allowedTypes.includes("rsvpReminder") ? (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm text-foreground">
                <span>RSVP reminders</span>
                <input
                  type="checkbox"
                  checked={preferences.rsvpReminder}
                  disabled={updatePreferences.isPending}
                  className="h-4 w-4 rounded border-border accent-primary disabled:cursor-not-allowed"
                  onChange={(event) => {
                    void handleToggle("rsvpReminder", event.target.checked);
                  }}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {updatePreferences.isSuccess ? (
          <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">
            Preferences updated.
          </div>
        ) : null}

        <p className="text-sm text-muted">
          Password reset emails stay enabled because they are required for
          account access.{" "}
          <Link
            to="/login"
            className="text-primary underline underline-offset-2"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
