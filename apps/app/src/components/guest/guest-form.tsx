import { useEffect, useRef, useState } from "react";
import {
  GUEST_SIDES,
  RSVP_STATUSES,
  DIETARY_TAGS,
  type Guest,
  type GuestSide,
  type DietaryTag,
  type RsvpStatus,
  type CreateGuestInput,
} from "@kaiplan/shared";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { HelpFieldLabel } from "../guidance/help-field-label";

interface GuestFormProps {
  guest?: Guest;
  onSubmit: (data: CreateGuestInput) => void;
  onCancel: () => void;
  existingGroups: string[];
  defaultSide?: GuestSide;
  primaryGuestId?: string;
  isSubmitting?: boolean;
  isOpen?: boolean;
}

const SIDE_LABELS: Record<GuestSide, string> = {
  partner1: "Partner 1",
  partner2: "Partner 2",
  mutual: "Mutual",
};

const RSVP_LABELS: Record<RsvpStatus, string> = {
  pending: "Pending",
  invited: "Invited",
  accepted: "Accepted",
  declined: "Declined",
};

const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  gluten_free: "Gluten Free",
  halal: "Halal",
  kosher: "Kosher",
  nut_allergy: "Nut Allergy",
  dairy_free: "Dairy Free",
  other: "Other",
};

export function GuestForm({
  guest,
  onSubmit,
  onCancel,
  existingGroups,
  defaultSide,
  primaryGuestId,
  isSubmitting = false,
  isOpen = true,
}: GuestFormProps) {
  const [firstName, setFirstName] = useState(guest?.firstName ?? "");
  const [lastName, setLastName] = useState(guest?.lastName ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [phone, setPhone] = useState(guest?.phone ?? "");
  const [side, setSide] = useState<GuestSide>(
    guest?.side ?? defaultSide ?? "mutual",
  );
  const [groupName, setGroupName] = useState(guest?.groupName ?? "");
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(
    guest?.dietaryTags ?? [],
  );
  const [dietaryNotes, setDietaryNotes] = useState(guest?.dietaryNotes ?? "");
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>(
    guest?.rsvpStatus ?? "pending",
  );

  const previousIsOpenRef = useRef(isOpen);
  const previousTargetKeyRef = useRef(
    `${guest?.id ?? "new"}:${primaryGuestId ?? "none"}:${defaultSide ?? "mutual"}`,
  );

  useEffect(() => {
    const targetKey = `${guest?.id ?? "new"}:${primaryGuestId ?? "none"}:${defaultSide ?? "mutual"}`;
    const reopened = isOpen && !previousIsOpenRef.current;
    const targetChanged = targetKey !== previousTargetKeyRef.current;

    previousIsOpenRef.current = isOpen;
    previousTargetKeyRef.current = targetKey;

    if (!isOpen) {
      return;
    }

    if (!reopened && !targetChanged) {
      return;
    }

    setFirstName(guest?.firstName ?? "");
    setLastName(guest?.lastName ?? "");
    setEmail(guest?.email ?? "");
    setPhone(guest?.phone ?? "");
    setSide(guest?.side ?? defaultSide ?? "mutual");
    setGroupName(guest?.groupName ?? "");
    setDietaryTags(guest?.dietaryTags ?? []);
    setDietaryNotes(guest?.dietaryNotes ?? "");
    setRsvpStatus(guest?.rsvpStatus ?? "pending");
  }, [
    defaultSide,
    guest?.dietaryNotes,
    guest?.dietaryTags,
    guest?.email,
    guest?.firstName,
    guest?.groupName,
    guest?.id,
    guest?.lastName,
    guest?.phone,
    guest?.rsvpStatus,
    guest?.side,
    isOpen,
    primaryGuestId,
  ]);

  const listboxId = "group-suggestions";
  const isFirstNameEmpty = firstName.trim() === "";
  const isLastNameEmpty = lastName.trim() === "";
  const isSubmitDisabled = isSubmitting || isFirstNameEmpty || isLastNameEmpty;

  function getSubmitLabel() {
    if (isSubmitting) return "Saving...";
    if (guest) return "Save Changes";
    if (primaryGuestId) return "Add Plus-One";
    return "Add Guest";
  }

  function toggleDietaryTag(tag: DietaryTag) {
    setDietaryTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      side,
      groupName: groupName.trim() || null,
      dietaryTags,
      dietaryNotes: dietaryNotes.trim() || null,
      rsvpStatus,
      primaryGuestId: primaryGuestId ?? null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        data-testid="guest-name-fields"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guest-first-name">First Name</Label>
          <Input
            id="guest-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Jane"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guest-last-name">Last Name</Label>
          <Input
            id="guest-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Doe"
          />
        </div>
      </div>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        data-testid="guest-contact-fields"
      >
        <div className="flex flex-col gap-1.5">
          <HelpFieldLabel
            htmlFor="guest-email"
            help="Used for RSVP confirmations and reminders when those emails are enabled."
            hint="Optional, but useful if you plan to send online RSVP links."
          >
            Email
          </HelpFieldLabel>
          <Input
            id="guest-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="guest-phone">Phone</Label>
          <Input
            id="guest-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="555-1234"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <HelpFieldLabel
          help="Side helps you filter by partner, family, or mutual friends later."
          hint="This never changes the invitation; it only helps you organize."
        >
          Side
        </HelpFieldLabel>
        <div className="flex gap-2">
          {GUEST_SIDES.map((s) => (
            <Button
              key={s}
              type="button"
              variant={side === s ? "default" : "outline"}
              size="sm"
              data-active={side === s}
              onClick={() => setSide(s)}
            >
              {SIDE_LABELS[s]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <HelpFieldLabel
          htmlFor="guest-group"
          help="Group keeps households or friend groups together for RSVPs and seating."
          hint="Examples: Family, College friends, Work, Table 4."
        >
          Group
        </HelpFieldLabel>
        <Input
          id="guest-group"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="e.g. Family"
          list={listboxId}
        />
        <datalist id={listboxId}>
          {existingGroups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1.5">
        <HelpFieldLabel
          help="Dietary tags help you share meal needs with catering later."
          hint="Leave this empty when the guest has no known requirements."
        >
          Dietary Requirements
        </HelpFieldLabel>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant={dietaryTags.includes(tag) ? "default" : "outline"}
              size="sm"
              data-active={dietaryTags.includes(tag)}
              onClick={() => toggleDietaryTag(tag)}
            >
              {DIETARY_LABELS[tag]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="guest-dietary-notes">Dietary Notes</Label>
        <textarea
          id="guest-dietary-notes"
          value={dietaryNotes}
          onChange={(e) => setDietaryNotes(e.target.value)}
          placeholder="Any additional dietary notes..."
          className="h-20 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <HelpFieldLabel
          htmlFor="guest-rsvp-status"
          help="Pending means no answer yet; invited means you have sent the invitation."
          hint="Accepted and declined should match the guest's actual reply."
        >
          RSVP Status
        </HelpFieldLabel>
        <select
          id="guest-rsvp-status"
          value={rsvpStatus}
          onChange={(e) => setRsvpStatus(e.target.value as RsvpStatus)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {RSVP_STATUSES.map((status) => (
            <option key={status} value={status}>
              {RSVP_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitDisabled}>
          {getSubmitLabel()}
        </Button>
      </div>
    </form>
  );
}
