import { Fragment, useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";
import type {
  Guest,
  GuestWithPlusOnes,
  DietaryTag,
  GuestSide,
  RsvpStatus,
} from "@kaiplan/shared";

const SIDE_LABELS: Record<GuestSide, string> = {
  partner1: "Partner 1",
  partner2: "Partner 2",
  mutual: "Mutual",
};
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface GuestTableProps {
  guests: GuestWithPlusOnes[];
  onEdit: (guest: Guest) => void;
  onDeleteGuest: (guestId: string) => void | Promise<void>;
  onDeleteHousehold: (guestId: string) => void | Promise<void>;
  householdsWithPlusOnes?: Set<string>;
  householdPlusOneCounts?: Map<string, number>;
  onAddPlusOne: (primaryGuest: GuestWithPlusOnes) => void;
  selectedIds: Set<string>;
  onToggleSelect: (guestId: string) => void;
  onToggleSelectAll: () => void;
  canMutate?: boolean;
}

type BadgeVariant = "neutral" | "info" | "success" | "destructive";

const RSVP_BADGE: Record<RsvpStatus, { label: string; variant: BadgeVariant }> =
  {
    pending: { label: "Pending", variant: "neutral" },
    invited: { label: "Invited", variant: "info" },
    accepted: { label: "Accepted", variant: "success" },
    declined: { label: "Declined", variant: "destructive" },
  };

const DIETARY_SHORT: Record<DietaryTag, string> = {
  vegetarian: "Veg",
  vegan: "Vegan",
  gluten_free: "GF",
  halal: "Halal",
  kosher: "Kosher",
  nut_allergy: "Nut",
  dairy_free: "DF",
  other: "Other",
};

function RsvpBadge({ status }: { status: RsvpStatus }) {
  const { label, variant } = RSVP_BADGE[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function DietaryTags({ tags }: { tags: DietaryTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge key={tag} variant="warning" className="px-1.5 text-xs">
          {DIETARY_SHORT[tag]}
        </Badge>
      ))}
    </div>
  );
}

interface PrimaryRowProps {
  guest: GuestWithPlusOnes;
  householdHasPlusOnes: boolean;
  plusOneCount: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onEdit: (guest: Guest) => void;
  onRequestGuestDelete: (guest: Guest) => void;
  onRequestHouseholdDelete: () => void;
  onAddPlusOne: (primaryGuest: GuestWithPlusOnes) => void;
  onToggleSelect: (guestId: string) => void;
  canMutate: boolean;
}

function PrimaryRow({
  guest,
  householdHasPlusOnes,
  plusOneCount,
  isExpanded,
  isSelected,
  onToggleExpand,
  onEdit,
  onRequestGuestDelete,
  onRequestHouseholdDelete,
  onAddPlusOne,
  onToggleSelect,
  canMutate,
}: PrimaryRowProps) {
  const fullName = `${guest.firstName} ${guest.lastName}`;
  const hasPlusOnes = householdHasPlusOnes;

  return (
    <tr className="border-b border-border hover:bg-surface/50 transition-colors">
      <td className="px-3 py-3">
        <input
          type="checkbox"
          aria-label={`Select ${fullName}`}
          checked={isSelected}
          onChange={() => onToggleSelect(guest.id)}
          disabled={!canMutate}
          className="h-4 w-4 rounded border-border accent-primary"
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          {hasPlusOnes && (
            <button
              type="button"
              aria-label={`Expand ${fullName} plus-ones`}
              onClick={onToggleExpand}
              className="text-muted hover:text-foreground transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
          <span className="font-medium text-sm">{fullName}</span>
          {hasPlusOnes && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              +{plusOneCount}
            </span>
          )}
        </div>
        {guest.email ? (
          <p className="mt-1 text-xs text-muted">{guest.email}</p>
        ) : null}
      </td>
      <td className="hidden px-3 py-3 text-sm text-muted md:table-cell">
        {SIDE_LABELS[guest.side]}
      </td>
      <td className="hidden px-3 py-3 text-sm text-muted md:table-cell">
        {guest.groupName ?? "\u2014"}
      </td>
      <td className="px-3 py-3">
        <RsvpBadge status={guest.rsvpStatus} />
      </td>
      <td className="hidden px-3 py-3 lg:table-cell">
        <DietaryTags tags={guest.dietaryTags} />
      </td>
      <td className="px-3 py-3">
        {canMutate ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Add plus-one to ${fullName}`}
              onClick={() => onAddPlusOne(guest)}
              className="action-icon-button"
            >
              <UserPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Edit ${fullName}`}
              onClick={() => onEdit(guest)}
              className="action-icon-button"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${fullName}`}
              onClick={() => {
                if (hasPlusOnes) {
                  onRequestHouseholdDelete();
                  return;
                }

                onRequestGuestDelete(guest);
              }}
              className="action-icon-button action-icon-button--destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

interface PlusOneRowProps {
  plusOne: Guest;
  onEdit: (guest: Guest) => void;
  onRequestGuestDelete: (guest: Guest) => void;
  canMutate: boolean;
}

function PlusOneRow({
  plusOne,
  onEdit,
  onRequestGuestDelete,
  canMutate,
}: PlusOneRowProps) {
  const fullName = `${plusOne.firstName} ${plusOne.lastName}`;

  return (
    <tr className="border-b border-border bg-surface/30 hover:bg-surface/60 transition-colors">
      <td className="px-3 py-2.5" />
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 pl-6">
          <span className="text-sm text-muted">{fullName}</span>
        </div>
        {plusOne.email ? (
          <p className="mt-1 pl-6 text-xs text-muted">{plusOne.email}</p>
        ) : null}
      </td>
      <td className="hidden px-3 py-2.5 text-sm text-muted md:table-cell">
        {SIDE_LABELS[plusOne.side]}
      </td>
      <td className="hidden px-3 py-2.5 text-sm text-muted md:table-cell">
        {plusOne.groupName ?? "\u2014"}
      </td>
      <td className="px-3 py-2.5">
        <RsvpBadge status={plusOne.rsvpStatus} />
      </td>
      <td className="hidden px-3 py-2.5 lg:table-cell">
        <DietaryTags tags={plusOne.dietaryTags} />
      </td>
      <td className="px-3 py-2.5">
        {canMutate ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Edit ${fullName}`}
              onClick={() => onEdit(plusOne)}
              className="action-icon-button"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${fullName}`}
              onClick={() => onRequestGuestDelete(plusOne)}
              className="action-icon-button action-icon-button--destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function GuestTable({
  guests,
  onEdit,
  onDeleteGuest,
  onDeleteHousehold,
  householdsWithPlusOnes,
  householdPlusOneCounts,
  onAddPlusOne,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  canMutate = true,
}: GuestTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [householdDeleteGuest, setHouseholdDeleteGuest] =
    useState<GuestWithPlusOnes | null>(null);
  const [guestDeleteTarget, setGuestDeleteTarget] = useState<Guest | null>(
    null,
  );
  const [isGuestDeletePending, setIsGuestDeletePending] = useState(false);
  const [guestDeleteError, setGuestDeleteError] = useState<string | null>(null);
  const [isHouseholdDeletePending, setIsHouseholdDeletePending] =
    useState(false);
  const [householdDeleteError, setHouseholdDeleteError] = useState<
    string | null
  >(null);
  const householdDeletePlusOneCount = householdDeleteGuest
    ? (householdPlusOneCounts?.get(householdDeleteGuest.id) ??
      householdDeleteGuest.plusOnes.length)
    : 0;

  useEffect(() => {
    const guestIds = new Set(
      guests.flatMap((guest) => [
        guest.id,
        ...guest.plusOnes.map((po) => po.id),
      ]),
    );
    const primaryGuestIds = new Set(guests.map((guest) => guest.id));

    if (guestDeleteTarget && !guestIds.has(guestDeleteTarget.id)) {
      setGuestDeleteTarget(null);
      setIsGuestDeletePending(false);
      setGuestDeleteError(null);
    }

    if (householdDeleteGuest && !primaryGuestIds.has(householdDeleteGuest.id)) {
      setHouseholdDeleteGuest(null);
      setIsHouseholdDeletePending(false);
      setHouseholdDeleteError(null);
    }
  }, [guestDeleteTarget, guests, householdDeleteGuest]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (guests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted text-sm">No guests yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-background">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-surface/50">
            <tr>
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all guests"
                  onChange={onToggleSelectAll}
                  disabled={!canMutate}
                  checked={
                    guests.length > 0 &&
                    guests.every((g) => selectedIds.has(g.id))
                  }
                  className="h-4 w-4 rounded border-border accent-primary"
                />
              </th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Name
              </th>
              <th className="hidden px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted md:table-cell">
                Side
              </th>
              <th className="hidden px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted md:table-cell">
                Group
              </th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                RSVP
              </th>
              <th className="hidden px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted lg:table-cell">
                Dietary
              </th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {guests.map((guest) => (
              <Fragment key={guest.id}>
                <PrimaryRow
                  guest={guest}
                  householdHasPlusOnes={
                    guest.plusOnes.length > 0 ||
                    householdsWithPlusOnes?.has(guest.id) === true
                  }
                  plusOneCount={
                    householdPlusOneCounts?.get(guest.id) ??
                    guest.plusOnes.length
                  }
                  isExpanded={expandedIds.has(guest.id)}
                  isSelected={selectedIds.has(guest.id)}
                  onToggleExpand={() => toggleExpand(guest.id)}
                  onEdit={onEdit}
                  onRequestGuestDelete={setGuestDeleteTarget}
                  onRequestHouseholdDelete={() =>
                    setHouseholdDeleteGuest(guest)
                  }
                  onAddPlusOne={onAddPlusOne}
                  onToggleSelect={onToggleSelect}
                  canMutate={canMutate}
                />
                {expandedIds.has(guest.id) &&
                  guest.plusOnes.map((plusOne) => (
                    <PlusOneRow
                      key={plusOne.id}
                      plusOne={plusOne}
                      onEdit={onEdit}
                      onRequestGuestDelete={setGuestDeleteTarget}
                      canMutate={canMutate}
                    />
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={guestDeleteTarget !== null}
        onOpenChange={() => {
          setGuestDeleteTarget(null);
          setIsGuestDeletePending(false);
          setGuestDeleteError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {guestDeleteTarget
                ? `Delete ${guestDeleteTarget.firstName} ${guestDeleteTarget.lastName}?`
                : "Delete guest?"}
            </DialogTitle>
            <DialogDescription>
              {guestDeleteTarget
                ? `This will permanently remove ${guestDeleteTarget.firstName} ${guestDeleteTarget.lastName} from this wedding.`
                : "This will permanently remove the selected guest from this wedding."}
            </DialogDescription>
          </DialogHeader>
          {guestDeleteError ? (
            <p className="feedback-banner feedback-banner--error">
              {guestDeleteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setGuestDeleteTarget(null);
                setGuestDeleteError(null);
              }}
              disabled={isGuestDeletePending || !canMutate}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isGuestDeletePending}
              onClick={async () => {
                setIsGuestDeletePending(true);
                setGuestDeleteError(null);
                try {
                  await onDeleteGuest(guestDeleteTarget!.id);
                  setGuestDeleteTarget(null);
                } catch (error) {
                  setGuestDeleteError(
                    error instanceof Error
                      ? error.message
                      : "Could not delete this guest.",
                  );
                } finally {
                  setIsGuestDeletePending(false);
                }
              }}
            >
              Delete guest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={householdDeleteGuest !== null}
        onOpenChange={() => {
          setHouseholdDeleteGuest(null);
          setIsHouseholdDeletePending(false);
          setHouseholdDeleteError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {householdDeleteGuest
                ? `Delete household for ${householdDeleteGuest.firstName} ${householdDeleteGuest.lastName}?`
                : "Delete household?"}
            </DialogTitle>
            <DialogDescription>
              {householdDeleteGuest
                ? `This will delete ${householdDeleteGuest.firstName} ${householdDeleteGuest.lastName} and ${householdDeletePlusOneCount} plus-one${
                    householdDeletePlusOneCount === 1 ? "" : "s"
                  }.`
                : "This will delete the selected household."}
            </DialogDescription>
          </DialogHeader>
          {householdDeleteError ? (
            <p className="feedback-banner feedback-banner--error">
              {householdDeleteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setHouseholdDeleteGuest(null);
                setHouseholdDeleteError(null);
              }}
              disabled={isHouseholdDeletePending || !canMutate}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isHouseholdDeletePending}
              onClick={async () => {
                setIsHouseholdDeletePending(true);
                setHouseholdDeleteError(null);
                try {
                  await onDeleteHousehold(householdDeleteGuest!.id);
                  setHouseholdDeleteGuest(null);
                } catch (error) {
                  setHouseholdDeleteError(
                    error instanceof Error
                      ? error.message
                      : "Could not delete this household.",
                  );
                } finally {
                  setIsHouseholdDeletePending(false);
                }
              }}
            >
              Delete household
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
