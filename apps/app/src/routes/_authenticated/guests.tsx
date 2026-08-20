import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageSpinner } from "../../components/ui/page-spinner";
import { Upload, UserPlus } from "lucide-react";
import type {
  Guest,
  GuestWithPlusOnes,
  RsvpStatus,
  CreateGuestInput,
} from "@kaiplan/shared";
import { GuestSummaryBar } from "../../components/guest/guest-summary-bar";
import { GuestTable } from "../../components/guest/guest-table";
import { GuestForm } from "../../components/guest/guest-form";
import { BulkRsvpBar } from "../../components/guest/bulk-rsvp-bar";
import { CsvImportDialog } from "../../components/guest/csv-import-dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../../components/ui/sheet";
import { useWeddings } from "../../hooks/use-weddings";
import { useActiveWedding } from "../../lib/wedding-context";
import {
  useGuests,
  useGuestSummary,
  useCreateGuest,
  useUpdateGuest,
  useDeleteGuest,
  useDeleteGuestHousehold,
  useBulkUpdateRsvp,
  useImportGuestsCsv,
  type GuestCsvImportResult,
} from "../../hooks/use-guests";

export const Route = createFileRoute("/_authenticated/guests")({
  component: GuestsPage,
});

export function GuestsPage() {
  const { data: weddings = [], isLoading: weddingsLoading } = useWeddings();
  const { activeWeddingId, setWeddingSwitchGuard } = useActiveWedding();

  const resolvedWeddingId =
    activeWeddingId ?? (weddings.length > 0 ? weddings[0]!.id : null);
  const activeWedding =
    weddings.find((wedding) => wedding.id === resolvedWeddingId) ?? null;
  const canMutate = activeWedding !== null && activeWedding.role !== "viewer";

  // Filter state
  const [sideFilter, setSideFilter] = useState("");
  const [rsvpFilter, setRsvpFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  // Form sheet state
  const [formOpen, setFormOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | undefined>(
    undefined,
  );
  const [plusOneTarget, setPlusOneTarget] = useState<
    GuestWithPlusOnes | undefined
  >(undefined);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [groupFilter, rsvpFilter, sideFilter]);

  // CSV dialog state
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvResult, setCsvResult] = useState<GuestCsvImportResult | undefined>(
    undefined,
  );

  useEffect(() => {
    closeForm();
    setCsvOpen(false);
    setCsvResult(undefined);
    setSelectedIds(new Set());
  }, [resolvedWeddingId]);

  // Queries
  const filters = useMemo(
    () => ({
      ...(sideFilter ? { side: sideFilter } : {}),
      ...(rsvpFilter ? { rsvpStatus: rsvpFilter } : {}),
      ...(groupFilter ? { groupName: groupFilter } : {}),
    }),
    [sideFilter, rsvpFilter, groupFilter],
  );

  const guestsQuery = useGuests(resolvedWeddingId, filters);
  const {
    data: guests = [],
    isLoading: guestsLoading,
    isError: guestsError = false,
    refetch: refetchGuests,
  } = guestsQuery;
  const summaryQuery = useGuestSummary(resolvedWeddingId);
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError = false,
    refetch: refetchSummary,
  } = summaryQuery;

  // All guests (unfiltered) for extracting existing groups
  const allGuestsQuery = useGuests(resolvedWeddingId);
  const {
    data: allGuests = [],
    isLoading: allGuestsLoading,
    isError: allGuestsError = false,
    refetch: refetchAllGuests,
  } = allGuestsQuery;

  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const g of allGuests) {
      if (g.groupName) groups.add(g.groupName);
      for (const po of g.plusOnes) {
        if (po.groupName) groups.add(po.groupName);
      }
    }
    return Array.from(groups).sort();
  }, [allGuests]);

  const householdsWithPlusOnes = useMemo(
    () =>
      new Set(
        allGuests
          .filter((guest) => guest.plusOnes.length > 0)
          .map((guest) => guest.id),
      ),
    [allGuests],
  );
  const householdPlusOneCounts = useMemo(
    () =>
      new Map(
        allGuests.map((guest) => [guest.id, guest.plusOnes.length] as const),
      ),
    [allGuests],
  );
  const selectedPrimaryCount = useMemo(() => {
    const primaryIds = new Set(
      allGuests
        .filter((guest) => guest.primaryGuestId === null)
        .map((guest) => guest.id),
    );

    return Array.from(selectedIds).filter((id) => primaryIds.has(id)).length;
  }, [allGuests, selectedIds]);

  useEffect(() => {
    const validIds = new Set(
      allGuests.flatMap((guest) => [
        guest.id,
        ...guest.plusOnes.map((po) => po.id),
      ]),
    );

    setSelectedIds((current) => {
      const next = new Set(
        Array.from(current).filter((guestId) => validIds.has(guestId)),
      );

      if (next.size === current.size) {
        return current;
      }

      return next;
    });
  }, [allGuests]);

  // Mutations
  const createGuest = useCreateGuest(resolvedWeddingId);
  const updateGuest = useUpdateGuest(resolvedWeddingId);
  const deleteGuest = useDeleteGuest(resolvedWeddingId);
  const deleteGuestHousehold = useDeleteGuestHousehold(resolvedWeddingId);
  const bulkRsvp = useBulkUpdateRsvp(resolvedWeddingId);
  const importCsv = useImportGuestsCsv(resolvedWeddingId);

  const isLoading =
    weddingsLoading || guestsLoading || summaryLoading || allGuestsLoading;
  const hasGuestLoadError =
    guestsError ||
    summaryError ||
    allGuestsError ||
    Boolean(guestsQuery.error) ||
    Boolean(summaryQuery.error) ||
    Boolean(allGuestsQuery.error) ||
    guestsQuery.isRefetchError ||
    summaryQuery.isRefetchError ||
    allGuestsQuery.isRefetchError;

  useEffect(() => {
    if (!hasGuestLoadError) return;

    setFormOpen(false);
    setEditingGuest(undefined);
    setPlusOneTarget(undefined);
    setCsvOpen(false);
    setCsvResult(undefined);
    setSelectedIds(new Set());
  }, [hasGuestLoadError]);

  // Handlers
  function openCreateForm() {
    if (!resolvedWeddingId || !canMutate || hasGuestLoadError) return;
    setEditingGuest(undefined);
    setPlusOneTarget(undefined);
    setFormOpen(true);
  }

  function openEditForm(guest: Guest) {
    if (!canMutate || hasGuestLoadError) return;
    setEditingGuest(guest);
    setPlusOneTarget(undefined);
    setFormOpen(true);
  }

  function openPlusOneForm(primaryGuest: GuestWithPlusOnes) {
    if (!canMutate || hasGuestLoadError) return;
    setEditingGuest(undefined);
    setPlusOneTarget(primaryGuest);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingGuest(undefined);
    setPlusOneTarget(undefined);
  }

  useEffect(() => {
    setWeddingSwitchGuard(
      canMutate && !hasGuestLoadError && (formOpen || csvOpen)
        ? () =>
            window.confirm(
              "You have an open guest draft or CSV import. Leave without saving?",
            )
        : null,
    );

    return () => setWeddingSwitchGuard(null);
  }, [canMutate, csvOpen, formOpen, hasGuestLoadError, setWeddingSwitchGuard]);

  function handleFormSubmit(data: CreateGuestInput) {
    if (!resolvedWeddingId || !canMutate || hasGuestLoadError) return;
    if (editingGuest) {
      updateGuest.mutate(
        { guestId: editingGuest.id, data },
        { onSuccess: closeForm },
      );
    } else {
      createGuest.mutate(data, { onSuccess: closeForm });
    }
  }

  async function handleDelete(guestId: string) {
    if (!resolvedWeddingId || !canMutate || hasGuestLoadError) return;
    await deleteGuest.mutateAsync(guestId);
  }

  async function handleHouseholdDelete(guestId: string) {
    if (!resolvedWeddingId || !canMutate || hasGuestLoadError) return;
    await deleteGuestHousehold.mutateAsync(guestId);
  }

  function handleToggleSelect(guestId: string) {
    if (!canMutate || hasGuestLoadError) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) {
        next.delete(guestId);
      } else {
        next.add(guestId);
      }
      return next;
    });
  }

  function handleToggleSelectAll() {
    if (!canMutate || hasGuestLoadError) return;
    if (guests.length > 0 && guests.every((g) => selectedIds.has(g.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(guests.map((g) => g.id)));
    }
  }

  function handleBulkRsvp(status: RsvpStatus) {
    if (!resolvedWeddingId || !canMutate || hasGuestLoadError) return;
    // Bulk RSVP only accepts primary guest IDs — filter out any selected plus-ones
    // (guests with a non-null primaryGuestId) before sending.
    const primaryIds = new Set(
      allGuests
        .filter((guest) => guest.primaryGuestId === null)
        .map((g) => g.id),
    );
    const payload = Array.from(selectedIds)
      .filter((id) => primaryIds.has(id))
      .map((id) => ({
        id,
        rsvpStatus: status,
      }));
    if (payload.length === 0) {
      setSelectedIds(new Set());
      return;
    }
    bulkRsvp.mutate(payload, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  }

  function handleCsvImport(file: File) {
    if (!resolvedWeddingId || !canMutate || hasGuestLoadError) return;
    const formData = new FormData();
    formData.append("file", file);
    importCsv.mutate(formData, {
      onSuccess: (data) => {
        setCsvResult(data);
      },
    });
  }

  function handleCsvOpenChange(open: boolean) {
    if (open && (!canMutate || hasGuestLoadError)) return;
    setCsvOpen(open);
    if (!open) {
      setCsvResult(undefined);
    }
  }

  function getSheetTitle() {
    if (editingGuest) return "Edit Guest";
    if (plusOneTarget)
      return `Add Plus-One for ${plusOneTarget.firstName} ${plusOneTarget.lastName}`;
    return "Add Guest";
  }

  function getSheetDescription() {
    if (editingGuest) return "Update guest details.";
    if (plusOneTarget) return "Add a plus-one to this guest.";
    return "Add a new guest to your wedding.";
  }

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!resolvedWeddingId || !activeWedding) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-background p-6 text-center">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            Create a wedding first
          </h1>
          <p className="mt-2 text-sm text-muted">
            The guest list attaches to a wedding workspace. Create or select a
            wedding before importing guests or managing RSVPs.
          </p>
          <Button asChild className="mt-4">
            <Link to="/onboarding">Create wedding</Link>
          </Button>
        </div>
      </main>
    );
  }

  async function retryGuestList() {
    await Promise.all([
      refetchGuests?.(),
      refetchSummary?.(),
      refetchAllGuests?.(),
    ]);
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="font-heading text-2xl font-semibold text-foreground">
              Guest List
            </h1>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleCsvOpenChange(true)}
                disabled={!resolvedWeddingId || !canMutate || hasGuestLoadError}
                data-help-key="guests-import"
                data-tour="guests-import"
              >
                <Upload className="mr-1.5 h-4 w-4" />
                Import CSV
              </Button>
              <Button
                onClick={openCreateForm}
                disabled={!resolvedWeddingId || !canMutate || hasGuestLoadError}
                data-help-key="guests-add"
                data-tour="guests-add"
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Add Guest
              </Button>
            </div>
          </div>

          {/* Summary bar */}
          {summary && <GuestSummaryBar summary={summary} />}

          {hasGuestLoadError ? (
            <div
              role="alert"
              className="rounded-card border border-destructive/30 bg-destructive/5 p-6 shadow-card"
            >
              <h2 className="font-heading text-xl text-foreground">
                Guest list did not load
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We could not load the latest guest data. Retry before editing
                guests so you do not work from stale information.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => void retryGuestList()}
              >
                Retry guest list
              </Button>
            </div>
          ) : null}

          {/* Filters */}
          <div className="flex flex-wrap gap-3" data-help-key="guests-filters">
            <Select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value)}
              aria-label="Filter by side"
              disabled={hasGuestLoadError}
            >
              <option value="">All Sides</option>
              <option value="partner1">Partner 1</option>
              <option value="partner2">Partner 2</option>
              <option value="mutual">Mutual</option>
            </Select>

            <Select
              value={rsvpFilter}
              onChange={(e) => setRsvpFilter(e.target.value)}
              aria-label="Filter by RSVP status"
              disabled={hasGuestLoadError}
            >
              <option value="">All RSVP</option>
              <option value="pending">Pending</option>
              <option value="invited">Invited</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </Select>

            <Select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              aria-label="Filter by group"
              disabled={hasGuestLoadError}
            >
              <option value="">All Groups</option>
              {existingGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </Select>
          </div>

          {/* Table or empty state */}
          {hasGuestLoadError ? null : guests.length === 0 &&
            !sideFilter &&
            !rsvpFilter &&
            !groupFilter ? (
            <div className="space-y-4">
              <h2 className="font-heading text-xl text-foreground">
                How would you like to start?
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleCsvOpenChange(true)}
                  disabled={!resolvedWeddingId || !canMutate}
                  className="rounded-card border-2 border-primary/30 bg-primary/5 p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <Upload className="h-4 w-4" />
                    Import from CSV / spreadsheet
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Best if you already have a list. Takes under a minute.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={openCreateForm}
                  disabled={!resolvedWeddingId || !canMutate}
                  aria-label="Enter guests manually"
                  className="rounded-card border border-border bg-secondary p-5 text-left transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <UserPlus className="h-4 w-4" />
                    Add guests one by one
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Good for smaller lists or adding as you go.
                  </p>
                </button>
              </div>
            </div>
          ) : guests.length === 0 ? (
            <div className="rounded-card border border-border bg-card p-6 shadow-card">
              <h2 className="font-heading text-xl text-foreground">
                No guests match these filters.
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Clear the filters to see the full guest list.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSideFilter("");
                  setRsvpFilter("");
                  setGroupFilter("");
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <GuestTable
              guests={guests}
              onEdit={openEditForm}
              onDeleteGuest={handleDelete}
              onDeleteHousehold={handleHouseholdDelete}
              householdsWithPlusOnes={householdsWithPlusOnes}
              householdPlusOneCounts={householdPlusOneCounts}
              onAddPlusOne={openPlusOneForm}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              canMutate={canMutate}
            />
          )}
        </div>
      </main>

      {/* Guest form sheet */}
      <Sheet
        open={canMutate && !hasGuestLoadError && formOpen}
        onOpenChange={(open) => !open && closeForm()}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{getSheetTitle()}</SheetTitle>
            <SheetDescription>{getSheetDescription()}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <GuestForm
              key={
                editingGuest?.id ??
                (plusOneTarget ? `po-${plusOneTarget.id}` : "new")
              }
              guest={editingGuest}
              isOpen={formOpen}
              onSubmit={handleFormSubmit}
              onCancel={closeForm}
              existingGroups={existingGroups}
              defaultSide={plusOneTarget?.side}
              primaryGuestId={editingGuest?.primaryGuestId ?? plusOneTarget?.id}
              isSubmitting={createGuest.isPending || updateGuest.isPending}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Bulk RSVP bar */}
      {canMutate && !hasGuestLoadError ? (
        <BulkRsvpBar
          selectedCount={selectedPrimaryCount}
          onBulkUpdate={handleBulkRsvp}
          isUpdating={bulkRsvp.isPending}
        />
      ) : null}

      {/* CSV import dialog */}
      <CsvImportDialog
        open={canMutate && !hasGuestLoadError && csvOpen}
        onOpenChange={handleCsvOpenChange}
        onImport={handleCsvImport}
        isImporting={importCsv.isPending}
        result={csvResult}
      />
    </>
  );
}
