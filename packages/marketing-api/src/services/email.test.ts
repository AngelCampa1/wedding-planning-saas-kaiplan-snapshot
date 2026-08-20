import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendConfirmation,
  sendSurveyReminder,
  sendFeedbackNotification,
  sendLeadMagnetDelivery,
} from "./email";
import { createLocalOutbox } from "../integration/local-outbox";

const mockResendSend = vi.fn();

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockResendSend };
  },
}));

vi.mock("@react-email/render", () => ({
  render: vi.fn().mockResolvedValue("<html>mock</html>"),
}));

const baseProps = {
  productName: "CrewRoute",
  domain: "crewroute.app",
  logoUrl: "https://crewroute.app/logo.png",
  brandColor: "#0066FF",
  accentColor: "#f59e0b",
  recipientEmail: "user@example.com",
  emailFrom: "angel.campa@kaiplan.app",
  resendApiKey: "re_test_123",
  surveyToken: "test-survey-token-abc123",
};

describe("sendConfirmation", () => {
  beforeEach(() => {
    mockResendSend.mockReset();
  });

  it("sends confirmation email with correct params", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-1" }, error: null });

    await sendConfirmation({
      ...baseProps,
      calendarUrl: "https://cal.com/angel/15min",
      signupPosition: 42,
      referralCode: "abc12345",
      referralUrl: "https://crewroute.app?ref=abc12345",
      deliveryKey: "signup-confirmation:test-survey-token-abc123",
    });

    expect(mockResendSend).toHaveBeenCalledOnce();
    const [callArgs, options] = mockResendSend.mock.calls[0]!;
    expect(callArgs.to).toBe("user@example.com");
    expect(callArgs.from).toBe("angel.campa@kaiplan.app");
    expect(callArgs.subject).toContain("CrewRoute");
    expect(callArgs.headers?.["List-Unsubscribe"]).toBe(
      `<https://crewroute.app/api/unsubscribe?token=${baseProps.surveyToken}>`,
    );
    expect(callArgs.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(options).toEqual({
      idempotencyKey: "signup-confirmation:test-survey-token-abc123",
    });
  });

  it("passes correct subject with product name", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-1" }, error: null });

    await sendConfirmation({
      ...baseProps,
      calendarUrl: "https://cal.com/angel/15min",
      signupPosition: 42,
      referralCode: "abc12345",
      referralUrl: "https://crewroute.app?ref=abc12345",
      deliveryKey: "signup-confirmation:test-survey-token-abc123",
    });

    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.subject).toBe("You're in - CrewRoute signup confirmed");
  });

  it("throws when Resend returns error without throwing", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { statusCode: 422, message: "Invalid email" },
    });

    await expect(
      sendConfirmation({
        ...baseProps,
        calendarUrl: "https://cal.com/angel/15min",
        signupPosition: 1,
        referralCode: "xyz99999",
        referralUrl: "https://crewroute.app?ref=xyz99999",
        deliveryKey: "signup-confirmation:test-survey-token-abc123",
      }),
    ).rejects.toThrow("Resend API error: Invalid email");
  });

  it("rejects when Resend throws — caller uses Promise.allSettled to handle gracefully", async () => {
    // Bug fix: sendConfirmation previously swallowed errors via try/catch,
    // making failures invisible. The caller (signup route) wraps calls in
    // Promise.allSettled, so rejections are handled gracefully without
    // silently hiding email delivery failures.
    mockResendSend.mockRejectedValue(new Error("Resend down"));

    await expect(
      sendConfirmation({
        ...baseProps,
        calendarUrl: "https://cal.com/angel/15min",
        signupPosition: 1,
        referralCode: "xyz99999",
        referralUrl: "https://crewroute.app?ref=xyz99999",
        deliveryKey: "signup-confirmation:test-survey-token-abc123",
      }),
    ).rejects.toThrow("Resend down");
  });

  it("throws when resendApiKey is missing outside e2e mode", async () => {
    const { resendApiKey: _omit, ...rest } = baseProps;
    void _omit;
    await expect(
      sendConfirmation({
        ...rest,
        calendarUrl: "https://cal.com/angel/15min",
        signupPosition: 1,
        referralCode: "xyz99999",
        referralUrl: "https://crewroute.app?ref=xyz99999",
        deliveryKey: "signup-confirmation:test-survey-token-abc123",
      }),
    ).rejects.toThrow("RESEND_API_KEY is required to send email.");
  });

  it("captures the rendered confirmation email in e2e mode", async () => {
    const outbox = createLocalOutbox();

    await sendConfirmation({
      ...baseProps,
      calendarUrl: "https://cal.com/angel/15min",
      signupPosition: 42,
      referralCode: "abc12345",
      referralUrl: "https://crewroute.app?ref=abc12345",
      deliveryKey: "signup-confirmation:test-survey-token-abc123",
      e2eMode: true,
      localOutbox: outbox,
    });

    expect(mockResendSend).not.toHaveBeenCalled();
    expect(outbox.emails).toContainEqual(
      expect.objectContaining({
        template: "confirmation",
        to: "user@example.com",
        from: "angel.campa@kaiplan.app",
        subject: "You're in - CrewRoute signup confirmed",
        html: "<html>mock</html>",
      }),
    );
  });
});

describe("sendSurveyReminder", () => {
  beforeEach(() => {
    mockResendSend.mockReset();
  });

  it("sends survey reminder with List-Unsubscribe header", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-2" }, error: null });

    await sendSurveyReminder(baseProps);

    expect(mockResendSend).toHaveBeenCalledOnce();
    const [callArgs, options] = mockResendSend.mock.calls[0]!;
    expect(callArgs.to).toBe("user@example.com");
    expect(callArgs.headers?.["List-Unsubscribe"]).toBe(
      `<https://crewroute.app/api/unsubscribe?token=${baseProps.surveyToken}>`,
    );
    expect(callArgs.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(options).toBeUndefined();
  });

  it("passes correct subject with product name", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-2" }, error: null });

    await sendSurveyReminder(baseProps);

    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.subject).toBe("Quick question from CrewRoute");
  });

  it("returns true when Resend send succeeds", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-2" }, error: null });

    const result = await sendSurveyReminder({
      ...baseProps,
      deliveryKey: "survey-reminder:1",
    });

    expect(result).toBe(true);
    expect(mockResendSend).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: "survey-reminder:1",
    });
  });

  it("returns false when Resend returns error without throwing", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { statusCode: 422, message: "Invalid email" },
    });

    const result = await sendSurveyReminder({
      ...baseProps,
      deliveryKey: "survey-reminder:1",
    });

    expect(result).toBe(false);
  });

  it("returns false and does not throw when Resend send fails", async () => {
    mockResendSend.mockRejectedValue(new Error("Resend down"));

    const result = await sendSurveyReminder({
      ...baseProps,
      deliveryKey: "survey-reminder:1",
    });

    expect(result).toBe(false);
  });

  it("logs an error when Resend send fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockResendSend.mockRejectedValue(new Error("Resend down"));

    await sendSurveyReminder({
      ...baseProps,
      deliveryKey: "survey-reminder:1",
    });

    expect(consoleSpy).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it("throws when resendApiKey is missing outside e2e mode", async () => {
    const { resendApiKey: _omit, ...rest } = baseProps;
    void _omit;
    await expect(
      sendSurveyReminder({ ...rest, deliveryKey: "survey-reminder:1" }),
    ).rejects.toThrow("RESEND_API_KEY is required to send email.");
  });

  it("captures the reminder email in e2e mode", async () => {
    const outbox = createLocalOutbox();

    await expect(
      sendSurveyReminder({
        ...baseProps,
        deliveryKey: "survey-reminder:1",
        e2eMode: true,
        localOutbox: outbox,
      }),
    ).resolves.toBe(true);

    expect(outbox.emails).toContainEqual(
      expect.objectContaining({
        template: "survey-reminder",
        subject: "Quick question from CrewRoute",
      }),
    );
  });
});

const feedbackProps = {
  productName: "CrewRoute",
  category: "bug",
  message: "Pricing page broken on mobile",
  pageUrl: "https://crewroute.app/pricing",
  emailFrom: "angel.campa@kaiplan.app",
  resendApiKey: "re_test_123",
  timestamp: "2026-03-30T12:00:00Z",
};

describe("sendFeedbackNotification", () => {
  beforeEach(() => {
    mockResendSend.mockReset();
  });

  it("sends notification email to emailFrom (site owner)", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-3" }, error: null });

    await sendFeedbackNotification(feedbackProps);

    expect(mockResendSend).toHaveBeenCalledOnce();
    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.from).toBe("angel.campa@kaiplan.app");
    expect(callArgs.to).toBe("angel.campa@kaiplan.app");
  });

  it("includes category and pathname in subject", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-3" }, error: null });

    await sendFeedbackNotification(feedbackProps);

    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.subject).toBe("[CrewRoute Feedback] bug on /pricing");
  });

  it("includes HTML body from template render", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-3" }, error: null });

    await sendFeedbackNotification(feedbackProps);

    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.html).toBe("<html>mock</html>");
  });

  it("throws when Resend returns error", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { statusCode: 422, message: "Rate limited" },
    });

    await expect(sendFeedbackNotification(feedbackProps)).rejects.toThrow(
      "Resend API error: Rate limited",
    );
  });

  it("throws when Resend send rejects", async () => {
    mockResendSend.mockRejectedValue(new Error("Network error"));

    await expect(sendFeedbackNotification(feedbackProps)).rejects.toThrow(
      "Network error",
    );
  });

  it("passes optional email and userAgent to template", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-3" }, error: null });

    await sendFeedbackNotification({
      ...feedbackProps,
      email: "visitor@test.com",
      userAgent: "Mozilla/5.0",
    });

    expect(mockResendSend).toHaveBeenCalledOnce();
  });

  it("falls back to raw pageUrl when URL parsing fails", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-3" }, error: null });

    await sendFeedbackNotification({
      ...feedbackProps,
      pageUrl: "not-a-valid-url",
    });

    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.subject).toBe(
      "[CrewRoute Feedback] bug on not-a-valid-url",
    );
  });

  it("throws when resendApiKey is missing outside e2e mode", async () => {
    const { resendApiKey: _omit, ...rest } = feedbackProps;
    void _omit;
    await expect(sendFeedbackNotification(rest)).rejects.toThrow(
      "RESEND_API_KEY is required to send email.",
    );
  });

  it("captures feedback notifications in e2e mode", async () => {
    const outbox = createLocalOutbox();

    await sendFeedbackNotification({
      ...feedbackProps,
      e2eMode: true,
      localOutbox: outbox,
    });

    expect(outbox.emails).toContainEqual(
      expect.objectContaining({
        template: "feedback-notification",
        to: "angel.campa@kaiplan.app",
        subject: "[CrewRoute Feedback] bug on /pricing",
      }),
    );
  });
});

const leadMagnetProps = {
  ...baseProps,
  calendarUrl: "https://cal.com/angel/15min",
  signupPosition: 7,
  referralCode: "ref12345",
  referralUrl: "https://crewroute.app?ref=ref12345",
  leadMagnetTitle: "HOA Reserve Fund Compliance Guide",
  leadMagnetUrl: "https://crewroute.app/guides/reserve-fund.pdf",
  downloadUrl:
    "https://crewroute.app/api/lead-magnets/download?token=" + "b".repeat(64),
  leadMagnetSlug: "reserve-fund",
};

describe("sendLeadMagnetDelivery", () => {
  beforeEach(() => {
    mockResendSend.mockReset();
  });

  it("sends email with correct subject containing leadMagnetTitle and productName", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-4" }, error: null });

    await sendLeadMagnetDelivery(leadMagnetProps);

    expect(mockResendSend).toHaveBeenCalledOnce();
    const callArgs = mockResendSend.mock.calls[0]![0];
    expect(callArgs.subject).toBe(
      "Your HOA Reserve Fund Compliance Guide is ready - CrewRoute",
    );
  });

  it("sends to recipientEmail and from emailFrom", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-4" }, error: null });

    await sendLeadMagnetDelivery(leadMagnetProps);

    const [callArgs, options] = mockResendSend.mock.calls[0]!;
    expect(callArgs.to).toBe("user@example.com");
    expect(callArgs.from).toBe("angel.campa@kaiplan.app");
    expect(callArgs.headers?.["List-Unsubscribe"]).toBe(
      `<https://crewroute.app/api/unsubscribe?token=${baseProps.surveyToken}>`,
    );
    expect(callArgs.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(options).toBeUndefined();
  });

  it("passes leadMagnetTitle and leadMagnetUrl to the template via render", async () => {
    const templateModule = await import("../templates/lead-magnet-delivery");
    const templateSpy = vi
      .spyOn(templateModule, "LeadMagnetDeliveryEmail")
      .mockReturnValue(
        null as unknown as ReturnType<
          typeof templateModule.LeadMagnetDeliveryEmail
        >,
      );
    mockResendSend.mockResolvedValue({ data: { id: "email-4" }, error: null });

    await sendLeadMagnetDelivery({
      ...leadMagnetProps,
      deliveryKey: "signup-lead-magnet:test-survey-token-abc123",
    });

    expect(templateSpy).toHaveBeenCalledOnce();
    const callArg = templateSpy.mock.calls[0]![0];
    expect(callArg.leadMagnetTitle).toBe("HOA Reserve Fund Compliance Guide");
    expect(callArg.leadMagnetUrl).toBe(
      "https://crewroute.app/guides/reserve-fund.pdf",
    );
    expect(callArg.downloadUrl).toBe(leadMagnetProps.downloadUrl);
    expect(callArg.leadMagnetSlug).toBe("reserve-fund");
    templateSpy.mockRestore();
  });

  it("includes rendered HTML in the email body", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "email-4" }, error: null });

    await sendLeadMagnetDelivery({
      ...leadMagnetProps,
      deliveryKey: "signup-lead-magnet:test-survey-token-abc123",
    });

    const [callArgs, options] = mockResendSend.mock.calls[0]!;
    expect(callArgs.html).toBe("<html>mock</html>");
    expect(options).toEqual({
      idempotencyKey: "signup-lead-magnet:test-survey-token-abc123",
    });
  });

  it("throws when Resend returns an error object", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { statusCode: 422, message: "Invalid API key" },
    });

    await expect(
      sendLeadMagnetDelivery({
        ...leadMagnetProps,
        deliveryKey: "signup-lead-magnet:test-survey-token-abc123",
      }),
    ).rejects.toThrow("Resend API error: Invalid API key");
  });

  it("throws when Resend send rejects outright", async () => {
    mockResendSend.mockRejectedValue(new Error("Network timeout"));

    await expect(
      sendLeadMagnetDelivery({
        ...leadMagnetProps,
        deliveryKey: "signup-lead-magnet:test-survey-token-abc123",
      }),
    ).rejects.toThrow("Network timeout");
  });

  it("throws when resendApiKey is missing outside e2e mode", async () => {
    const { resendApiKey: _omit, ...rest } = leadMagnetProps;
    void _omit;
    await expect(
      sendLeadMagnetDelivery({
        ...rest,
        deliveryKey: "signup-lead-magnet:test-survey-token-abc123",
      }),
    ).rejects.toThrow("RESEND_API_KEY is required to send email.");
  });

  it("captures lead magnet delivery emails in e2e mode", async () => {
    const outbox = createLocalOutbox();

    await sendLeadMagnetDelivery({
      ...leadMagnetProps,
      deliveryKey: "signup-lead-magnet:test-survey-token-abc123",
      e2eMode: true,
      localOutbox: outbox,
    });

    expect(outbox.emails).toContainEqual(
      expect.objectContaining({
        template: "lead-magnet-delivery",
        subject: "Your HOA Reserve Fund Compliance Guide is ready - CrewRoute",
      }),
    );
  });
});
