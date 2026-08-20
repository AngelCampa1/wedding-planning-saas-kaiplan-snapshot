import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { marketingEmailCopy } from "@kaiplan/knowledge/marketing";
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

export interface SurveyReminderEmailProps {
  productName: string;
  domain: string;
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  recipientEmail: string;
  surveyToken: string;
}

export function SurveyReminderEmail({
  productName,
  domain,
  logoUrl,
  brandColor,
  accentColor,
  surveyToken,
}: SurveyReminderEmailProps): React.JSX.Element {
  const surveyUrl = `https://${domain}/?survey=open&t=${surveyToken}`;
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
        {marketingEmailCopy.surveyReminder.headline}
      </Heading>

      <Text style={{ fontSize: "16px", color: "#4a4a4a", lineHeight: "1.6" }}>
        {formatTemplate(marketingEmailCopy.surveyReminder.bodyTemplate, {
          productName,
        })}
      </Text>

      <AccentDivider color={accentColor} />

      <PrimaryButton
        href={surveyUrl}
        label={marketingEmailCopy.surveyReminder.primaryCtaLabel}
        brandColor={brandColor}
      />

      <Text
        style={{
          fontSize: "13px",
          color: "#767676",
          lineHeight: "1.4",
          textAlign: "center" as const,
        }}
      >
        {formatTemplate(marketingEmailCopy.surveyReminder.permissionTemplate, {
          productName,
        })}
      </Text>
    </MarketingLayout>
  );
}
