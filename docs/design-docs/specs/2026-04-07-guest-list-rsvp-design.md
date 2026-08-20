# Phase 2: Guest List + RSVP — Design Spec

**Date:** 2026-04-07
**Status:** Draft
**Depends on:** Phase 0 (auth + dashboard shell), Phase 1 (budget ledger)
**Feeds into:** Phase 3 (seating chart — needs individual guest records for seat assignment)

---

## Overview

High-engagement feature enabling couples to manage their guest list, track RSVP status manually, and bulk-import guests via CSV. Every person (primary guest or plus-one) is a full record, enabling individual seat assignment in Phase 3.

---

## Data Model

### `guest` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `defaultRandom()` |
| `wedding_id` | uuid FK → wedding.id | CASCADE delete, scoped via middleware |
| `primary_guest_id` | uuid FK → guest.id | NULL for primary guests, self-ref for plus-ones. CASCADE delete. |
| `first_name` | text NOT NULL | 1-100 chars |
| `last_name` | text NOT NULL | 1-100 chars |
| `email` | text | nullable |
| `phone` | text | nullable, max 50 chars |
| `side` | text NOT NULL | enum: `"partner1"`, `"partner2"`, `"mutual"`. Default `"mutual"` |
| `group_name` | text | nullable freeform, max 100 chars — "College Friends", "Family", etc. |
| `dietary_tags` | text[] | Postgres array. Validated against predefined set. |
| `dietary_notes` | text | nullable freeform, max 500 chars |
| `rsvp_status` | text NOT NULL | enum: `"pending"`, `"invited"`, `"accepted"`, `"declined"`. Default `"pending"` |
| `sort_order` | integer NOT NULL | Default 0 |
| `created_at` | timestamp w/tz | `defaultNow()` |
| `updated_at` | timestamp w/tz | `defaultNow()` |

**Constraints:**
- Unique on `(wedding_id, first_name, last_name, primary_guest_id)` — prevents exact duplicate guests within a wedding
- Plus-ones inherit `wedding_id` and `side` from their primary guest at creation time (enforced at app level)
- When a primary guest is deleted, plus-ones cascade-delete

**Predefined dietary tags:** `vegetarian`, `vegan`, `gluten_free`, `halal`, `kosher`, `nut_allergy`, `dairy_free`, `other`

---

## Shared Package

### Constants

```typescript
export const GUEST_SIDES = ["partner1", "partner2", "mutual"] as const;
export type GuestSide = (typeof GUEST_SIDES)[number];

export const RSVP_STATUSES = ["pending", "invited", "accepted", "declined"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const DIETARY_TAGS = [
  "vegetarian", "vegan", "gluten_free", "halal",
  "kosher", "nut_allergy", "dairy_free", "other",
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];
```

### Zod Schemas

- **`createGuestSchema`** — `firstName`, `lastName` required (1-100 chars, trimmed). `email` optional valid email. `phone` optional (max 50). `side` defaults `"mutual"`. `rsvpStatus` defaults `"pending"`. `dietaryTags` validated as array of enum values (max 8). `dietaryNotes` optional (max 500). `groupName` optional (max 100). `primaryGuestId` optional uuid.
- **`updateGuestSchema`** — partial of create schema.
- **`bulkUpdateRsvpSchema`** — array of `{ id: uuid, rsvpStatus: RsvpStatus }`.
- **`csvRowSchema`** — validates individual parsed CSV rows against guest field rules.

### Types

```typescript
export interface Guest {
  id: string;
  weddingId: string;
  primaryGuestId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  side: GuestSide;
  groupName: string | null;
  dietaryTags: DietaryTag[];
  dietaryNotes: string | null;
  rsvpStatus: RsvpStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuestWithPlusOnes extends Guest {
  plusOnes: Guest[];
}

export interface GuestSummary {
  totalGuests: number;
  totalPrimary: number;
  totalPlusOnes: number;
  byRsvp: Record<RsvpStatus, number>;
  byDietary: Record<DietaryTag, number>;
  bySide: Record<GuestSide, number>;
}
```

---

## API Routes

All routes nested under `/weddings/:weddingId/guests`, protected by session + wedding-access middleware.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/guests` | List all guests. Returns `GuestWithPlusOnes[]` — primaries with plus-ones nested. Query params: `side`, `rsvpStatus`, `groupName` for filtering. |
| `GET` | `/guests/summary` | Returns `GuestSummary`. Powers dashboard widget. |
| `GET` | `/guests/:guestId` | Single guest with plus-ones. |
| `POST` | `/guests` | Create guest. Validates `primaryGuestId` belongs to same wedding if set. |
| `PATCH` | `/guests/:guestId` | Update guest. |
| `DELETE` | `/guests/:guestId` | Delete guest. Primary deletion cascades to plus-ones. |
| `PATCH` | `/guests/bulk-rsvp` | Bulk RSVP update. Validates all IDs belong to wedding. |
| `POST` | `/guests/import-csv` | CSV upload. Multipart, max 5MB, max 500 rows. Returns `{ created: number, errors: { row: number, message: string }[] }`. |

### CSV Import

- **Accepted columns:** `first_name`, `last_name`, `email`, `phone`, `side`, `group_name`, `dietary_tags` (comma-separated within cell), `dietary_notes`
- All imported guests created as primary guests with `rsvp_status: "pending"`
- Formula injection prevention: strip cells starting with `=`, `+`, `-`, `@`, `\t`, `\r`
- Partial success: valid rows created, invalid rows returned as errors with row number and message

---

## Frontend

### Guest List Page (`/guests`)

**Layout:** Top summary bar + content area (same pattern as budget page).

**Components:**

- **`GuestSummaryBar`** — Total headcount, confirmed, pending, declined with colored indicators.

- **`GuestTable`** — Columns: name, email, side, group, RSVP status, dietary tags, plus-one count. Sortable by name, side, group, RSVP status. Filterable by side, RSVP status, group (dropdowns above table). Primary guests have expandable rows revealing indented plus-ones. Checkbox column for bulk selection.

- **`GuestForm`** — Create/edit in Shadcn Sheet (slide-over). Fields: first name, last name, email, phone, side (radio group), group (combobox with existing group suggestions), dietary tags (multi-select checkboxes), dietary notes (textarea), RSVP status (select). Plus-one creation: opened from primary guest's expanded row, `primaryGuestId` auto-set, side pre-filled.

- **`BulkRsvpBar`** — Sticky bottom bar when guests selected. "X guests selected — Mark as: [Invited] [Accepted] [Declined]".

- **`CsvImportDialog`** — Shadcn Dialog. File dropzone (`.csv` only). Preview of first 5 rows. Column mapping confirmation. Results: created count + error table.

### Dashboard Widget

- **`GuestWidget`** — Card matching `BudgetWidget` style. Total headcount, RSVP breakdown (pill counts), 5 most recently added/updated guests with name + RSVP badge. Links to `/guests`.

### TanStack Query Hooks

- `useGuests(weddingId, filters?)` — guest list with optional filters
- `useGuest(weddingId, guestId)` — single guest
- `useGuestSummary(weddingId)` — summary counts
- `useCreateGuest()` — mutation, invalidates guests + summary
- `useUpdateGuest()` — mutation, invalidates guests + summary
- `useDeleteGuest()` — mutation, invalidates guests + summary
- `useBulkUpdateRsvp()` — mutation, invalidates guests + summary
- `useImportGuestsCsv()` — mutation, invalidates guests + summary

---

## Security & Validation

### Input Validation
- All guest fields validated server-side via Zod before DB writes
- `firstName` / `lastName`: 1-100 chars, trimmed
- `email`: valid email format or null
- `phone`: max 50 chars, no format enforcement (international numbers vary)
- `groupName`: max 100 chars
- `dietaryNotes`: max 500 chars
- `dietaryTags`: validated against enum, max 8 tags

### CSV Sanitization
- Strip formula injection characters (`=`, `+`, `-`, `@`, `\t`, `\r`) from cell start positions
- Max file size: 5MB (Hono middleware)
- Max 500 rows per import
- Each row validated against `csvRowSchema`
- Content-type validation: `text/csv` or `application/vnd.ms-excel`
- Rate limiting: max 5 CSV imports per minute per wedding

### Access Control
- All queries scoped to `wedding_id` via `wedding-access` middleware
- Plus-one creation validates `primaryGuestId` belongs to same wedding
- Bulk RSVP validates all guest IDs belong to wedding before updating
- `viewer` role: read-only
- `editor` / `owner` role: full CRUD + CSV import

### XSS Prevention
- React handles HTML entity encoding by default on output
- API responses contain plain text, no executable content

---

## Testing Strategy

95% coverage per file. Patterns from Phase 0 and Phase 1.

### API (`@kaiplan/api`)
- **Route tests** (`guests.test.ts`): CRUD, bulk RSVP, filtering, plus-one lifecycle (create, cascade delete), access control (viewer read-only), validation errors
- **CSV import tests** (`csv-import.test.ts`): valid import, partial failure, formula injection stripping, file size rejection, empty file, malformed CSV, max row limit, column mapping

### Shared (`@kaiplan/shared`)
- **Schema tests** (`guest-schemas.test.ts`): each Zod schema validates correct input, rejects invalid input (bad email, out-of-enum values, string length limits, array bounds)

### App (`@kaiplan/app`)
- **Hook tests** (`use-guests.test.ts`): each hook calls correct endpoint, passes filters, mutations invalidate correct query keys
- **Component tests**: `GuestSummaryBar`, `GuestForm` (create/edit/plus-one modes), `BulkRsvpBar`, `CsvImportDialog` (file selection, preview, errors), `GuestWidget`
- Route files excluded from coverage per CLAUDE.md
