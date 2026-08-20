import { createFileRoute, Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { PageSpinner } from "../../components/ui/page-spinner";
import { EditorialEmptyState } from "../../components/common/editorial-empty-state";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { VendorSummaryBar } from "../../components/vendor/vendor-summary-bar";
import { VendorList } from "../../components/vendor/vendor-list";
import { VendorForm } from "../../components/vendor/vendor-form";
import { VendorDetailPanel } from "../../components/vendor/vendor-detail-panel";
import { useBillingSummary } from "../../hooks/use-billing";
import { ApiError } from "../../lib/api";
import { TRIAL_PLAN_HINT } from "../../lib/billing-copy";
import { useBudgetCategories } from "../../hooks/use-budget";
import { useWeddings } from "../../hooks/use-weddings";
import {
  useCreateVendor,
  useVendorSummary,
  useVendors,
} from "../../hooks/use-vendors";
import { useActiveWedding } from "../../lib/wedding-context";

export const Route = createFileRoute("/_authenticated/vendors")({
  component: VendorsPage,
});

function isBillingGateError(error: unknown) {
  return error instanceof ApiError && error.status === 402;
}

export function VendorsPage() {
  const { data: weddings = [], isLoading: weddingsLoading } = useWeddings();
  const { activeWeddingId } = useActiveWedding();
  const resolvedWeddingId =
    activeWeddingId ?? (weddings.length > 0 ? weddings[0]!.id : null);
  const activeWedding =
    weddings.find((wedding) => wedding.id === resolvedWeddingId) ?? null;
  const canMutate = activeWedding !== null && activeWedding.role !== "viewer";
  const billingSummaryQuery = useBillingSummary();
  const hasBillingSummary = billingSummaryQuery.status === "success";
  const hasVendorAccess =
    hasBillingSummary && billingSummaryQuery.data.features.includes("vendors");
  const vendorWeddingId = hasVendorAccess ? resolvedWeddingId : null;
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useVendorSummary(vendorWeddingId);
  const {
    data: vendors = [],
    isLoading: vendorsLoading,
    error: vendorsError,
    refetch: refetchVendors,
  } = useVendors(vendorWeddingId);
  const {
    data: categories = [],
    error: categoriesError,
    refetch: refetchCategories,
  } = useBudgetCategories(vendorWeddingId);
  const createVendor = useCreateVendor(resolvedWeddingId ?? "");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const filteredVendors = categoryFilter
    ? vendors.filter((vendor) => vendor.categoryId === categoryFilter)
    : vendors;

  const isLoading =
    weddingsLoading ||
    billingSummaryQuery.isLoading ||
    summaryLoading ||
    vendorsLoading;
  const hasBillingGate =
    (hasBillingSummary && !hasVendorAccess) ||
    isBillingGateError(summaryError) ||
    isBillingGateError(vendorsError) ||
    isBillingGateError(categoriesError);
  const vendorLoadError = [summaryError, vendorsError, categoriesError].find(
    (error) => error && !isBillingGateError(error),
  );
  const hasVendorLoadError = !hasBillingGate && Boolean(vendorLoadError);

  useEffect(() => {
    if (!hasVendorLoadError) return;

    setShowVendorForm(false);
    setSelectedVendorId(null);
  }, [hasVendorLoadError]);

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
            Vendor tracking attaches to a wedding workspace. Create or select a
            wedding before adding contracts, quotes, and payments.
          </p>
          <Button asChild className="mt-4">
            <Link to="/onboarding">Create wedding</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (billingSummaryQuery.status === "error") {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-heading text-2xl font-semibold text-foreground">
                  Vendors
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Track contracts, quote history, and payments in one place.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    We couldn't load vendor access right now.
                  </h2>
                  <p className="max-w-xl text-sm text-muted">
                    Refresh the page and try again. If the problem continues,
                    contact support.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void billingSummaryQuery.refetch();
                  }}
                >
                  Retry billing check
                </Button>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                Vendors
              </h1>
              <p className="mt-1 text-sm text-muted">
                Track contracts, quote history, and payments in one place.
              </p>
            </div>
            {!hasBillingGate && !hasVendorLoadError && canMutate && (
              <Button
                onClick={() => setShowVendorForm(true)}
                data-help-key="vendors-add"
                data-tour="vendors-add"
              >
                Add vendor
              </Button>
            )}
          </div>

          {hasBillingGate ? (
            <div className="rounded-xl border border-border bg-background p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-muted">
                    <Store className="h-4 w-4" />
                    Vendor access locked
                  </div>
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    Vendor access requires an active plan
                  </h2>
                  <p className="max-w-xl text-sm text-muted">
                    Upgrade in settings to unlock vendor contracts, quotes, and
                    payment tracking.
                  </p>
                  <p className="max-w-xl text-xs italic text-muted">
                    {TRIAL_PLAN_HINT}
                  </p>
                </div>
                <Button asChild>
                  <Link to="/settings">Upgrade in settings</Link>
                </Button>
              </div>
            </div>
          ) : hasVendorLoadError ? (
            <div
              className="rounded-xl border border-border bg-background p-6"
              role="alert"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    Vendor data did not load
                  </h2>
                  <p className="max-w-xl text-sm text-muted">
                    Refresh the page and try again. If the problem continues,
                    contact support.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void refetchSummary();
                    void refetchVendors();
                    void refetchCategories();
                  }}
                >
                  Retry vendors
                </Button>
              </div>
            </div>
          ) : (
            <>
              {summary && (
                <div data-help-key="vendors-summary">
                  <VendorSummaryBar summary={summary} />
                </div>
              )}

              {vendors.length > 0 && categories.length > 0 ? (
                <div>
                  <label
                    htmlFor="vendor-category-filter"
                    className="mr-2 text-sm text-muted"
                  >
                    Filter by category
                  </label>
                  <Select
                    id="vendor-category-filter"
                    aria-label="Filter vendors by category"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                  >
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}

              {vendors.length === 0 ? (
                <EditorialEmptyState
                  eyebrow="Your vendors"
                  title="Track every quote, every payment."
                  body="Add the florist, the photographer, the venue. Kaiplan keeps the contracts, costs, and dates in one calm place."
                  actions={
                    canMutate ? (
                      <Button
                        onClick={() => setShowVendorForm(true)}
                        data-help-key="vendors-add"
                        data-tour="vendors-add"
                      >
                        Add your first vendor
                      </Button>
                    ) : null
                  }
                />
              ) : filteredVendors.length === 0 ? (
                <div className="rounded-card border border-border bg-card p-6 shadow-card">
                  <p className="font-heading text-xl text-foreground">
                    No vendors match this category.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Clear the filter to see every vendor in this wedding.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => setCategoryFilter("")}
                  >
                    Clear filter
                  </Button>
                </div>
              ) : (
                <div data-help-key="vendors-detail">
                  <VendorList
                    vendors={filteredVendors}
                    onSelectVendor={(vendorId) => setSelectedVendorId(vendorId)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {!hasBillingGate && !hasVendorLoadError && canMutate && (
        <>
          <VendorForm
            open={showVendorForm}
            onOpenChange={setShowVendorForm}
            categories={categories}
            onSubmit={(data) =>
              createVendor.mutate(data, {
                onSuccess: () => setShowVendorForm(false),
              })
            }
            isSubmitting={createVendor.isPending}
          />
        </>
      )}

      {/* VendorDetailPanel is intentionally outside the canMutate guard so
          viewer-role members can open the read-only panel (canMutate=false). */}
      {!hasBillingGate && !hasVendorLoadError && resolvedWeddingId && (
        <VendorDetailPanel
          weddingId={resolvedWeddingId}
          vendorId={selectedVendorId}
          open={selectedVendorId !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedVendorId(null);
          }}
          categories={categories}
          canMutate={canMutate}
        />
      )}
    </>
  );
}
