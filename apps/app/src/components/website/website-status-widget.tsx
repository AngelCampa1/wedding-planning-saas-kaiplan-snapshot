import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "../ui/button";
import { useWeddingWebsite } from "../../hooks/use-website";
import { useGuestSummary } from "../../hooks/use-guests";
import { WidgetLoadError } from "../dashboard/widget-load-error";
import { ApiError } from "../../lib/api";

interface WebsiteStatusWidgetProps {
  weddingId: string | null;
}

export function WebsiteStatusWidget({ weddingId }: WebsiteStatusWidgetProps) {
  const navigate = useNavigate();
  const {
    data: website,
    isLoading: websiteLoading,
    isError: websiteError,
    error: websiteErrorObj,
  } = useWeddingWebsite(weddingId);
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useGuestSummary(weddingId);

  if (websiteLoading || summaryLoading) {
    return <div className="h-20 rounded-xl bg-muted/40 animate-pulse" />;
  }

  const websiteFeatureLocked =
    websiteErrorObj instanceof ApiError && websiteErrorObj.status === 402;

  if (websiteFeatureLocked) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-muted" />
          <span className="font-semibold text-foreground">Website status</span>
        </div>
        <p className="text-sm text-muted-foreground mb-1">
          Publish a wedding website so guests can RSVP online.
        </p>
        <p className="text-sm text-muted-foreground mb-3">
          It comes with a paid plan.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void navigate({ to: "/subscribe", search: { checkout: undefined } })
          }
        >
          See plans
        </Button>
      </div>
    );
  }

  if (websiteError || summaryError) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-muted" />
          <span className="font-semibold text-foreground">Website status</span>
        </div>
        <WidgetLoadError title="Website status is temporarily unavailable" />
      </div>
    );
  }

  const isPublished = !!website?.publishedSlug;
  const pendingCount =
    (summary?.byRsvp.pending ?? 0) + (summary?.byRsvp.invited ?? 0);
  const confirmedCount = summary?.byRsvp.accepted ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`h-2.5 w-2.5 rounded-full ${isPublished ? "bg-success" : "bg-muted"}`}
        />
        <span className="font-semibold text-foreground">
          {isPublished ? "Published" : "Not published"}
        </span>
      </div>

      {isPublished ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{pendingCount}</span>{" "}
            awaiting RSVP
          </p>
          <p>
            <span className="font-medium text-foreground">
              {confirmedCount}
            </span>{" "}
            confirmed
          </p>
          <Link
            to="/website"
            className="mt-3 inline-block text-primary underline-offset-4 hover:underline"
          >
            Manage website
          </Link>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Publish your wedding website so guests can RSVP online.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void navigate({ to: "/website" })}
          >
            Set up website
          </Button>
        </div>
      )}
    </div>
  );
}
