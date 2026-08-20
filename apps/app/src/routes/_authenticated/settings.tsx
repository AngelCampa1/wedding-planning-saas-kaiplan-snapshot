import { createFileRoute } from "@tanstack/react-router";
import {
  BILLING_PLAN_LABELS,
  type BillingInterval,
  type BillingSummary,
} from "@kaiplan/shared";
import { useCallback, useEffect, useState } from "react";
import { BillingSection } from "../../components/billing/billing-section";
import { PlanComparison } from "../../components/billing/plan-comparison";
import {
  useBillingCheckout,
  useBillingHistory,
  useBillingPortal,
  useBillingSummary,
} from "../../hooks/use-billing";
import {
  useEmailPreferences,
  useUpdateEmailPreferences,
} from "../../hooks/use-email-preferences";
import {
  type CheckoutStatus,
  type PaidBillingPlan,
  readPlanSearch,
} from "../../lib/plan-handoff";
import { getFeaturePlanLabel } from "../../lib/billing-labels";
import {
  useWeddings,
  useArchiveWedding,
  useUnarchiveWedding,
} from "../../hooks/use-weddings";
import { useActiveWedding } from "../../lib/wedding-context";
import {
  useWeddingMembers,
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
} from "../../hooks/use-wedding-members";
import { apiFetch } from "../../lib/api";

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: {
    plan?: unknown;
    interval?: unknown;
    checkout?: unknown;
  }) => readPlanSearch(search),
  component: SettingsPage,
});

function getPaidPlanLabel(plan: PaidBillingPlan): string {
  return BILLING_PLAN_LABELS[plan];
}

export function SettingsPage() {
  const user = Route.useRouteContext().auth.user ?? {
    name: "",
    email: "",
    id: "",
  };
  const { plan, interval, checkout } = Route.useSearch();
  const navigate = Route.useNavigate();
  const billingSummaryQuery = useBillingSummary();
  const billingHistoryQuery = useBillingHistory();
  const billingCheckout = useBillingCheckout();
  const billingPortal = useBillingPortal();
  const emailPreferencesQuery = useEmailPreferences();
  const updateEmailPreferences = useUpdateEmailPreferences();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [billingPortalError, setBillingPortalError] = useState<string | null>(
    null,
  );

  const { activeWeddingId } = useActiveWedding();
  const { data: weddings = [] } = useWeddings();
  const activeWedding = weddings.find(
    (w) => w.id === (activeWeddingId ?? weddings[0]?.id),
  );
  const weddingId = activeWedding?.id ?? null;

  const weddingMembersQuery = useWeddingMembers(weddingId);
  const inviteMember = useInviteMember(weddingId);
  const removeMember = useRemoveMember(weddingId);
  const updateMemberRole = useUpdateMemberRole(weddingId);
  const archiveWedding = useArchiveWedding(weddingId);
  const unarchiveWedding = useUnarchiveWedding(weddingId);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const summary = billingSummaryQuery.data;
  const history = billingHistoryQuery.data;
  const refetchBillingSummary = billingSummaryQuery.refetch;
  const refetchBillingHistory = billingHistoryQuery.refetch;
  const preferences = emailPreferencesQuery.data?.preferences;
  const billingSummaryLoadError =
    billingSummaryQuery.isError || Boolean(billingSummaryQuery.error);
  const isBillingSummaryPending =
    billingSummaryQuery.isLoading || (!summary && !billingSummaryLoadError);
  const hasExtraPlannerAccess =
    !billingSummaryLoadError &&
    (summary?.features.includes("extraPlanner") ?? false);
  const extraPlannerPlanLabel = getFeaturePlanLabel("extraPlanner");

  function getCheckoutNotice(
    status: CheckoutStatus,
    selectedPlan: PaidBillingPlan,
  ) {
    if (status === "cancel") {
      return {
        title: `Checkout canceled for the ${selectedPlan} plan.`,
        description:
          "Nothing was changed. You can reopen checkout whenever you're ready.",
      };
    }

    if (
      summary?.plan === selectedPlan &&
      (summary.status === "active" || summary.status === "trialing")
    ) {
      return {
        title: `${getPaidPlanLabel(selectedPlan)} plan is active.`,
        description: "Your billing access is ready to use.",
      };
    }

    return {
      title: `Checkout completed for the ${selectedPlan} plan.`,
      description:
        "Your billing summary will refresh automatically as Stripe confirms the purchase.",
    };
  }

  async function startPlanCheckout(
    selectedPlan: PaidBillingPlan,
    selectedInterval: BillingInterval,
  ) {
    const { url } = await billingCheckout.mutateAsync({
      plan: selectedPlan,
      interval: selectedPlan === "lifetime" ? "month" : selectedInterval,
    });

    if (!url) {
      throw new Error(
        "We couldn't open checkout. Please try again in a moment.",
      );
    }

    // Strip ?plan= from the URL before leaving so a back-navigation after
    // Stripe doesn't auto-start checkout again.
    await navigate({
      search: (prev) => ({ ...prev, plan: undefined }),
      replace: true,
    });

    window.location.assign(url);
  }

  function handleCheckoutError(error: unknown) {
    setCheckoutError(
      error instanceof Error
        ? error.message
        : "We couldn't open checkout. Please try again in a moment.",
    );
  }

  const openPlanCheckout = useCallback(
    async (
      selectedPlan: PaidBillingPlan,
      selectedInterval: BillingInterval,
    ) => {
      setCheckoutError(null);
      try {
        await startPlanCheckout(selectedPlan, selectedInterval);
      } catch (error) {
        handleCheckoutError(error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startPlanCheckout and handleCheckoutError are plain function declarations recreated every render, so listing them would change this callback on every render; the deps below are the stable values those helpers actually close over (setCheckoutError is a setState setter and is stable by definition)
    [navigate, billingCheckout.mutateAsync],
  );

  async function handleManageBilling() {
    setBillingPortalError(null);

    try {
      const { url } = await billingPortal.mutateAsync();
      if (!url) {
        throw new Error(
          "We couldn't open billing management. Please try again in a moment.",
        );
      }

      window.location.assign(url);
    } catch (error) {
      setBillingPortalError(
        error instanceof Error
          ? error.message
          : "We couldn't open billing management. Please try again in a moment.",
      );
    }
  }

  useEffect(() => {
    if (checkout !== "success") {
      return;
    }

    let cancelled = false;
    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS = 2000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function isSettled(summary: BillingSummary | undefined): boolean {
      if (!summary) return false;
      return (
        summary.plan !== "free" &&
        (summary.status === "active" || summary.status === "trialing")
      );
    }

    async function pollOnce(attempt: number): Promise<void> {
      if (cancelled) return;

      // Kick off both refetches in parallel so callers that observe the mock
      // see both calls within the same microtask.
      const summaryPromise = refetchBillingSummary?.();
      const historyPromise = refetchBillingHistory?.();
      const summaryResult = await summaryPromise;
      await historyPromise;
      if (cancelled) return;

      if (isSettled(summaryResult?.data)) {
        await navigate({
          search: (prev) => ({ ...prev, checkout: undefined, plan: undefined }),
          replace: true,
        });
        return;
      }

      if (attempt + 1 >= MAX_ATTEMPTS) {
        await navigate({
          search: (prev) => ({ ...prev, checkout: undefined, plan: undefined }),
          replace: true,
        });
        return;
      }

      timeoutId = setTimeout(() => {
        void pollOnce(attempt + 1);
      }, INTERVAL_MS);
    }

    void pollOnce(0);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [checkout, navigate, refetchBillingHistory, refetchBillingSummary]);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) {
        return;
      }

      void refetchBillingSummary?.();
      void refetchBillingHistory?.();
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [refetchBillingHistory, refetchBillingSummary]);

  const isLoading =
    billingSummaryQuery.isLoading || billingHistoryQuery.isLoading;

  async function handlePreferenceChange(
    key: "appLifecycle" | "memberInvite" | "rsvpConfirmation" | "rsvpReminder",
    enabled: boolean,
  ) {
    if (!preferences) {
      return;
    }

    await updateEmailPreferences.mutateAsync({
      preferences: {
        ...preferences,
        [key]: enabled,
      },
    });
  }

  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingType, setExportingType] = useState<
    "guests" | "budget" | "vendors" | null
  >(null);

  async function handleExport(type: "guests" | "budget" | "vendors") {
    if (!weddingId) return;
    setExportingType(type);
    setExportError(null);
    try {
      const csv = await apiFetch<string>(
        `/api/weddings/${weddingId}/export/${type}.csv`,
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Export failed. Please try again.",
      );
    } finally {
      setExportingType(null);
    }
  }

  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!weddingId) return;
    if (isBillingSummaryPending || billingSummaryLoadError) {
      setInviteError(
        "Billing access could not be confirmed. Retry billing before inviting a team member.",
      );
      return;
    }

    if (!hasExtraPlannerAccess) {
      setInviteError(
        `Upgrade to ${extraPlannerPlanLabel} to invite more planners.`,
      );
      return;
    }

    setInviteError(null);
    try {
      await inviteMember.mutateAsync({ email: inviteEmail, role: inviteRole });
      setInviteEmail("");
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Failed to invite member.",
      );
    }
  }

  async function handleUpdateMemberRole(
    memberId: string,
    role: "editor" | "viewer",
  ) {
    setInviteError(null);
    try {
      await updateMemberRole.mutateAsync({ memberId, role });
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Failed to update member role.",
      );
    }
  }

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Settings
        </h1>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Account
          </h2>
          <div className="rounded-xl border border-border bg-background p-4 space-y-3">
            <div>
              <p className="text-xs text-muted">Name</p>
              <p className="text-sm font-medium text-foreground">{user.name}</p>
            </div>
            <div className="h-px bg-border" />
            <div>
              <p className="text-xs text-muted">Email</p>
              <p className="text-sm font-medium text-foreground">
                {user.email}
              </p>
            </div>
          </div>
        </section>

        {checkoutError ? (
          <section className="space-y-3">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                We couldn't open checkout.
              </p>
              <p className="text-sm text-muted">{checkoutError}</p>
              <button
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground"
                onClick={() => {
                  setCheckoutError(null);
                }}
                type="button"
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}

        {plan && checkout ? (
          <section className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                {getCheckoutNotice(checkout, plan).title}
              </p>
              <p className="text-sm text-muted">
                {getCheckoutNotice(checkout, plan).description}
              </p>
              {checkout === "cancel" ? (
                <p className="text-sm text-muted-foreground">
                  Choose a plan below to try again.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <div>
            <p
              className="font-body text-muted-foreground"
              style={{
                fontSize: "0.6875rem",
                fontWeight: 500,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
              }}
            >
              Email
            </p>
            <h2
              className="mt-2 font-heading text-foreground"
              style={{
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
                lineHeight: 1.1,
                letterSpacing: "-0.015em",
              }}
            >
              What lands in inboxes.
            </h2>
            <p className="mt-2 max-w-md font-body text-sm text-muted-foreground">
              You decide which messages we send to you and your guests. Every
              option is on by default - turn off anything you don't need.
            </p>
          </div>

          {emailPreferencesQuery.isLoading ? (
            <p className="text-sm text-muted">Loading preferences...</p>
          ) : null}
          {preferences ? (
            <div className="divide-y divide-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] border-y border-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]">
              {[
                {
                  key: "appLifecycle" as const,
                  title: "Kaiplan planning emails",
                  body: "Receive sign-up, trial, and planning nudges that help you decide whether Kaiplan fits your wedding workflow.",
                },
                {
                  key: "memberInvite" as const,
                  title: "Member invites",
                  body: "When a co-planner is invited to your wedding, send them an email so they know to sign in.",
                },
                {
                  key: "rsvpConfirmation" as const,
                  title: "RSVP confirmations",
                  body: "When a guest submits an RSVP, send them a quiet confirmation with the details on record.",
                },
                {
                  key: "rsvpReminder" as const,
                  title: "RSVP reminders",
                  body: "Allow reminder emails sent manually from the website RSVP tools.",
                },
              ].map((row) => (
                <label
                  key={row.key}
                  className="flex items-start justify-between gap-6 py-5"
                >
                  <div className="min-w-0">
                    <p className="font-body text-base font-medium text-foreground">
                      {row.title}
                    </p>
                    <p className="mt-1 font-body text-sm text-muted-foreground">
                      {row.body}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label={row.title}
                    checked={preferences[row.key]}
                    disabled={updateEmailPreferences.isPending}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-border accent-primary disabled:cursor-not-allowed"
                    onChange={(event) => {
                      void handlePreferenceChange(
                        row.key,
                        event.target.checked,
                      );
                    }}
                  />
                </label>
              ))}
            </div>
          ) : null}
        </section>

        <div data-help-key="settings-billing" className="space-y-6">
          {summary ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Plans
              </h2>
              <PlanComparison
                summary={summary}
                onCheckout={openPlanCheckout}
                isCheckingOut={billingCheckout.isPending}
                initialPlan={checkout ? undefined : plan}
                defaultInterval={interval ?? "year"}
              />
            </section>
          ) : null}
          <BillingSection
            summary={summary}
            history={history}
            isLoading={isLoading}
            nextPlan={null}
            onUpgrade={() => undefined}
            onManageBilling={() => {
              void handleManageBilling();
            }}
            isUpgrading={billingCheckout.isPending}
            isManaging={billingPortal.isPending}
          />
        </div>

        {billingPortalError ? (
          <section className="space-y-3">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                We couldn't open billing management.
              </p>
              <p className="text-sm text-muted">{billingPortalError}</p>
              <button
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground"
                onClick={() => {
                  setBillingPortalError(null);
                }}
                type="button"
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}

        {weddingId && activeWedding?.role === "owner" ? (
          <section
            aria-labelledby="members-heading"
            className="space-y-4"
            data-help-key="settings-team"
          >
            <h2
              id="members-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              Wedding team
            </h2>
            <div className="rounded-xl border border-border bg-background p-4 space-y-3">
              {weddingMembersQuery.isLoading ? (
                <p className="text-sm text-muted">Loading members...</p>
              ) : weddingMembersQuery.isError ? (
                <p className="text-sm text-destructive">
                  Failed to load members.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(weddingMembersQuery.data ?? []).map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {member.userName ??
                            member.userEmail ??
                            member.invitedEmail ??
                            member.userId}
                        </p>
                        {activeWedding?.role === "owner" &&
                        member.userId !== user.id &&
                        member.role !== "owner" ? (
                          <select
                            aria-label={`Role for ${member.userName ?? member.userEmail ?? member.invitedEmail ?? member.userId}`}
                            value={member.role}
                            disabled={updateMemberRole.isPending}
                            onChange={(event) => {
                              void handleUpdateMemberRole(
                                member.id,
                                event.target.value as "editor" | "viewer",
                              );
                            }}
                            className="mt-1 rounded border border-border px-2 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className="inline-block mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                            {member.role}
                          </span>
                        )}
                      </div>
                      {activeWedding?.role === "owner" &&
                      member.userId !== user.id ? (
                        <button
                          type="button"
                          aria-label={`Remove member ${member.userName ?? member.userEmail ?? member.invitedEmail ?? member.userId}`}
                          className="shrink-0 rounded-full border border-destructive/30 px-2 py-1 text-xs text-destructive hover:border-destructive"
                          onClick={() => {
                            void removeMember.mutate(member.id);
                          }}
                          disabled={removeMember.isPending}
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {activeWedding?.role === "owner" && isBillingSummaryPending ? (
                <div className="rounded-lg border border-border bg-muted/10 p-3 text-sm">
                  <p className="font-medium text-foreground">
                    Checking team invitation access...
                  </p>
                </div>
              ) : null}

              {activeWedding?.role === "owner" && billingSummaryLoadError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
                >
                  <p className="font-medium text-foreground">
                    Team invitation access did not load
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Retry billing before inviting a partner, planner, or family
                    member into this workspace.
                  </p>
                  <button
                    type="button"
                    className="mt-3 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-foreground"
                    onClick={() => {
                      void refetchBillingSummary?.();
                    }}
                  >
                    Retry billing
                  </button>
                </div>
              ) : null}

              {activeWedding?.role === "owner" &&
              !isBillingSummaryPending &&
              !billingSummaryLoadError &&
              !hasExtraPlannerAccess ? (
                <div className="rounded-lg border border-border bg-muted/10 p-3 text-sm">
                  <p className="font-medium text-foreground">
                    Team invitations are a paid feature
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Upgrade to {extraPlannerPlanLabel} before inviting a
                    partner, planner, or family member into this workspace.
                  </p>
                </div>
              ) : null}

              {activeWedding?.role === "owner" &&
              !isBillingSummaryPending &&
              !billingSummaryLoadError &&
              hasExtraPlannerAccess ? (
                <form
                  onSubmit={(e) => {
                    void handleInviteMember(e);
                  }}
                  className="flex flex-col gap-2 pt-2 border-t border-border"
                >
                  <p className="text-xs font-medium text-muted">
                    Invite a team member
                  </p>
                  {inviteError ? (
                    <p className="text-xs text-destructive">{inviteError}</p>
                  ) : null}
                  <input
                    type="email"
                    aria-label="Invite email address"
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <select
                    aria-label="Invite role"
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as "editor" | "viewer")
                    }
                    className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="submit"
                    disabled={inviteMember.isPending}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Send invite
                  </button>
                </form>
              ) : null}
            </div>
          </section>
        ) : null}

        {weddingId ? (
          <section
            aria-labelledby="export-heading"
            className="space-y-4"
            data-help-key="settings-export"
            data-tour="settings-export"
          >
            <h2
              id="export-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              Export your data
            </h2>
            <div className="rounded-xl border border-border bg-background p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Download your planning data as CSV at any time.
              </p>
              {exportError ? (
                <p className="text-sm text-destructive">{exportError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={exportingType !== null}
                  onClick={() => {
                    void handleExport("guests");
                  }}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:border-foreground disabled:opacity-50"
                >
                  {exportingType === "guests"
                    ? "Downloading..."
                    : "Download guest list"}
                </button>
                <button
                  type="button"
                  disabled={exportingType !== null}
                  onClick={() => {
                    void handleExport("budget");
                  }}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:border-foreground disabled:opacity-50"
                >
                  {exportingType === "budget"
                    ? "Downloading..."
                    : "Download budget"}
                </button>
                <button
                  type="button"
                  disabled={exportingType !== null}
                  onClick={() => {
                    void handleExport("vendors");
                  }}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:border-foreground disabled:opacity-50"
                >
                  {exportingType === "vendors"
                    ? "Downloading..."
                    : "Download vendors"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {weddingId ? (
          <section
            aria-labelledby="archive-heading"
            className="space-y-4"
            data-help-key="settings-archive"
          >
            <h2
              id="archive-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              Danger zone
            </h2>
            <div className="rounded-xl border border-border bg-background p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                Archive wedding
              </p>
              <p className="text-sm text-muted-foreground">
                Archived weddings are read-only. All your data stays accessible
                and exportable.
              </p>
              {activeWedding?.status !== "archived" ? (
                <button
                  type="button"
                  onClick={() => {
                    void archiveWedding.mutate();
                  }}
                  disabled={archiveWedding.isPending}
                  className="rounded-full border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:border-destructive disabled:opacity-50"
                >
                  Archive this wedding
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void unarchiveWedding.mutate();
                  }}
                  disabled={unarchiveWedding.isPending}
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:border-foreground disabled:opacity-50"
                >
                  Unarchive
                </button>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
