# Email Template Redesign + RSVP URL Fix


**Goal:** Redesign the four transactional email templates to match Kaiplan's visual identity, enrich RSVP emails with guest and wedding context, and fix the RSVP URL bug where `weddingId` is used instead of `publishedSlug`.

**Architecture:** All changes in `apps/api`. The email service (`src/lib/email.ts`) loads additional DB context via raw queries (no Drizzle relations — none are declared in this codebase) before rendering; templates (`src/lib/email-templates.tsx`) are redesigned with inline brand styles. No new routes, no schema changes.

**Tech Stack:** React Email (`@react-email/components`, `@react-email/render`), Resend, Drizzle ORM, Vitest

---

## Problem Summary

### Bug: RSVP URL uses weddingId as slug

`email.ts` lines 447 and 521:
```typescript
const rsvpUrl = `${env.APP_URL}/w/${input.weddingId}?token=${input.token}#rsvp`;
```

Wedding pages live at `/w/[publishedSlug]`, not `/w/[weddingId]`. A guest clicking this link gets a 404.

**Fix:** Query the `weddingWebsite` table for `publishedSlug` before rendering the confirmation/reminder email. If `publishedSlug` is null (website not yet published), send the email without the "Review your RSVP" CTA button — just acknowledge the RSVP was received. Do not silently drop the email, because the guest RSVPed successfully and silence is confusing. The template must support an optional `rsvpUrl` prop; when null, skip the CTA button but still show the household summary.

### Templates are bare-bones

- `RsvpConfirmationEmail` says "We recorded your household's latest RSVP details" with a raw URL — no guest name, no wedding name, no summary of who is attending.
- `RsvpReminderEmail` says "The couple is still waiting on your household's RSVP" — no wedding name, no context.
- `MemberInviteEmail` links to `/login` (generic) and does not mention the wedding name.
- No brand colours, no button CTAs, no visual hierarchy.

---

## Data Loading (No Drizzle Relations)

**Important:** This codebase does NOT declare `relations()` anywhere. Do not use `db.query.X.findFirst({ with: ... })` — it will throw a runtime error. Use raw `db.select()` queries with `eq()` and `inArray()` filters, matching the pattern in `apps/api/src/routes/guests.ts` lines 43–56.

### sendRsvpConfirmation context to load

Already in input: `{ weddingId, primaryGuestId, guestEmail, token }`

Load from DB before sending:
1. `weddingWebsite` row: `publishedSlug` (nullable — if null, omit rsvpUrl but still send)
2. `guest` row for `primaryGuestId`: `firstName`, `lastName`, `rsvpStatus`
3. Plus-ones: `SELECT * FROM guest WHERE primaryGuestId = $primaryGuestId`
4. `wedding` row: `name`, `date`

Build `householdSummary: { name: string; status: string }[]` — array of all household members (primary first, then plus-ones) with their current `rsvpStatus` mapped to a human label (see Status Labels section).

### sendRsvpReminder context to load

Already in input: `{ weddingId, primaryGuestId, guestEmail?, token? }`

Load from DB before sending:
1. `weddingWebsite` row: `publishedSlug` (nullable)
2. `guest` row for `primaryGuestId`: `firstName`
3. `wedding` row: `name`, `date`

If `publishedSlug` is null, return `{ ..., status: "skippedNoWebsite" }` — do not send a reminder with no URL to RSVP at.

### sendMemberInvite context to load

Already in input: `{ email, role, weddingId, invitedBy: { email, name } }`

Add one DB query: `SELECT name FROM wedding WHERE id = $weddingId`. Pass `weddingName` to the template.

No unsubscribe URL for member invite emails — they are one-time invitations. Remove `unsubscribeUrl` from `MemberInviteEmail` props entirely. Do not create an unsubscribe token for member invite.

---

## Schema Updates (packages/shared)

Add `"skippedNoWebsite"` to the reminder delivery result status union in `packages/shared/src/email-schemas.ts`:

```typescript
// reminderDeliveryResultSchema status values — add "skippedNoWebsite"
status: z.enum(["sent", "skippedOptedOut", "skippedMissingEmail", "skippedIneligible", "skippedNoWebsite", "failed"])
```

---

## RSVP Status Labels

Map `rsvpStatus` DB values to human-readable labels — define this constant in `email-templates.tsx`:

```typescript
const STATUS_LABELS: Record<string, string> = {
  accepted: "Joyfully attending",
  declined: "Can't make it",
  pending: "Still deciding",
  invited: "Still deciding",
};
function rsvpLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
```

---

## Template Designs

All templates share a `Layout` component with Kaiplan brand styling:

```
Brand tokens (inline styles — email clients don't support CSS variables):
  Background:    #f8f8f6
  Card:          #ffffff, border #e5e7eb, border-radius 16px, padding 32px
  Heading font:  Georgia, "Times New Roman", serif  (Fraunces not safe in email)
  Body font:     Arial, Helvetica, sans-serif        (DM Sans not safe in email)
  Primary green: #7C9A82
  Accent gold:   #C5A55A
  Muted text:    #8A8478
  Body text:     #1f2937
```

### CTA Button component

Add a reusable `CtaButton` inside `email-templates.tsx`:

```tsx
function CtaButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        marginTop: "24px",
        padding: "12px 24px",
        backgroundColor: "#7C9A82",
        color: "#ffffff",
        borderRadius: "8px",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "15px",
        fontWeight: "600",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}
```

### RsvpConfirmationEmail

**Props:**
```typescript
{
  guestFirstName: string;
  weddingName: string;
  weddingDate: string | null;       // ISO date string e.g. "2026-06-07"
  householdSummary: { name: string; status: string }[];  // pre-mapped to human labels
  rsvpUrl: string | null;           // null when website not yet published
  manageUrl: string;
}
```

**Subject:** `Your RSVP is confirmed — {weddingName}`

**Content:**
- "Hi {guestFirstName},"
- Heading: "Your RSVP is in!"
- Household summary: a simple list of name — status pairs
- If `rsvpUrl` is non-null: `<CtaButton href={rsvpUrl}>Review or update your RSVP</CtaButton>`
- Footer: wedding name + date (formatted: "Saturday, June 7, 2026"); if no date, omit date
- Manage preferences link

### RsvpReminderEmail

**Props:**
```typescript
{
  guestFirstName: string;
  weddingName: string;
  weddingDate: string | null;
  rsvpUrl: string;                  // only sent when publishedSlug exists, so always non-null
  manageUrl: string;
}
```

**Subject:** `RSVP reminder from {weddingName}`

**Content:**
- "Hi {guestFirstName},"
- Heading: "A quick RSVP reminder"
- Body: "The couple is still waiting on your household's RSVP for {weddingName}. It only takes a moment!"
- `<CtaButton href={rsvpUrl}>Respond now</CtaButton>`
- Footer: wedding name + date
- Manage preferences link

### MemberInviteEmail

**Props:**
```typescript
{
  invitedByName: string;
  weddingName: string;
  role: string;
  inviteUrl: string;
  // No unsubscribeUrl — one-time invite, no ongoing subscription
}
```

**Subject:** `{invitedByName} invited you to {weddingName} on Kaiplan`

**Content:**
- Heading: "You've been invited"
- Body: "{invitedByName} invited you to collaborate on {weddingName} as a {role}."
- `<CtaButton href={inviteUrl}>Open your invitation</CtaButton>`
- No unsubscribe footer

### PasswordResetEmail

**Props:** `{ resetUrl: string }` (unchanged)

**Subject:** `Reset your Kaiplan password` (unchanged)

**Content:**
- Body: "Use the link below to choose a new password. This link expires in 1 hour."
- `<CtaButton href={resetUrl}>Reset password</CtaButton>`
- No unsubscribe footer

---

## Email Service Changes (email.ts)

### sendRsvpConfirmation

```typescript
async sendRsvpConfirmation(input) {
  // 1. Check preference first (fast path)
  const enabled = await loadPreferenceValue(db, {
    email: input.guestEmail,
    weddingId: input.weddingId,
    preferenceType: "rsvpConfirmation",
  });
  if (!enabled) return;

  // 2. Load publishedSlug (nullable — rsvpUrl will be null if not published)
  const [websiteRow] = await db
    .select({ publishedSlug: weddingWebsite.publishedSlug })
    .from(weddingWebsite)
    .where(eq(weddingWebsite.weddingId, input.weddingId))
    .limit(1);

  const rsvpUrl = websiteRow?.publishedSlug
    ? `${env.APP_URL.replace(/\/$/, "")}/w/${websiteRow.publishedSlug}?token=${input.token}#rsvp`
    : null;

  // 3. Load guest + plus-ones (raw query — no relations declared)
  const [primaryGuest] = await db
    .select({ firstName: guest.firstName, lastName: guest.lastName, rsvpStatus: guest.rsvpStatus })
    .from(guest)
    .where(eq(guest.id, input.primaryGuestId))
    .limit(1);

  const plusOnes = await db
    .select({ firstName: guest.firstName, lastName: guest.lastName, rsvpStatus: guest.rsvpStatus })
    .from(guest)
    .where(eq(guest.primaryGuestId, input.primaryGuestId));

  // 4. Load wedding name + date
  const [weddingRow] = await db
    .select({ name: wedding.name, date: wedding.date })
    .from(wedding)
    .where(eq(wedding.id, input.weddingId))
    .limit(1);

  // 5. Build household summary
  const householdSummary = [
    { name: `${primaryGuest.firstName} ${primaryGuest.lastName}`, status: rsvpLabel(primaryGuest.rsvpStatus) },
    ...plusOnes.map(po => ({ name: `${po.firstName} ${po.lastName}`, status: rsvpLabel(po.rsvpStatus) })),
  ];

  // 6. Render + send
  const manageUrl = await createManagePreferencesUrl(...);
  const html = await render(RsvpConfirmationEmail({
    guestFirstName: primaryGuest.firstName,
    weddingName: weddingRow.name,
    weddingDate: weddingRow.date ?? null,
    householdSummary,
    rsvpUrl,
    manageUrl,
  }));
  // ... sendMessage + recordSend (unchanged)
}
```

### sendRsvpReminder

Add the same `publishedSlug` query. If null, return early:
```typescript
if (!websiteRow?.publishedSlug) {
  return {
    primaryGuestId: input.primaryGuestId,
    guestEmail: input.guestEmail,
    status: "skippedNoWebsite",
    emailId: null,
    error: null,
  };
}
```

Load `guest.firstName` and `wedding.name` + `wedding.date` via raw queries before rendering.

### sendMemberInvite

Add one query:
```typescript
const [weddingRow] = await db
  .select({ name: wedding.name })
  .from(wedding)
  .where(eq(wedding.id, input.weddingId))
  .limit(1);
```

Remove `unsubscribeUrl` — do not call `createManagePreferencesUrl` for member invites. Pass `weddingName: weddingRow.name` to the template.

---

## Testing

**`apps/api/__tests__/lib/email-templates.test.tsx`** (create)
- Each template renders to HTML without throwing
- `RsvpConfirmationEmail`: HTML contains `guestFirstName`, `weddingName`, each household member name and status label
- `RsvpConfirmationEmail` with `rsvpUrl: null`: no CTA button link in output
- `RsvpConfirmationEmail` with `rsvpUrl` set: CTA button appears with correct href
- `RsvpReminderEmail`: HTML contains `guestFirstName`, `weddingName`, CTA with rsvpUrl
- `MemberInviteEmail`: HTML contains inviter name, wedding name, role, invite URL; no unsubscribe text
- `PasswordResetEmail`: HTML contains reset URL
- `CtaButton`: renders `<a>` with correct href and green background color
- `rsvpLabel("accepted")` → "Joyfully attending"; `"declined"` → "Can't make it"; `"pending"` → "Still deciding"; `"invited"` → "Still deciding"; unknown → passthrough

**`apps/api/__tests__/lib/email.test.ts`** (add cases)
- `sendRsvpConfirmation`: sends with `rsvpUrl: null` when `publishedSlug` is null
- `sendRsvpConfirmation`: uses `publishedSlug` in rsvpUrl when present
- `sendRsvpConfirmation`: includes correct householdSummary with plus-ones
- `sendRsvpReminder`: returns `{ status: "skippedNoWebsite" }` when `publishedSlug` is null
- `sendRsvpReminder`: uses `publishedSlug` in rsvpUrl when present
- `sendMemberInvite`: template receives `weddingName`; no unsubscribe token created

95% coverage required on `email-templates.tsx` and touched sections of `email.ts`.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/email-templates.tsx` | Redesign all 4 templates; add `CtaButton`; update props; add `rsvpLabel` |
| `apps/api/src/lib/email.ts` | Fix RSVP URL; load DB context via raw queries; gate reminder on `publishedSlug`; remove unsubscribe from invite |
| `packages/shared/src/email-schemas.ts` | Add `"skippedNoWebsite"` to reminder status enum |
| `apps/api/__tests__/lib/email-templates.test.tsx` | Create — test all templates, CtaButton, rsvpLabel |
| `apps/api/__tests__/lib/email.test.ts` | Add tests for URL fix, publishedSlug gate, weddingName in invite |
