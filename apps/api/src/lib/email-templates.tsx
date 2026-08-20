import * as React from "react";
import { BILLING_PLAN_LABELS, TRIAL_DURATION_DAYS } from "@kaiplan/shared";

const BRAND = {
  bg: "#f5f1ea",
  card: "#fffdfa",
  cardBorder: "#e8e3d9",
  headingFont: 'Georgia, "Times New Roman", serif',
  bodyFont: "Arial, Helvetica, sans-serif",
  primary: "#b0432a",
  accent: "#3a4a2c",
  muted: "#3d3530",
  text: "#171311",
} as const;

export const STATUS_LABELS: Record<string, string> = {
  accepted: "Joyfully attending",
  declined: "Can't make it",
  pending: "Still deciding",
  invited: "Still deciding",
};

export function rsvpLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function CtaButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        marginTop: "24px",
        padding: "12px 24px",
        backgroundColor: BRAND.primary,
        color: "#f5f1ea",
        borderRadius: "8px",
        fontFamily: BRAND.bodyFont,
        fontSize: "15px",
        fontWeight: "600",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}

function Layout({
  title,
  children,
  unsubscribeUrl,
}: React.PropsWithChildren<{
  title: string;
  unsubscribeUrl?: string | null;
}>) {
  return (
    <html>
      <body
        style={{
          fontFamily: BRAND.bodyFont,
          backgroundColor: BRAND.bg,
          color: BRAND.text,
          margin: 0,
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            backgroundColor: BRAND.card,
            borderRadius: "16px",
            padding: "32px",
            border: `1px solid ${BRAND.cardBorder}`,
          }}
        >
          <div
            aria-label="Kaiplan wedding planning"
            style={{
              marginBottom: "24px",
              color: BRAND.text,
              fontFamily: BRAND.headingFont,
              fontSize: "24px",
              lineHeight: "1",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: "28px",
                height: "28px",
                border: `1px solid ${BRAND.primary}`,
                borderRadius: "8px",
                color: BRAND.text,
                fontSize: "21px",
                lineHeight: "27px",
                textAlign: "center",
                verticalAlign: "middle",
              }}
            >
              K
            </span>
            <span
              style={{
                display: "inline-block",
                marginLeft: "10px",
                fontStyle: "italic",
                verticalAlign: "middle",
              }}
            >
              Kaiplan
            </span>
          </div>
          <h1
            style={{
              marginTop: 0,
              fontSize: "28px",
              fontFamily: BRAND.headingFont,
              color: BRAND.text,
            }}
          >
            {title}
          </h1>
          <div
            style={{ fontSize: "16px", lineHeight: "1.6", color: BRAND.text }}
          >
            {children}
          </div>
          {unsubscribeUrl ? (
            <p
              style={{
                marginTop: "32px",
                fontSize: "12px",
                color: BRAND.muted,
              }}
            >
              Prefer fewer emails?{" "}
              <a href={unsubscribeUrl} style={{ color: BRAND.muted }}>
                Manage your email preferences
              </a>
              .
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}

function formatWeddingDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const parts = isoDate.split("-").map(Number);
  const date = new Date(
    parts[0] as number,
    (parts[1] as number) - 1,
    parts[2] as number,
  );
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function RsvpConfirmationEmail(props: {
  guestFirstName: string;
  weddingName: string;
  weddingDate: string | null;
  householdSummary: { name: string; status: string }[];
  rsvpUrl: string | null;
  manageUrl: string;
}) {
  const formattedDate = formatWeddingDate(props.weddingDate);
  return (
    <Layout title="Your RSVP is in!" unsubscribeUrl={props.manageUrl}>
      <p>Hi {props.guestFirstName},</p>
      <p>
        We&apos;ve received your RSVP for {props.weddingName}. Here&apos;s a
        summary of your household:
      </p>
      <table
        style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}
      >
        <tbody>
          {props.householdSummary.map((member) => (
            <tr key={member.name}>
              <td style={{ padding: "6px 0", fontWeight: "600" }}>
                {member.name}
              </td>
              <td
                style={{
                  padding: "6px 0",
                  color: BRAND.muted,
                  textAlign: "right",
                }}
              >
                {member.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.rsvpUrl ? (
        <CtaButton href={props.rsvpUrl}>Review or update your RSVP</CtaButton>
      ) : null}
      <p style={{ marginTop: "32px", fontSize: "14px", color: BRAND.muted }}>
        {props.weddingName}
        {formattedDate ? ` · ${formattedDate}` : ""}
      </p>
    </Layout>
  );
}

export function RsvpReminderEmail(props: {
  guestFirstName: string;
  weddingName: string;
  weddingDate: string | null;
  rsvpUrl: string;
  manageUrl: string;
}) {
  const formattedDate = formatWeddingDate(props.weddingDate);
  return (
    <Layout title="A quick RSVP reminder" unsubscribeUrl={props.manageUrl}>
      <p>Hi {props.guestFirstName},</p>
      <p>
        The couple is still waiting on your household&apos;s RSVP for{" "}
        {props.weddingName}. It only takes a moment!
      </p>
      <CtaButton href={props.rsvpUrl}>Respond now</CtaButton>
      <p style={{ marginTop: "32px", fontSize: "14px", color: BRAND.muted }}>
        {props.weddingName}
        {formattedDate ? ` · ${formattedDate}` : ""}
      </p>
    </Layout>
  );
}

export function MemberInviteEmail(props: {
  invitedByName: string;
  weddingName: string;
  role: string;
  inviteUrl: string;
}) {
  return (
    <Layout title="You've been invited">
      <p>
        {props.invitedByName} invited you to collaborate on {props.weddingName}{" "}
        as a {props.role}.
      </p>
      <CtaButton href={props.inviteUrl}>Open your invitation</CtaButton>
    </Layout>
  );
}

export function PasswordResetEmail(props: { resetUrl: string }) {
  return (
    <Layout title="Reset your Kaiplan password">
      <p>
        Use the link below to choose a new password. This link expires in 1
        hour.
      </p>
      <CtaButton href={props.resetUrl}>Reset password</CtaButton>
    </Layout>
  );
}

export function EmailVerificationEmail(props: { verificationUrl: string }) {
  return (
    <Layout title="Verify your Kaiplan email">
      <p>
        Confirm this email address to finish setting up your Kaiplan account.
        This link expires in 1 hour.
      </p>
      <CtaButton href={props.verificationUrl}>Verify email</CtaButton>
    </Layout>
  );
}

export function SubscribeNudgeEmail(props: {
  name: string;
  subjectFocus: string;
  body: string;
  ctaLabel: string;
  subscribeUrl: string;
  manageEmailPrefsUrl: string;
}) {
  return (
    <Layout
      title={`Keep your ${props.subjectFocus} moving`}
      unsubscribeUrl={props.manageEmailPrefsUrl}
    >
      <p>Hi {props.name},</p>
      <p>{props.body}</p>
      <p>
        {BILLING_PLAN_LABELS.starter} and {BILLING_PLAN_LABELS.pro} both include
        a {TRIAL_DURATION_DAYS}-day trial, so you can see whether Kaiplan fits
        your planning rhythm before the first charge.
      </p>
      <CtaButton href={props.subscribeUrl}>{props.ctaLabel}</CtaButton>
    </Layout>
  );
}

export function TrialActivationNudgeEmail(props: {
  name: string;
  featureFocus: string;
  body: string;
  ctaLabel: string;
  dashboardUrl: string;
  manageEmailPrefsUrl: string;
}) {
  return (
    <Layout
      title={`Make the most of ${props.featureFocus}`}
      unsubscribeUrl={props.manageEmailPrefsUrl}
    >
      <p>Hi {props.name},</p>
      <p>{props.body}</p>
      <p>
        Your trial is the best time to put the messy pieces in one place and
        decide what should stay in Kaiplan.
      </p>
      <CtaButton href={props.dashboardUrl}>{props.ctaLabel}</CtaButton>
    </Layout>
  );
}

export function TrialEndingReminderEmail(props: {
  name: string;
  planName: string;
  trialStartedOn: string;
  chargeOn: string;
  amountLabel: string;
  manageBillingUrl: string;
  /**
   * URL where the recipient can manage their email preferences. Rendered in
   * the footer via the shared Layout's "Manage your email preferences" link
   * — same pattern the RSVP emails use. Optional so unit tests that
   * pre-date this addition continue to compile, but the production caller
   * (`sendTrialEndingReminder`) always passes a value.
   */
  manageEmailPrefsUrl?: string;
}) {
  return (
    <Layout
      title="Your Kaiplan trial ends soon"
      unsubscribeUrl={props.manageEmailPrefsUrl ?? null}
    >
      <p>Hi {props.name},</p>
      <p>
        Your {props.planName} trial started on {props.trialStartedOn}. Unless
        you cancel first, we&apos;ll automatically charge {props.amountLabel} on{" "}
        {props.chargeOn}.
      </p>
      <p>
        If you don&apos;t want to continue, cancel before {props.chargeOn} to
        avoid the charge.
      </p>
      <CtaButton href={props.manageBillingUrl}>Manage billing</CtaButton>
    </Layout>
  );
}
