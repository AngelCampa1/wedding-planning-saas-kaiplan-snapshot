import { z } from "zod";
import {
  INVITABLE_WEDDING_ROLES,
  type InvitableWeddingRole,
} from "./constants";

// ISO 4217 currency codes are exactly three uppercase ASCII letters. We don't
// enumerate the ~180 valid codes (the list changes over time); the regex keeps
// the schema narrow without coupling to a frozen list.
const currencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "ISO 4217 currency code");

// IANA timezone identifiers look like `Area/Location`, optionally with extra
// path segments (e.g. `America/Argentina/Buenos_Aires`) or offset suffixes
// (e.g. `Etc/GMT+1`). We validate with Intl.DateTimeFormat which is the
// authoritative source — regexes would either reject valid zones or accept
// obvious garbage.
const timezoneSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: "IANA timezone identifier" },
  );

const weddingNameSchema = z.string().trim().min(1).max(200);

export const createWeddingSchema = z.object({
  name: weddingNameSchema,
  date: z.string().date().nullable(),
  // NULL means "no budget configured"; 0 means "explicitly set to zero".
  budgetCents: z.number().int().min(0).nullable().default(null),
  currency: currencySchema.default("USD"),
  timezone: timezoneSchema.default("America/New_York"),
});

export const updateWeddingSchema = createWeddingSchema.partial();

// Invites grant `editor` or `viewer` only; ownership can never be transferred
// through the invite flow. Wired through INVITABLE_WEDDING_ROLES so the schema
// stays in sync with the canonical role list. The unknown cast narrows
// `filter`'s loose array return into the non-empty tuple z.enum requires
// without hard-coding the roles here.
const invitableRolesTuple = INVITABLE_WEDDING_ROLES as unknown as readonly [
  InvitableWeddingRole,
  ...InvitableWeddingRole[],
];

export const inviteMemberSchema = z.object({
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().email().max(254),
  ),
  role: z.enum(invitableRolesTuple),
});

export type CreateWeddingInput = z.infer<typeof createWeddingSchema>;
export type UpdateWeddingInput = z.infer<typeof updateWeddingSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export * from "./billing-schemas";
export * from "./budget-schemas";
export * from "./guest-schemas";
export * from "./website-schemas";
export * from "./seating-schemas";
export * from "./vendor-schemas";
export * from "./checklist-schemas";
