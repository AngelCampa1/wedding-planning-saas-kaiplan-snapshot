import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Link,
  Section,
} from "@react-email/components";
import * as React from "react";

export interface FeedbackNotificationEmailProps {
  productName: string;
  category: string;
  message: string;
  pageUrl: string;
  email?: string;
  userAgent?: string;
  timestamp: string;
}

export function FeedbackNotificationEmail({
  productName,
  category,
  message,
  pageUrl,
  email,
  userAgent,
  timestamp,
}: FeedbackNotificationEmailProps) {
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const categoryColor =
    category === "bug"
      ? "#dc2626"
      : category === "idea"
        ? "#2563eb"
        : "#6b7280";

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "sans-serif" }}>
        <Container
          style={{ maxWidth: "560px", margin: "0 auto", padding: "20px 0" }}
        >
          <Section
            style={{
              backgroundColor: "#ffffff",
              padding: "32px",
              borderRadius: "8px",
            }}
          >
            <Heading
              style={{
                fontSize: "20px",
                color: "#1a1a1a",
                fontWeight: 700,
                marginBottom: "24px",
              }}
            >
              New {categoryLabel} Feedback — {productName}
            </Heading>

            <Section
              style={{
                backgroundColor: categoryColor,
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: "4px",
                marginBottom: "16px",
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  margin: 0,
                  textTransform: "uppercase" as const,
                }}
              >
                {categoryLabel}
              </Text>
            </Section>

            <Text
              style={{
                fontSize: "16px",
                color: "#1a1a1a",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap" as const,
              }}
            >
              {message}
            </Text>

            <Section
              style={{
                borderTop: "1px solid #e5e7eb",
                marginTop: "24px",
                paddingTop: "16px",
              }}
            >
              <Text
                style={{
                  fontSize: "13px",
                  color: "#6b7280",
                  margin: "4px 0",
                }}
              >
                <strong>Page:</strong>{" "}
                <Link href={pageUrl} style={{ color: "#2563eb" }}>
                  {pageUrl}
                </Link>
              </Text>

              {email && (
                <Text
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                    margin: "4px 0",
                  }}
                >
                  <strong>From:</strong>{" "}
                  <Link href={`mailto:${email}`} style={{ color: "#2563eb" }}>
                    {email}
                  </Link>
                </Text>
              )}

              {userAgent && (
                <Text
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                    margin: "4px 0",
                    fontFamily: "monospace",
                  }}
                >
                  <strong>UA:</strong> {userAgent}
                </Text>
              )}

              <Text
                style={{
                  fontSize: "13px",
                  color: "#6b7280",
                  margin: "4px 0",
                }}
              >
                <strong>Time:</strong> {timestamp}
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
