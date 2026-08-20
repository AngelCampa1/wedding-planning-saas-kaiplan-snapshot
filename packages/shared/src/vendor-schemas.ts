import { z } from "zod";
import {
  CONTRACT_STATUSES,
  VENDOR_QUOTE_STATUSES,
  VENDOR_PAYMENT_TYPES,
} from "./constants";
import { httpsUrlField } from "./url";

const centsField = z.number().int().min(0).max(999_999_999);
const nameField = z.string().trim().min(1).max(200);
const uuidField = z.string().uuid();
const nullableEmailField = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().email().max(254).nullable().default(null),
);
const nullableTextField = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(max).nullable().default(null),
  );
const nullableHttpsUrlField = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  httpsUrlField.nullable().default(null),
);
const dateField = z
  .string()
  .date()
  .refine((d) => d >= "2000-01-01" && d <= "2100-12-31", {
    message: "Date out of reasonable range",
  });
const nullableDateField = dateField.nullable().default(null);
const nullableStringField = nullableTextField(500);
const nullablePhoneField = nullableTextField(50);

function requireAtLeastOneField<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
) {
  return schema.partial().refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field must be provided",
  });
}

export const createVendorSchema = z.object({
  primaryContactName: nameField,
  companyName: nameField,
  email: nullableEmailField,
  phone: nullablePhoneField,
  categoryId: uuidField,
  contractStatus: z.enum(CONTRACT_STATUSES).default("none"),
  contractUrl: nullableHttpsUrlField,
  contractSentAt: nullableDateField,
  contractSignedAt: nullableDateField,
  notes: nullableStringField,
});

export const updateVendorSchema = requireAtLeastOneField(createVendorSchema);

export const createVendorQuoteSchema = z.object({
  amountCents: centsField,
  quotedAt: dateField,
  status: z.enum(VENDOR_QUOTE_STATUSES).default("pending"),
  budgetItemId: uuidField.nullable().default(null),
  notes: nullableStringField,
});

export const updateVendorQuoteSchema = requireAtLeastOneField(
  createVendorQuoteSchema,
);

export const createVendorPaymentSchema = z.object({
  paymentType: z.enum(VENDOR_PAYMENT_TYPES),
  amountCents: centsField,
  paidAt: dateField,
  notes: nullableStringField,
});

export const updateVendorPaymentSchema = requireAtLeastOneField(
  createVendorPaymentSchema,
);

export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type CreateVendorQuoteInput = z.infer<typeof createVendorQuoteSchema>;
export type UpdateVendorQuoteInput = z.infer<typeof updateVendorQuoteSchema>;
export type CreateVendorPaymentInput = z.infer<
  typeof createVendorPaymentSchema
>;
export type UpdateVendorPaymentInput = z.infer<
  typeof updateVendorPaymentSchema
>;
