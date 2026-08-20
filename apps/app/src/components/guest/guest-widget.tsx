import { Link } from "@tanstack/react-router";
import { useGuestSummary, useGuests } from "../../hooks/use-guests";
import type { GuestWithPlusOnes, RsvpStatus } from "@kaiplan/shared";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { WidgetLoadError } from "../dashboard/widget-load-error";

type BadgeVariant = "neutral" | "info" | "success" | "destructive";

interface GuestWidgetProps {
  weddingId: string | null;
  showStartHere?: boolean;
}

interface FlatGuest {
  id: string;
  name: string;
  rsvpStatus: RsvpStatus;
  updatedAt: string;
}

const rsvpBadgeVariant: Record<RsvpStatus, BadgeVariant> = {
  pending: "neutral",
  invited: "info",
  accepted: "success",
  declined: "destructive",
};

function flattenGuests(guests: GuestWithPlusOnes[]): FlatGuest[] {
  const result: FlatGuest[] = [];
  for (const g of guests) {
    result.push({
      id: g.id,
      name: `${g.firstName} ${g.lastName}`,
      rsvpStatus: g.rsvpStatus,
      updatedAt: g.updatedAt,
    });
    for (const po of g.plusOnes) {
      result.push({
        id: po.id,
        name: `${po.firstName} ${po.lastName}`,
        rsvpStatus: po.rsvpStatus,
        updatedAt: po.updatedAt,
      });
    }
  }
  return result;
}

export function GuestWidget({
  weddingId,
  showStartHere = false,
}: GuestWidgetProps) {
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useGuestSummary(weddingId);
  const {
    data: guests,
    isLoading: guestsLoading,
    error: guestsError,
  } = useGuests(weddingId);

  const isLoading = summaryLoading || guestsLoading;

  if (isLoading) {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="h-32 animate-pulse rounded-lg bg-muted/20" />
        </CardContent>
      </Card>
    );
  }

  if (summaryError || guestsError) {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Guest List
            </h3>
          </div>
          <WidgetLoadError title="Guest list is temporarily unavailable" />
        </CardContent>
      </Card>
    );
  }

  const isEmpty = !summary || summary.totalGuests === 0;

  if (isEmpty) {
    return (
      <Card className="border-border/80">
        <CardContent>
          {showStartHere && (
            <span className="mb-2 inline-block rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
              Start here
            </span>
          )}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Guest List
            </h3>
          </div>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted">
              Add guests one by one or import from a spreadsheet.
            </p>
            <Link
              to="/guests"
              className="text-sm font-medium text-primary hover:underline"
            >
              Add guests
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const recentGuests = flattenGuests(guests ?? [])
    .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
    .slice(0, 5);

  return (
    <Card className="border-border/80">
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Guest List
          </h3>
          <Link
            to="/guests"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all &rarr;
          </Link>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted">Total</span>
            <span className="text-2xl font-semibold text-foreground">
              {summary.totalGuests}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted">Confirmed</span>
            <span className="metric-emphasis--success text-sm font-semibold">
              {summary.byRsvp.accepted}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted">Pending</span>
            <span className="metric-emphasis--warning text-sm font-semibold">
              {summary.byRsvp.pending}
            </span>
          </div>
        </div>

        {recentGuests.length > 0 && (
          <div className="flex flex-col gap-2">
            {recentGuests.map((guest) => (
              <div key={guest.id} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{guest.name}</span>
                <Badge variant={rsvpBadgeVariant[guest.rsvpStatus]}>
                  {guest.rsvpStatus}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
