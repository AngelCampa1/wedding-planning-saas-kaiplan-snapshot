import { Heading, Text, Link, Section } from "@react-email/components";
import * as React from "react";
import {
  marketingCtas,
  marketingEmailCopy,
} from "@kaiplan/knowledge/marketing";
import {
  MarketingLayout,
  PrimaryButton,
  AccentDivider,
  unsubscribeUrlFor,
} from "./_marketing-layout";

function formatTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return values[key] ?? match;
  });
}

export interface ConfirmationEmailProps {
  productName: string;
  domain: string;
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  recipientEmail: string;
  calendarUrl: string;
  signupPosition: number;
  referralCode: string;
  referralUrl: string;
  surveyToken: string;
}

export function ConfirmationEmail({
  productName,
  domain,
  logoUrl,
  brandColor,
  accentColor,
  calendarUrl,
  signupPosition,
  referralCode,
  referralUrl,
  surveyToken,
}: ConfirmationEmailProps): React.JSX.Element {
  const surveyUrl = `https://${domain}/?survey=open&t=${surveyToken}`;
  const trialUrl = `https://${domain}${marketingCtas.publicSignup.target}`;
  const unsubscribeUrl = unsubscribeUrlFor(domain, surveyToken);

  return (
    <MarketingLayout
      productName={productName}
      domain={domain}
      logoUrl={logoUrl}
      brandColor={brandColor}
      accentColor={accentColor}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading
        style={{
          fontSize: "24px",
          color: "#1a1a1a",
          fontWeight: 700,
          marginBottom: "16px",
        }}
      >
        {formatTemplate(marketingEmailCopy.confirmation.headlineTemplate, {
          productName,
        })}
      </Heading>

      <Text style={{ fontSize: "16px", color: "#4a4a4a", lineHeight: "1.5" }}>
        {marketingEmailCopy.confirmation.positionPrefix}{" "}
        <span style={{ color: accentColor, fontWeight: "bold" }}>
          #{signupPosition}
        </span>
        {`. ${marketingEmailCopy.confirmation.positionSuffix}`}
      </Text>

      <AccentDivider color={accentColor} />

      <Text style={{ fontSize: "16px", color: "#4a4a4a", lineHeight: "1.5" }}>
        {marketingEmailCopy.confirmation.surveyPrompt}
      </Text>

      <PrimaryButton
        href={surveyUrl}
        label={marketingEmailCopy.confirmation.primaryCtaLabel}
        brandColor={brandColor}
      />

      <Section style={{ textAlign: "center" as const, margin: "8px 0" }}>
        <Link
          href={trialUrl}
          style={{
            color: brandColor,
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "underline",
          }}
        >
          {formatTemplate(marketingEmailCopy.confirmation.productLinkTemplate, {
            productName,
          })}
        </Link>
      </Section>

      <AccentDivider color={accentColor} />

      <Heading
        as="h2"
        style={{
          fontSize: "16px",
          fontWeight: "bold",
          color: "#1a1a1a",
          marginBottom: "8px",
        }}
      >
        {marketingEmailCopy.confirmation.referralHeading}
      </Heading>

      <Text style={{ fontSize: "14px", color: "#4a4a4a", lineHeight: "1.5" }}>
        {marketingEmailCopy.confirmation.referralPrompt}
      </Text>

      <Section
        style={{
          backgroundColor: "#f8f8f8",
          borderLeft: `4px solid ${accentColor}`,
          padding: "16px",
          margin: "16px 0",
          borderRadius: "4px",
        }}
      >
        <Link
          href={referralUrl}
          style={{
            color: accentColor,
            fontWeight: "bold",
            fontSize: "14px",
            wordBreak: "break-all" as const,
          }}
        >
          {referralUrl}
        </Link>
        <Text
          style={{
            fontSize: "12px",
            color: "#6a6a6a",
            margin: "8px 0 0 0",
          }}
        >
          {marketingEmailCopy.confirmation.referralCodeLabel}{" "}
          <strong>{referralCode}</strong>
        </Text>
      </Section>

      <Text style={{ fontSize: "14px", color: "#6a6a6a", lineHeight: "1.5" }}>
        {marketingEmailCopy.confirmation.calendarPrompt}
      </Text>

      <Section style={{ textAlign: "center" as const, margin: "12px 0" }}>
        <Link
          href={calendarUrl}
          style={{
            color: accentColor,
            fontWeight: "bold",
            fontSize: "14px",
          }}
        >
          {marketingEmailCopy.confirmation.calendarCtaLabel}
        </Link>
      </Section>
    </MarketingLayout>
  );
}
