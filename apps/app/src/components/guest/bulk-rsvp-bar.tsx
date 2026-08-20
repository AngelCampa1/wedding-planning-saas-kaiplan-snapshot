import { useState } from "react";
import type { RsvpStatus } from "@kaiplan/shared";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface BulkRsvpBarProps {
  selectedCount: number;
  onBulkUpdate: (status: RsvpStatus) => void;
  isUpdating: boolean;
}

export function BulkRsvpBar({
  selectedCount,
  onBulkUpdate,
  isUpdating,
}: BulkRsvpBarProps) {
  const [confirmDeclineOpen, setConfirmDeclineOpen] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <>
      <div
        className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-5 py-3 shadow-lg"
        data-help-key="guests-bulk-rsvp"
        data-tour="guests-bulk-rsvp"
      >
        <span className="text-sm font-medium text-foreground">
          {selectedCount} guests selected
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isUpdating}
            onClick={() => onBulkUpdate("invited")}
          >
            Invited
          </Button>
          <Button
            size="sm"
            className="bg-success text-success-foreground hover:bg-success/90"
            disabled={isUpdating}
            onClick={() => onBulkUpdate("accepted")}
          >
            Accepted
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isUpdating}
            onClick={() => setConfirmDeclineOpen(true)}
          >
            Declined
          </Button>
        </div>
      </div>

      <Dialog open={confirmDeclineOpen} onOpenChange={setConfirmDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm bulk decline?</DialogTitle>
            <DialogDescription>
              This will mark {selectedCount} selected guest
              {selectedCount === 1 ? "" : "s"} as declined.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDeclineOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmDeclineOpen(false);
                onBulkUpdate("declined");
              }}
            >
              Confirm decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
