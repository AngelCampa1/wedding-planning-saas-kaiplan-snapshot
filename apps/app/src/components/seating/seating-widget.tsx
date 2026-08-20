import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useGuests } from "../../hooks/use-guests";
import { useSeatingChart } from "../../hooks/use-seating";
import { Card, CardContent } from "../ui/card";
import { WidgetLoadError } from "../dashboard/widget-load-error";
import type { GuestWithPlusOnes, RsvpStatus } from "@kaiplan/shared";

interface SeatingWidgetProps {
  weddingId: string | null;
  showStartHere?: boolean;
}

interface FlatGuest {
  id: string;
  rsvpStatus: RsvpStatus;
}

function flattenGuests(guests: GuestWithPlusOnes[]): FlatGuest[] {
  return guests.flatMap((guest) => [
    {
      id: guest.id,
      rsvpStatus: guest.rsvpStatus,
    },
    ...guest.plusOnes.map((plusOne) => ({
      id: plusOne.id,
      rsvpStatus: plusOne.rsvpStatus,
    })),
  ]);
}

export function SeatingWidget({
  weddingId,
  showStartHere = false,
}: SeatingWidgetProps) {
  const {
    data: seatingData,
    isLoading: seatingLoading,
    error: seatingError,
  } = useSeatingChart(weddingId);
  const {
    data: guests = [],
    isLoading: guestsLoading,
    error: guestsError,
  } = useGuests(weddingId);

  if (seatingLoading || guestsLoading) {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="h-32 animate-pulse rounded-lg bg-muted/20" />
        </CardContent>
      </Card>
    );
  }

  if (seatingError || guestsError) {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Seating
            </h3>
          </div>
          <WidgetLoadError title="Seating data is temporarily unavailable" />
        </CardContent>
      </Card>
    );
  }

  const flatGuests = flattenGuests(guests).filter(
    (guest) => guest.rsvpStatus !== "declined",
  );
  const acceptedGuests = flatGuests.filter(
    (guest) => guest.rsvpStatus === "accepted",
  );
  const assignedGuestIds = new Set(
    seatingData?.chart.tables.flatMap((table) =>
      table.seats
        .map((seat) => seat.guestId)
        .filter((guestId): guestId is string => Boolean(guestId)),
    ) ?? [],
  );

  const seatedCount = assignedGuestIds.size;
  const totalCapacity = seatingData?.summary.seatCount ?? 0;
  const totalUnseatedCount = Math.max(flatGuests.length - seatedCount, 0);
  const unseatedAcceptedCount = acceptedGuests.filter(
    (guest) => !assignedGuestIds.has(guest.id),
  ).length;
  const isEmpty = totalCapacity === 0 && flatGuests.length === 0;

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
              Seating
            </h3>
          </div>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted">
              Arrange tables and assign guests once your list is ready.
            </p>
            <Link
              to="/seating"
              className="text-sm font-medium text-primary hover:underline"
            >
              Open seating chart
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80">
      <CardContent>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Seating
          </h3>
          <Link
            to="/seating"
            className="text-xs font-medium text-primary hover:underline"
          >
            Open chart &rarr;
          </Link>
        </div>

        <div className="mb-4 flex gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted">Seated</span>
            <span className="text-2xl font-semibold text-foreground">
              {seatedCount}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted">Unseated</span>
            <span className="metric-emphasis--warning text-sm font-semibold">
              {totalUnseatedCount}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted">Capacity</span>
            <span className="text-sm font-semibold text-foreground">
              {seatedCount}/{totalCapacity}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Tables</span>
            <span className="font-medium text-foreground">
              {seatingData?.summary.tableCount ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Open seats</span>
            <span className="font-medium text-foreground">
              {Math.max(totalCapacity - seatedCount, 0)}
            </span>
          </div>
        </div>

        {unseatedAcceptedCount > 0 && (
          <div className="feedback-banner feedback-banner--warning mt-4 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <p>
              {unseatedAcceptedCount} accepted{" "}
              {unseatedAcceptedCount === 1 ? "guest remains" : "guests remain"}{" "}
              unseated.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
