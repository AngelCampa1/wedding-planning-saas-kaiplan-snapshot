import { describe, expect, it } from "vitest";
import {
  emailPreferenceTypeSchema,
  emailPreferencesSchema,
  updateEmailPreferencesSchema,
  sendRsvpReminderSchema,
  reminderDeliveryResultSchema,
} from "../src/email-schemas";

describe("emailPreferenceTypeSchema", () => {
  it("accepts supported preference types", () => {
    expect(emailPreferenceTypeSchema.safeParse("appLifecycle").success).toBe(
      true,
    );
    expect(emailPreferenceTypeSchema.safeParse("memberInvite").success).toBe(
      true,
    );
    expect(
      emailPreferenceTypeSchema.safeParse("rsvpConfirmation").success,
    ).toBe(true);
    expect(emailPreferenceTypeSchema.safeParse("rsvpReminder").success).toBe(
      true,
    );
  });

  it("rejects unsupported preference types", () => {
    expect(emailPreferenceTypeSchema.safeParse("passwordReset").success).toBe(
      false,
    );
  });
});

describe("emailPreferencesSchema", () => {
  it("accepts boolean preferences for every optional email type", () => {
    const result = emailPreferencesSchema.safeParse({
      appLifecycle: true,
      memberInvite: true,
      rsvpConfirmation: false,
      rsvpReminder: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing preference keys", () => {
    const result = emailPreferencesSchema.safeParse({
      appLifecycle: true,
      memberInvite: true,
      rsvpReminder: false,
    });

    expect(result.success).toBe(false);
  });
});

describe("updateEmailPreferencesSchema", () => {
  it("accepts a full authenticated preference update payload", () => {
    const result = updateEmailPreferencesSchema.safeParse({
      preferences: {
        appLifecycle: true,
        memberInvite: false,
        rsvpConfirmation: true,
        rsvpReminder: false,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-boolean preference values", () => {
    const result = updateEmailPreferencesSchema.safeParse({
      preferences: {
        appLifecycle: true,
        memberInvite: "nope",
        rsvpConfirmation: true,
        rsvpReminder: false,
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("sendRsvpReminderSchema", () => {
  it("accepts one or more primary guest ids", () => {
    const result = sendRsvpReminderSchema.safeParse({
      primaryGuestIds: [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440001",
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty reminder selection", () => {
    const result = sendRsvpReminderSchema.safeParse({
      primaryGuestIds: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate primary guest ids", () => {
    const result = sendRsvpReminderSchema.safeParse({
      primaryGuestIds: [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440000",
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("reminderDeliveryResultSchema", () => {
  it("includes skippedNoWebsite in reminderDeliveryResultSchema status", () => {
    const result = reminderDeliveryResultSchema.parse({
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      guestEmail: "test@example.com",
      status: "skippedNoWebsite",
      emailId: null,
      error: null,
    });
    expect(result.status).toBe("skippedNoWebsite");
  });
});
