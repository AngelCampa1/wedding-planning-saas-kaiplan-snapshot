import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
} from "../lib/public-signup-cta";
import PublicSignupCta from "./public-signup-cta";

describe("PublicSignupCta", () => {
  it("renders the default homepage pricing link", () => {
    render(<PublicSignupCta sourcePage="/" />);

    const link = screen.getByRole("link", {
      name: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
    });

    expect(link.getAttribute("href")).toBe("#pricing");
    expect(link.className).toContain("btn-primary");
    expect(link.className).toContain("btn-shimmer");
  });

  it("prefers explicit CTA text and target when provided", () => {
    render(
      <PublicSignupCta
        sourcePage="/resources/guides/example"
        ctaText="See PebbleDesk pricing"
        ctaTarget="/?plan=center#pricing"
      />,
    );

    const link = screen.getByRole("link", {
      name: "See PebbleDesk pricing",
    });

    expect(link.getAttribute("href")).toBe("/?plan=center#pricing");
  });
});
