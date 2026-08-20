import { describe, expect, it } from "vitest";
import { submitFeedbackSchema } from "../src/feedback-schemas";

describe("submitFeedbackSchema", () => {
  it("accepts a valid message with no optional fields", () => {
    const result = submitFeedbackSchema.safeParse({ message: "Great app!" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid message with email and pageUrl", () => {
    const result = submitFeedbackSchema.safeParse({
      message: "Great app!",
      email: "user@example.com",
      pageUrl: "https://my.kaiplan.app/dashboard",
    });
    expect(result.success).toBe(true);
  });

  it("trims optional email and pageUrl", () => {
    const result = submitFeedbackSchema.safeParse({
      message: "Great app!",
      email: "  User@Example.COM  ",
      pageUrl: "  https://my.kaiplan.app/dashboard  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("User@Example.COM");
      expect(result.data.pageUrl).toBe("https://my.kaiplan.app/dashboard");
    }
  });

  it("converts an empty string email to undefined", () => {
    const result = submitFeedbackSchema.safeParse({
      message: "Good stuff",
      email: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeUndefined();
    }
  });

  it("converts a whitespace-only email to undefined", () => {
    const result = submitFeedbackSchema.safeParse({
      message: "Good stuff",
      email: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeUndefined();
    }
  });

  it("rejects empty message", () => {
    const result = submitFeedbackSchema.safeParse({ message: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only message", () => {
    const result = submitFeedbackSchema.safeParse({ message: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects message exceeding 5000 chars", () => {
    const result = submitFeedbackSchema.safeParse({
      message: "a".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts message of exactly 5000 chars", () => {
    const result = submitFeedbackSchema.safeParse({
      message: "a".repeat(5000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email format", () => {
    const result = submitFeedbackSchema.safeParse({
      message: "Hello",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts omitted email field", () => {
    const result = submitFeedbackSchema.safeParse({ message: "Hello" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeUndefined();
    }
  });

  it("rejects missing message field", () => {
    const result = submitFeedbackSchema.safeParse({ email: "a@b.com" });
    expect(result.success).toBe(false);
  });
});
