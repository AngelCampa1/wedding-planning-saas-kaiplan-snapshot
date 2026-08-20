import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { PageSpinner } from "../../components/ui/page-spinner";
import { SeatingEditor } from "../../components/seating/seating-editor";
import { Button } from "../../components/ui/button";
import { useGuests } from "../../hooks/use-guests";
import { useSeatingChart, useSaveSeatingChart } from "../../hooks/use-seating";
import { useWeddings } from "../../hooks/use-weddings";
import { markSeatingOpened } from "../../lib/tour-storage";
import { useActiveWedding } from "../../lib/wedding-context";

export const Route = createFileRoute("/_authenticated/seating")({
  component: SeatingPage,
});

export function SeatingPage() {
  const { data: weddings = [], isLoading: weddingsLoading } = useWeddings();
  const { activeWeddingId, setWeddingSwitchGuard } = useActiveWedding();
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resolvedWeddingId =
    activeWeddingId ?? (weddings.length > 0 ? weddings[0]!.id : null);
  const activeWedding =
    weddings.find((wedding) => wedding.id === resolvedWeddingId) ?? null;
  const canMutate = activeWedding !== null && activeWedding.role !== "viewer";

  const {
    data: seatingData,
    isLoading: seatingLoading,
    error: seatingError,
    refetch: refetchSeating,
  } = useSeatingChart(resolvedWeddingId);
  const {
    data: guestGroups = [],
    isLoading: guestsLoading,
    error: guestsError,
    refetch: refetchGuests,
  } = useGuests(resolvedWeddingId);
  const saveChart = useSaveSeatingChart(resolvedWeddingId ?? "");

  const guests = useMemo(
    () =>
      guestGroups
        .filter((guest) => guest.rsvpStatus !== "declined")
        .map((guest) => ({
          ...guest,
          plusOnes: guest.plusOnes.filter(
            (plusOne) => plusOne.rsvpStatus !== "declined",
          ),
        })),
    [guestGroups],
  );

  // Use TanStack Router's useBlocker to prevent navigation when dirty.
  // withResolver: true gives us proceed/reset callbacks for a custom dialog.
  const blocker = useBlocker({
    shouldBlockFn: () => canMutate && isDirty,
    withResolver: true,
  });

  const isLoading = weddingsLoading || seatingLoading || guestsLoading;

  useEffect(() => {
    markSeatingOpened();
  }, []);

  useEffect(() => {
    setWeddingSwitchGuard(
      canMutate && isDirty
        ? () =>
            window.confirm(
              "You have unsaved seating changes. Leave without saving?",
            )
        : null,
    );

    return () => setWeddingSwitchGuard(null);
  }, [canMutate, isDirty, setWeddingSwitchGuard]);

  if (isLoading) {
    return <PageSpinner />;
  }

  if (seatingError || guestsError) {
    return (
      <>
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-border bg-background p-6 text-center">
            <h1 className="font-heading text-xl font-semibold text-foreground">
              Couldn&apos;t load the seating chart
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              There was a problem loading seating data for this wedding. Try
              again.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                void refetchSeating();
                void refetchGuests();
              }}
            >
              Retry
            </Button>
          </div>
        </main>
      </>
    );
  }

  if (!resolvedWeddingId || !activeWedding) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-background p-6 text-center">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            Create a wedding first
          </h1>
          <p className="mt-2 text-sm text-muted">
            The seating chart attaches to a wedding workspace. Create or select
            a wedding before arranging tables.
          </p>
          <Button asChild className="mt-4">
            <Link to="/onboarding">Create wedding</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!seatingData) {
    return <PageSpinner />;
  }

  if (guestGroups.length === 0) {
    return (
      <>
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-border bg-background p-6 text-center">
            <h1 className="font-heading text-xl font-semibold text-foreground">
              Set up your guest list first
            </h1>
            <p className="mt-2 text-sm text-muted">
              Add your guests first, then come back to arrange seating.
            </p>
            <Link
              to="/guests"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              Go to Guests
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      {/* Navigation blocker dialog — shown when useBlocker intercepts a navigation attempt */}
      {blocker.status === "blocked" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-changes-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        >
          <div className="mx-4 max-w-sm rounded-xl border border-border bg-background p-6 shadow-lg">
            <h2
              id="unsaved-changes-title"
              className="font-heading text-lg font-semibold text-foreground"
            >
              Unsaved changes
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You have unsaved seating changes. Leave anyway?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="outline" onClick={() => blocker.reset?.()}>
                Stay
              </Button>
              <Button onClick={() => blocker.proceed?.()}>Leave</Button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[1600px]">
          <div data-help-key="seating-toolbar" data-tour="seating-toolbar">
            <div data-help-key="seating-canvas">
              <SeatingEditor
                weddingName={activeWedding.name}
                guests={guests}
                initialChart={seatingData.chart}
                isSaving={saveChart.isPending}
                saveError={saveError}
                canMutate={canMutate}
                onDirtyChange={(dirty) => {
                  if (!canMutate) return;
                  setIsDirty(dirty);
                  if (dirty) {
                    setSaveError(null);
                  }
                }}
                onSave={async (chart) => {
                  if (!canMutate) {
                    return chart;
                  }
                  try {
                    setSaveError(null);
                    const saved = await saveChart.mutateAsync(chart);
                    return saved.chart;
                  } catch {
                    setSaveError(
                      "We couldn't save your seating chart. Try again.",
                    );
                  }
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
