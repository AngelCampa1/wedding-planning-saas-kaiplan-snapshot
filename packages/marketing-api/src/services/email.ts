import { Resend } from "resend";
import { render } from "@react-email/render";
import { marketingEmailCopy } from "@kaiplan/knowledge/marketing";
import { ConfirmationEmail } from "../templates/confirmation";
import { SurveyReminderEmail } from "../templates/survey-reminder";
import { FeedbackNotificationEmail } from "../templates/feedback-notification";
import { LeadMagnetDeliveryEmail } from "../templates/lead-magnet-delivery";
import { unsubscribeUrlFor } from "../templates/_marketing-layout";
import type { LocalOutbox } from "../integration/local-outbox";
import { captureMarketingApiException } from "./sentry";

function formatMarketingTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return values[key] ?? match;
  });
}

function listUnsubscribeHeader(domain: string, token: string) {
  return {
    "List-Unsubscribe": `<${unsubscribeUrlFor(domain, token)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

interface ResendSendOptions {
  idempotencyKey?: string;
}

interface ResendClient {
  emails: {
    send(
      payload: Parameters<InstanceType<typeof Resend>["emails"]["send"]>[0],
      options?: ResendSendOptions,
    ): ReturnType<InstanceType<typeof Resend>["emails"]["send"]>;
  };
}

interface SendConfirmationParams {
  productName: string;
  domain: string;
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  recipientEmail: string;
  emailFrom: string;
  resendApiKey?: string;
  calendarUrl: string;
  signupPosition: number;
  referralCode: string;
  referralUrl: string;
  surveyToken: string;
  deliveryKey?: string;
  e2eMode?: boolean;
  localOutbox?: LocalOutbox;
}

interface SendSurveyReminderParams {
  productName: string;
  domain: string;
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  recipientEmail: string;
  emailFrom: string;
  resendApiKey?: string;
  surveyToken: string;
  deliveryKey?: string;
  e2eMode?: boolean;
  localOutbox?: LocalOutbox;
}

export async function sendConfirmation(
  params: SendConfirmationParams,
): Promise<void> {
  const html = await render(
    ConfirmationEmail({
      productName: params.productName,
      domain: params.domain,
      logoUrl: params.logoUrl,
      brandColor: params.brandColor,
      accentColor: params.accentColor,
      recipientEmail: params.recipientEmail,
      calendarUrl: params.calendarUrl,
      signupPosition: params.signupPosition,
      referralCode: params.referralCode,
      referralUrl: params.referralUrl,
      surveyToken: params.surveyToken,
    }),
  );
  const subject = formatMarketingTemplate(
    marketingEmailCopy.confirmation.subjectTemplate,
    { productName: params.productName },
  );

  if (params.e2eMode) {
    params.localOutbox?.emails.push({
      channel: "email",
      template: "confirmation",
      to: params.recipientEmail,
      from: params.emailFrom,
      subject,
      html,
    });
    return;
  }

  if (!params.resendApiKey) {
    throw new Error("RESEND_API_KEY is required to send email.");
  }

  const resend = new Resend(params.resendApiKey) as unknown as ResendClient;
  const result = await resend.emails.send(
    {
      from: params.emailFrom,
      to: params.recipientEmail,
      subject,
      html,
      headers: listUnsubscribeHeader(params.domain, params.surveyToken),
    },
    params.deliveryKey ? { idempotencyKey: params.deliveryKey } : undefined,
  );

  if (result.error) {
    throw new Error(`Resend API error: ${result.error.message}`);
  }
}

export async function sendSurveyReminder(
  params: SendSurveyReminderParams,
): Promise<boolean> {
  const html = await render(
    SurveyReminderEmail({
      productName: params.productName,
      domain: params.domain,
      logoUrl: params.logoUrl,
      brandColor: params.brandColor,
      accentColor: params.accentColor,
      recipientEmail: params.recipientEmail,
      surveyToken: params.surveyToken,
    }),
  );
  const subject = formatMarketingTemplate(
    marketingEmailCopy.surveyReminder.subjectTemplate,
    { productName: params.productName },
  );
  if (params.e2eMode) {
    params.localOutbox?.emails.push({
      channel: "email",
      template: "survey-reminder",
      to: params.recipientEmail,
      from: params.emailFrom,
      subject,
      html,
    });
    return true;
  }

  if (!params.resendApiKey) {
    throw new Error("RESEND_API_KEY is required to send email.");
  }

  try {
    const resend = new Resend(params.resendApiKey) as unknown as ResendClient;
    const result = await resend.emails.send(
      {
        from: params.emailFrom,
        to: params.recipientEmail,
        subject,
        html,
        headers: listUnsubscribeHeader(params.domain, params.surveyToken),
      },
      params.deliveryKey ? { idempotencyKey: params.deliveryKey } : undefined,
    );

    if (result.error) {
      throw new Error(`Resend API error: ${result.error.message}`);
    }

    return true;
  } catch (error) {
    console.error("Failed to send survey reminder email:", error);
    captureMarketingApiException(error, {
      source: "survey-reminder-email",
    });
    return false;
  }
}

interface SendFeedbackNotificationParams {
  productName: string;
  category: string;
  message: string;
  pageUrl: string;
  email?: string;
  userAgent?: string;
  timestamp: string;
  emailFrom: string;
  resendApiKey?: string;
  deliveryKey?: string;
  e2eMode?: boolean;
  localOutbox?: LocalOutbox;
}

interface SendLeadMagnetDeliveryParams extends SendConfirmationParams {
  leadMagnetTitle: string;
  leadMagnetUrl: string;
  downloadUrl: string;
  leadMagnetSlug: string;
}

export async function sendLeadMagnetDelivery(
  params: SendLeadMagnetDeliveryParams,
): Promise<void> {
  const html = await render(
    LeadMagnetDeliveryEmail({
      productName: params.productName,
      domain: params.domain,
      logoUrl: params.logoUrl,
      brandColor: params.brandColor,
      accentColor: params.accentColor,
      recipientEmail: params.recipientEmail,
      signupPosition: params.signupPosition,
      referralCode: params.referralCode,
      referralUrl: params.referralUrl,
      surveyToken: params.surveyToken,
      leadMagnetTitle: params.leadMagnetTitle,
      leadMagnetUrl: params.leadMagnetUrl,
      downloadUrl: params.downloadUrl,
      leadMagnetSlug: params.leadMagnetSlug,
    }),
  );
  const subject = formatMarketingTemplate(
    marketingEmailCopy.leadMagnetDelivery.subjectTemplate,
    {
      leadMagnetTitle: params.leadMagnetTitle,
      productName: params.productName,
    },
  );

  if (params.e2eMode) {
    params.localOutbox?.emails.push({
      channel: "email",
      template: "lead-magnet-delivery",
      to: params.recipientEmail,
      from: params.emailFrom,
      subject,
      html,
    });
    return;
  }

  if (!params.resendApiKey) {
    throw new Error("RESEND_API_KEY is required to send email.");
  }

  const resend = new Resend(params.resendApiKey) as unknown as ResendClient;
  const result = await resend.emails.send(
    {
      from: params.emailFrom,
      to: params.recipientEmail,
      subject,
      html,
      headers: listUnsubscribeHeader(params.domain, params.surveyToken),
    },
    params.deliveryKey ? { idempotencyKey: params.deliveryKey } : undefined,
  );

  if (result.error) {
    throw new Error(`Resend API error: ${result.error.message}`);
  }
}

export async function sendFeedbackNotification(
  params: SendFeedbackNotificationParams,
): Promise<void> {
  let pathname: string;
  try {
    pathname = new URL(params.pageUrl).pathname;
  } catch {
    pathname = params.pageUrl;
  }

  const html = await render(
    FeedbackNotificationEmail({
      productName: params.productName,
      category: params.category,
      message: params.message,
      pageUrl: params.pageUrl,
      email: params.email,
      userAgent: params.userAgent,
      timestamp: params.timestamp,
    }),
  );
  const subject = `[${params.productName} Feedback] ${params.category} on ${pathname}`;

  if (params.e2eMode) {
    params.localOutbox?.emails.push({
      channel: "email",
      template: "feedback-notification",
      to: params.emailFrom,
      from: params.emailFrom,
      subject,
      html,
    });
    return;
  }

  if (!params.resendApiKey) {
    throw new Error("RESEND_API_KEY is required to send email.");
  }

  const resend = new Resend(params.resendApiKey) as unknown as ResendClient;
  const result = await resend.emails.send(
    {
      from: params.emailFrom,
      to: params.emailFrom,
      subject,
      html,
    },
    params.deliveryKey ? { idempotencyKey: params.deliveryKey } : undefined,
  );

  if (result.error) {
    throw new Error(`Resend API error: ${result.error.message}`);
  }
}
