import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Link,
  Img,
  Section,
} from "@react-email/components";
import * as React from "react";
import { unsubscribeCopy } from "@kaiplan/knowledge/marketing";

/**
 * Build the canonical unsubscribe URL used by local transactional emails.
 */
export function unsubscribeUrlFor(domain: string, token: string): string {
  return `https://${domain}/api/unsubscribe?token=${token}`;
}

export interface MarketingLayoutProps {
  productName: string;
  domain: string;
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  unsubscribeUrl: string;
  children: React.ReactNode;
}

const FOOTER_MUTED_COLOR = "#999999";
const FOOTER_TEXT_SIZE = "12px";

export function MarketingLayout({
  productName,
  domain,
  logoUrl,
  brandColor,
  accentColor,
  unsubscribeUrl,
  children,
}: MarketingLayoutProps): React.JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "sans-serif" }}>
        <Container
          style={{ maxWidth: "560px", margin: "0 auto", padding: "20px 0" }}
        >
          {/* Accent brow bar */}
          <Section
            style={{
              backgroundColor: accentColor,
              height: "4px",
              padding: "0",
            }}
          />

          {/* Brand header */}
          <Section
            style={{
              backgroundColor: brandColor,
              padding: "28px 24px",
              borderRadius: "8px 8px 0 0",
              textAlign: "center" as const,
            }}
          >
            <Img
              src={logoUrl}
              alt={productName}
              height="48"
              style={{ margin: "0 auto" }}
            />
          </Section>

          {/* Body card */}
          <Section
            style={{
              backgroundColor: "#ffffff",
              padding: "40px 32px",
              borderRadius: "0 0 0 0",
            }}
          >
            {children}
          </Section>

          {/* Footer */}
          <Section
            style={{
              backgroundColor: "#f0f0f0",
              padding: "24px",
              borderRadius: "0 0 8px 8px",
              textAlign: "center" as const,
            }}
          >
            <Text
              style={{
                fontSize: FOOTER_TEXT_SIZE,
                color: FOOTER_MUTED_COLOR,
                margin: 0,
              }}
            >
              {unsubscribeCopy.footerReason} {productName} at{" "}
              <Link
                href={`https://${domain}`}
                style={{ color: FOOTER_MUTED_COLOR }}
              >
                {domain}
              </Link>
              {" — "}
              <Link
                href={unsubscribeUrl}
                style={{
                  color: FOOTER_MUTED_COLOR,
                  textDecoration: "underline",
                  fontSize: FOOTER_TEXT_SIZE,
                }}
              >
                {unsubscribeCopy.linkLabel}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export interface PrimaryButtonProps {
  href: string;
  label: string;
  brandColor: string;
}

export function PrimaryButton({
  href,
  label,
  brandColor,
}: PrimaryButtonProps): React.JSX.Element {
  return (
    <Section style={{ textAlign: "center" as const, margin: "16px 0" }}>
      <Link
        href={href}
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
        {label}
      </Link>
    </Section>
  );
}

export interface SecondaryLinkProps {
  href: string;
  label: string;
  brandColor: string;
}

export function SecondaryLink({
  href,
  label,
  brandColor,
}: SecondaryLinkProps): React.JSX.Element {
  return (
    <Section style={{ textAlign: "center" as const, margin: "8px 0" }}>
      <Link
        href={href}
        style={{
          color: brandColor,
          fontSize: "14px",
          fontWeight: 600,
          textDecoration: "underline",
        }}
      >
        {label}
      </Link>
    </Section>
  );
}

export interface AccentDividerProps {
  color: string;
}

export function AccentDivider({
  color,
}: AccentDividerProps): React.JSX.Element {
  return (
    <Section
      style={{
        width: "60px",
        height: "2px",
        backgroundColor: color,
        margin: "24px auto",
      }}
    />
  );
}
