import { Heading, Text, Link, Section } from "@react-email/components";
import * as React from "react";
import { marketingEmailCopy } from "@kaiplan/knowledge/marketing";
import {
  MarketingLayout,
  SecondaryLink,
  AccentDivider,
  unsubscribeUrlFor,
} from "./_marketing-layout";

function formatTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return values[key] ?? match;
  });
}

export interface LeadMagnetDeliveryEmailProps {
  productName: string;
  domain: string;
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  recipientEmail: string;
  signupPosition: number;
  referralCode: string;
  referralUrl: string;
  surveyToken: string;
  leadMagnetTitle: string;
  leadMagnetUrl: string;
  downloadUrl: string;
  leadMagnetSlug: string;
}

export function LeadMagnetDeliveryEmail({
  productName,
  domain,
  logoUrl,
  brandColor,
  accentColor,
  signupPosition,
  referralCode,
  referralUrl,
  surveyToken,
  leadMagnetTitle,
  leadMagnetUrl,
  downloadUrl,
  leadMagnetSlug,
}: LeadMagnetDeliveryEmailProps): React.JSX.Element {
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
        {formatTemplate(
          marketingEmailCopy.leadMagnetDelivery.headlineTemplate,
          { leadMagnetTitle },
        )}
      </Heading>

      <Text style={{ fontSize: "16px", color: "#4a4a4a", lineHeight: "1.5" }}>
        {marketingEmailCopy.leadMagnetDelivery.positionPrefix}{" "}
        <span style={{ color: accentColor, fontWeight: "bold" }}>
          #{signupPosition}
        </span>
        {`. ${marketingEmailCopy.leadMagnetDelivery.positionSuffix}`}
      </Text>

      <AccentDivider color={accentColor} />

      <Section
        data-slug={leadMagnetSlug}
        style={{ textAlign: "center" as const, margin: "16px 0" }}
      >
        <Link
          href={downloadUrl}
          style={{
            backgroundColor: brandColor,
            color: "#ffffff",
            padding: "14px 28px",
            borderRadius: "8px",
            border: `2px solid ${brandColor}`,
            fontWeight: "600",
            fontSize: "16px",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          {marketingEmailCopy.leadMagnetDelivery.primaryCtaLabel}
        </Link>
      </Section>

      <SecondaryLink
        href={leadMagnetUrl}
        label={marketingEmailCopy.leadMagnetDelivery.secondaryCtaLabel}
        brandColor={brandColor}
      />

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
        {marketingEmailCopy.leadMagnetDelivery.referralHeading}
      </Heading>

      <Text style={{ fontSize: "14px", color: "#4a4a4a", lineHeight: "1.5" }}>
        {marketingEmailCopy.leadMagnetDelivery.referralPrompt}
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
          {marketingEmailCopy.leadMagnetDelivery.referralCodeLabel}{" "}
          <strong>{referralCode}</strong>
        </Text>
      </Section>
    </MarketingLayout>
  );
}
