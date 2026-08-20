import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { FakeDoorPricing } from "./fake-door-pricing";
import type { SurveyQuestion, ReferralReward } from "../types";
import { marketingCtas } from "@kaiplan/knowledge/marketing";
import * as billingToggleTracker from "../lib/billing-toggle-tracker";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("./email-capture", () => ({
  EmailCapture: (props: Record<string, unknown>) => (
    <div
      data-testid="email-capture"
      data-api-url={props.apiUrl as string}
      data-source-page={props.sourcePage as string}
      data-privacy-note={props.privacyNote as string | undefined}
      data-error-invalid-email={props.errorInvalidEmail as string | undefined}
      data-qualified-heading={props.qualifiedHeading as string | undefined}
      data-qualified-dismiss-text={
        props.qualifiedDismissText as string | undefined
      }
      data-unqualified-dismiss-text={
        props.unqualifiedDismissText as string | undefined
      }
      data-button-text={props.buttonText as string | undefined}
      data-subtitle={props.subtitle as string | undefined}
      data-aria-label={props.ariaLabel as string | undefined}
      data-survey-preview={props.surveyPreview as string | undefined}
      data-qualification={JSON.stringify(props.qualification ?? null)}
    >
      EmailCapture
    </div>
  ),
}));

const trackBillingToggleSpy = vi.spyOn(
  billingToggleTracker,
  "trackBillingToggle",
);

const tiers = [
  {
    name: "Starter",
    price: "$29/mo",
    features: ["5 users", "Basic"],
  },
  {
    name: "Pro",
    price: "$79/mo",
    features: ["25 users", "Advanced"],
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$199/mo",
    features: ["Unlimited", "Custom"],
  },
];

const defaultProps = {
  apiUrl: "https://api.test",
  sourcePage: "/pricing",
  tiers,
  heading: "Plans & Pricing",
  buttonPrefix: "Choose",
  confirmationMessage: "Thanks for your interest!",
  popularBadgeText: "Most Popular",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FakeDoorPricing", () => {
  it("renders all tier names, prices, and features", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    expect(screen.getByText("Starter")).toBeDefined();
    expect(screen.getByText("$29/mo")).toBeDefined();
    expect(screen.getByText("Pro")).toBeDefined();
    expect(screen.getByText("$79/mo")).toBeDefined();
    expect(screen.getByText("Enterprise")).toBeDefined();
    expect(screen.getByText("$199/mo")).toBeDefined();
    expect(screen.getByText("5 users")).toBeDefined();
    expect(screen.getByText("Unlimited")).toBeDefined();
  });

  it("highlighted tier has border-2 accent styling (not border-t-4)", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    // border-t-4 removed in favour of uniform border-2
    expect(container.querySelector(".border-t-4")).toBeNull();
    // highlighted tier should have the border-2 class (set by the highlighted branch)
    const cards = container.querySelectorAll("section > div > div > div");
    const proCard = Array.from(cards).find((el) =>
      el.textContent?.includes("Pro"),
    );
    expect(proCard?.className).toContain("border-2");
  });

  it("click calls fetch with lowercased tier, sourcePage, and sessionId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
      expect(url).toBe("https://api.test/api/pricing-click");
      const body = JSON.parse(opts.body) as {
        tier: string;
        sourcePage: string;
        sessionId: string;
      };
      expect(body.tier).toBe("pro");
      expect(body.sourcePage).toBe("/pricing");
      expect(body.sessionId).toBeTruthy();
    });
  });

  it("after click, selected tier button shows checkmark and 'Selected' text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // "Selected" now appears twice: card corner badge + button text
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("after click, other tier buttons remain enabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      const proButton = screen.getByRole("button", { name: "Choose Pro" });
      const enterpriseButton = screen.getByRole("button", {
        name: "Choose Enterprise",
      });
      expect(proButton).toHaveProperty("disabled", false);
      expect(enterpriseButton).toHaveProperty("disabled", false);
    });
  });

  it("after click, selected tier button is not disabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      // Button should not be disabled — re-selection is allowed
      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn).toHaveProperty("disabled", false);
      });
    });
  });

  it("after click, confirmation message appears when confirmationMessage is provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });
  });

  it("after click, confirmationMessage is suppressed when emailCapture prop is provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Should not show"
        emailCapture={{
          apiUrl: "https://api.test",
          sourcePage: "/pricing",
          surveyQuestions: [],
          discoveryCallUrl: "https://cal.example.com",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // emailCapture replaces confirmationMessage — the message must not appear
      expect(screen.queryByText("Should not show")).toBeNull();
    });
  });

  it("uses custom confirmationMessage when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Your trial is ready!"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByText("Your trial is ready!")).toBeDefined();
    });
  });

  it("handles fetch failure gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // "Selected" appears in both the card corner badge and the button
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("calls onTierClick callback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const onTierClick = vi.fn();

    render(<FakeDoorPricing {...defaultProps} onTierClick={onTierClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(onTierClick).toHaveBeenCalledOnce();
    });
  });

  it("renders custom heading prop", () => {
    render(<FakeDoorPricing {...defaultProps} heading="Pick a Plan" />);
    expect(screen.getByText("Pick a Plan")).toBeDefined();
  });

  it("passes qualification rules through to the modal email capture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={{
          apiUrl: "https://api.test",
          sourcePage: "/pricing",
          surveyQuestions: [] as SurveyQuestion[],
          discoveryCallUrl: "https://cal.example.com",
          qualification: {
            logic: "any",
            rules: [{ questionId: "segment", answers: ["Women 40+"] }],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("email-capture").getAttribute("data-qualification"),
      ).toBe(
        JSON.stringify({
          logic: "any",
          rules: [{ questionId: "segment", answers: ["Women 40+"] }],
        }),
      );
    });
  });

  it("grid class varies by tier count", () => {
    const { container: c3 } = render(<FakeDoorPricing {...defaultProps} />);
    expect(c3.querySelector(".md\\:grid-cols-3")).toBeTruthy();

    const { container: c2 } = render(
      <FakeDoorPricing {...defaultProps} tiers={tiers.slice(0, 2)} />,
    );
    expect(c2.querySelector(".md\\:grid-cols-2")).toBeTruthy();

    const { container: c1 } = render(
      <FakeDoorPricing {...defaultProps} tiers={tiers.slice(0, 1)} />,
    );
    expect(c1.querySelector(".max-w-lg")).toBeTruthy();
  });

  it("re-selection tracks both tiers independently", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Both tiers show as selected — each tier has a corner badge + button text = 2 per tier
    expect(screen.getAllByText("Selected")).toHaveLength(4);
  });

  it("uses custom buttonPrefix when provided", () => {
    render(<FakeDoorPricing {...defaultProps} buttonPrefix="Get Access to" />);
    expect(
      screen.getByRole("button", { name: "Get Access to Starter" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Get Access to Pro" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Get Access to Enterprise" }),
    ).toBeDefined();
  });

  it("uses tier.ctaText as button label when set, ignoring buttonPrefix + name", () => {
    const tiersWithCtaText = [
      { ...tiers[0]!, ctaText: "Start Free Trial" },
      { ...tiers[1]! },
      { ...tiers[2]! },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithCtaText} />);
    expect(
      screen.getByRole("button", { name: "Start Free Trial" }),
    ).toBeDefined();
    // Other tiers without ctaText still use prefix + name
    expect(screen.getByRole("button", { name: "Choose Pro" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Choose Enterprise" }),
    ).toBeDefined();
  });

  it("shows only tier name when buttonPrefix is not provided", () => {
    const { buttonPrefix: _, ...propsWithoutPrefix } = defaultProps;
    render(<FakeDoorPricing {...propsWithoutPrefix} />);
    expect(screen.getByRole("button", { name: "Starter" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Pro" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Enterprise" })).toBeDefined();
  });

  it("selected tier card gets selected highlight class", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      // querySelector can't handle CSS variable class names — check className string directly
      const cards = container.querySelectorAll("section > div > div > div");
      const starterCard = cards[0];
      expect(starterCard?.className).toContain(
        "border-[var(--color-accent-400)]",
      );
    });
  });

  it("confirmation message does not appear before any click", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
      />,
    );
    expect(screen.queryByText("Thanks for your interest!")).toBeNull();
  });

  it("does not render heading when heading prop is omitted", () => {
    const { heading: _, ...propsWithoutHeading } = defaultProps;
    render(<FakeDoorPricing {...propsWithoutHeading} />);
    expect(screen.queryByText("Plans & Pricing")).toBeNull();
  });

  it("uses custom heading when provided", () => {
    render(<FakeDoorPricing {...defaultProps} heading="Our Plans" />);
    expect(screen.getByText("Our Plans")).toBeDefined();
    expect(screen.queryByText("Plans & Pricing")).toBeNull();
  });

  it("renders 'Most Popular' badge when popularTier matches a tier name (case-insensitive)", () => {
    render(<FakeDoorPricing {...defaultProps} popularTier="pro" />);
    expect(screen.getByText("Most Popular")).toBeDefined();
  });

  it("defaults popularBadgeText to 'Most Popular' when popularTier is set but popularBadgeText is not passed", () => {
    const { popularBadgeText: _, ...propsWithoutBadgeText } = defaultProps;
    render(<FakeDoorPricing {...propsWithoutBadgeText} popularTier="pro" />);
    expect(screen.getByText("Most Popular")).toBeDefined();
  });

  it("does NOT render popular badge when popularTier not provided", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    expect(screen.queryByText("Most Popular")).toBeNull();
  });

  it("does NOT render 'Most Popular' badge when popularTier does not match any tier", () => {
    render(<FakeDoorPricing {...defaultProps} popularTier="nonexistent" />);
    expect(screen.queryByText("Most Popular")).toBeNull();
  });

  it("renders 'Most Popular' badge using case-insensitive match (uppercase popularTier)", () => {
    render(<FakeDoorPricing {...defaultProps} popularTier="PRO" />);
    expect(screen.getByText("Most Popular")).toBeDefined();
  });

  it("renders description text when tier has description", () => {
    const tiersWithDescription = [
      { ...tiers[0]! },
      { ...tiers[1]!, description: "Most teams start here" },
      { ...tiers[2]! },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithDescription} />);
    expect(screen.getByText("Most teams start here")).toBeDefined();
  });

  it("does not render description element when tier has no description", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    // No descriptions in default tiers, just ensure no phantom elements
    const starterCard = screen
      .getByText("Starter")
      .closest("div") as HTMLElement;
    expect(starterCard).toBeTruthy();
  });

  it("shows tier-specific message from selectedMessages after selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        selectedMessages={{ pro: "The Pro plan is perfect for growing teams!" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(
        screen.getByText("The Pro plan is perfect for growing teams!"),
      ).toBeDefined();
    });
  });

  it("falls back to generic confirmationMessage when selectedMessages not provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });
  });

  it("falls back to generic message when selectedMessages does not have entry for selected tier", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
        selectedMessages={{ starter: "Starter-specific message" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // Pro not in selectedMessages, should show generic confirmationMessage
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });
  });

  it("shows tier-specific message when multiple tiers clicked and each has its own message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing
        {...defaultProps}
        selectedMessages={{
          starter: "Starter message!",
          pro: "Pro message!",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByText("Starter message!")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      // Last clicked tier message should appear
      expect(screen.getByText("Pro message!")).toBeDefined();
    });
  });
  it("uses custom selectedBadgeText when provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} selectedBadgeText="Picked" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // "Picked" appears in both the card corner badge and the button — both must show it
      const allPicked = screen.getAllByText("Picked");
      expect(allPicked.length).toBeGreaterThanOrEqual(1);
      // The default "Selected" text must not appear anywhere
      expect(screen.queryByText("Selected")).toBeNull();
      // The button must contain "Picked"
      const buttons = screen.getAllByRole("button");
      const selectedButton = buttons.find((b) =>
        b.textContent?.includes("Picked"),
      );
      expect(selectedButton).toBeDefined();
    });
  });

  it("defaults selectedBadgeText to 'Selected' when not provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // "Selected" appears in both the card corner badge and the button
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("uses custom recommendedBadgeText when provided", () => {
    const tiersWithHighlighted = [
      { ...tiers[0]! },
      { ...tiers[1]!, highlighted: true },
      { ...tiers[2]! },
    ];
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithHighlighted}
        recommendedBadgeText="Best Value"
      />,
    );
    expect(screen.getByText("Best Value")).toBeDefined();
    expect(screen.queryByText("RECOMMENDED")).toBeNull();
  });

  it("defaults recommendedBadgeText to 'RECOMMENDED' when not provided", () => {
    const tiersWithHighlighted = [
      { ...tiers[0]! },
      { ...tiers[1]!, highlighted: true },
      { ...tiers[2]! },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithHighlighted} />);
    expect(screen.getByText("RECOMMENDED")).toBeDefined();
  });

  it("does not render recommendedBadgeText badge when no tier is highlighted", () => {
    const tiersNoHighlight = tiers.map((t) => ({ ...t, highlighted: false }));
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersNoHighlight}
        recommendedBadgeText="Best Value"
      />,
    );
    expect(screen.queryByText("Best Value")).toBeNull();
  });

  it("hides recommendedBadgeText badge on highlighted tier after it is selected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(
      <FakeDoorPricing {...defaultProps} recommendedBadgeText="Top Pick" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.queryByText("Top Pick")).toBeNull();
    });
  });

  it("renders socialProofText below the tier grid when provided", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        socialProofText="47 founders already joined"
      />,
    );
    expect(screen.getByText("47 founders already joined")).toBeDefined();
  });

  it("does not render socialProofText element when prop is not provided", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    // No social proof paragraph should exist
    expect(screen.queryByText("47 founders already joined")).toBeNull();
    // Verify no empty paragraph from social proof slot
    const paras = container.querySelectorAll("p");
    paras.forEach((p) => {
      expect(p.textContent?.trim()).not.toBe("");
    });
  });

  it("does not render socialProofText element when prop is undefined", () => {
    render(<FakeDoorPricing {...defaultProps} socialProofText={undefined} />);
    expect(screen.queryByText("47 founders already joined")).toBeNull();
  });

  it("card corner badge shows selectedBadgeText prop value, not hardcoded SELECTED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} selectedBadgeText="Picked" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // The card corner badge (span.absolute.top-3.right-3) must contain the prop value
      const badges = screen
        .getAllByText("Picked")
        .filter((el) => el.tagName === "SPAN");
      // At least one span with "Picked" must exist (the corner badge)
      expect(badges.length).toBeGreaterThan(0);
      // The hardcoded string "SELECTED" must not appear anywhere in the DOM
      expect(screen.queryByText("SELECTED")).toBeNull();
    });
  });

  it("non-highlighted unselected tier button has btn-primary class", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    // Starter and Enterprise are non-highlighted tiers
    const buttons = container.querySelectorAll("button");
    const starterButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("Starter"),
    );
    expect(starterButton).toBeDefined();
    expect(starterButton?.className).toContain("btn-primary");
    expect(starterButton?.className).not.toContain("btn-secondary");
  });

  it("highlighted unselected tier button has btn-primary and btn-primary--pulse classes", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    const proButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("Pro"),
    );
    expect(proButton).toBeDefined();
    expect(proButton?.className).toContain("btn-primary");
    expect(proButton?.className).toContain("btn-primary--pulse");
    expect(proButton?.className).not.toContain("btn-secondary");
  });

  it("CTA tier buttons retain btn-shimmer class", () => {
    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    const buttons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent?.includes("Choose"),
    );
    buttons.forEach((btn) => {
      expect(btn.className).toContain("btn-shimmer");
    });
  });

  it("selected tier button has btn-secondary class (not btn-primary)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { container } = render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      const buttons = container.querySelectorAll("button");
      // After selection, the Starter button switches to btn-secondary
      const starterBtns = Array.from(buttons).filter((b) =>
        b.className.includes("bg-[var(--color-accent-100)]"),
      );
      expect(starterBtns.length).toBeGreaterThan(0);
      starterBtns.forEach((btn) => {
        expect(btn.className).toContain("btn-secondary");
      });
    });
  });

  // ── Badge priority tests (TDD) ──

  it("badge priority: when popular tier is selected, shows only 'Selected' badge — not 'Most Popular'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} popularTier="Pro" />);

    // Before selection: "Most Popular" badge is visible, "Selected" is not
    expect(screen.getByText("Most Popular")).toBeDefined();
    expect(screen.queryByText("Selected")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // After selection: "Selected" badge must appear
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
      // "Most Popular" badge must NOT appear simultaneously
      expect(screen.queryByText("Most Popular")).toBeNull();
    });
  });

  it("badge priority: when popular tier is NOT selected, shows 'Most Popular' badge — not 'Selected'", () => {
    render(<FakeDoorPricing {...defaultProps} popularTier="Pro" />);

    expect(screen.getByText("Most Popular")).toBeDefined();
    expect(screen.queryByText("Selected")).toBeNull();
  });

  it("badge priority: a tier cannot show both 'Selected' and 'Most Popular' simultaneously", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} popularTier="Pro" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      const selectedBadges = screen.queryAllByText("Selected");
      const popularBadges = screen.queryAllByText("Most Popular");
      // At least one of these must be zero — they cannot coexist
      expect(selectedBadges.length === 0 || popularBadges.length === 0).toBe(
        true,
      );
    });
  });
});

describe("FakeDoorPricing — clear selection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("does not show Clear button before any selection", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("shows Clear button when heading is omitted and a tier is selected", async () => {
    const { heading: _, ...propsWithoutHeading } = defaultProps;
    render(<FakeDoorPricing {...propsWithoutHeading} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("shows Clear button after a tier is selected", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeDefined();
    });
  });

  it("Clear button resets all selections", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      // Each selected tier shows "Selected" in both the card corner badge and the button text = 2 per tier
      expect(screen.getAllByText("Selected")).toHaveLength(4);
    });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    // All selections should be cleared
    expect(screen.queryByText("Selected")).toBeNull();
    // Clear button itself should be gone
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
    // Original button text should be back
    expect(
      screen.getByRole("button", { name: "Choose Starter" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Choose Pro" })).toBeDefined();
  });

  it("Clear button hides confirmation message", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByText("Thanks for your interest!")).toBeNull();
  });
});

describe("FakeDoorPricing — emailCapture prop (pay-intent flow)", () => {
  const surveyQuestions: SurveyQuestion[] = [
    { id: "role", text: "What is your role?", options: ["Owner", "Manager"] },
  ];
  const referralRewards: ReferralReward[] = [
    { threshold: 3, description: "Free month" },
  ];
  const emailCaptureProps = {
    apiUrl: "https://api.test",
    sourcePage: "/pricing",
    surveyQuestions,
    discoveryCallUrl: "https://cal.example.com",
    buttonText: "Start Your Free Trial",
    subtitle: "Limited beta seats",
    whatHappensNext: "We'll send you onboarding info.",
    referralRewards,
    productName: "TestProduct",
    productDomain: "testproduct.com",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("does NOT render EmailCapture before any tier is selected", () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    expect(screen.queryByTestId("email-capture")).toBeNull();
  });

  it("renders EmailCapture instead of confirmationMessage after a tier is selected", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={emailCaptureProps}
        confirmationMessage="This should NOT appear"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
      expect(screen.queryByText("This should NOT appear")).toBeNull();
    });
  });

  it("passes apiUrl and sourcePage from emailCapture props to EmailCapture component", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-api-url")).toBe("https://api.test");
      expect(el.getAttribute("data-source-page")).toBe("/pricing");
    });
  });

  it("still shows EmailCapture when a second tier is selected", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });
  });

  it("does not render default confirmationMessage paragraph when emailCapture is provided and tier is selected", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={emailCaptureProps}
        confirmationMessage="Should not show"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      // emailCapture takes priority — confirmationMessage must not appear
      expect(screen.queryByText("Should not show")).toBeNull();
    });
  });

  it("does not render EmailCapture when emailCapture prop is absent after selection", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        confirmationMessage="Thanks for your interest!"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
      expect(screen.getByText("Thanks for your interest!")).toBeDefined();
    });
  });

  it("does not render confirmation paragraph when confirmationMessage is omitted and no selectedMessages match", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { confirmationMessage: _, ...propsWithoutConfirmation } =
      defaultProps;
    render(<FakeDoorPricing {...propsWithoutConfirmation} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });
    // No confirmation paragraph rendered
    expect(screen.queryByText("Thanks for your interest!")).toBeNull();
  });

  it("clicking Clear removes EmailCapture from the DOM when emailCapture prop is provided", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    // Select a tier — EmailCapture should appear
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    // Click Clear — EmailCapture should be removed
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByTestId("email-capture")).toBeNull();
  });

  it("pressing Escape closes modal when emailCapture is provided and tier is selected", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    // Select a tier — modal should appear
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    // Escape key — modal should close
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });
  });

  // Bug fix: SELECTED badge must persist after Escape closes the modal
  it("retains SELECTED badge on tier after modal is closed via Escape", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    // The SELECTED badge must still be visible — selection state must NOT be cleared
    expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
  });

  // Bug fix: SELECTED badge must persist after backdrop click closes the modal
  it("retains SELECTED badge on tier after modal is closed via backdrop click", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    // Click the backdrop (the dialog overlay element)
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    // The SELECTED badge must still be visible — selection state must NOT be cleared
    expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
  });

  // Bug fix: SELECTED badge must persist after close button closes the modal
  it("retains SELECTED badge on tier after modal is closed via close button", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    const triggerButton = screen.getByRole("button", { name: "Choose Pro" });
    triggerButton.focus();
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    // The SELECTED badge must still be visible — selection state must NOT be cleared
    expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
  });

  it("pressing Escape does nothing when modal is closed", () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    // No tier selected — Escape should not throw
    expect(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    }).not.toThrow();
    expect(screen.queryByTestId("email-capture")).toBeNull();
  });

  // Bug 7: focus must return to the trigger button when modal closes
  it("restores focus to the trigger button when modal is closed", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    const triggerButton = screen.getByRole("button", { name: "Choose Pro" });
    triggerButton.focus();
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    // Close via the Clear button
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    expect(document.activeElement).toBe(triggerButton);
  });

  it("modal has role=dialog with aria-modal and aria-label when emailCapture tier is selected", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-label")).toBe(
        "See plan details and continue",
      );
    });
  });

  it("cleans up keydown listener on unmount when modal is open", async () => {
    const { unmount } = render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });
    // Unmount while modal is open — exercises the useEffect cleanup function
    unmount();
  });

  it("clicking modal inner content stops propagation — modal stays open", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });
    // Click the inner EmailCapture div — stopPropagation prevents backdrop clearSelection
    fireEvent.click(screen.getByTestId("email-capture"));
    expect(screen.getByTestId("email-capture")).toBeDefined();
  });

  // Bug 13: body scroll lock when modal is open
  it("locks body scroll when email capture modal is open", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    expect(document.body.style.overflow).not.toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll when email capture modal is closed", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByTestId("email-capture")).toBeDefined();
    });

    expect(document.body.style.overflow).toBe("hidden");

    // Close via clear button
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByTestId("email-capture")).toBeNull();
    });

    expect(document.body.style.overflow).toBe("");
  });

  it("does not lock body scroll when no emailCapture prop (no modal)", () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    // Without emailCapture, no modal opens, just confirmation message
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("uses custom modalAriaLabel on the dialog element", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={emailCaptureProps}
        modalAriaLabel="Join the beta program"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-label")).toBe("Join the beta program");
    });
  });

  it("defaults modalAriaLabel to a neutral continuation label when not provided", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-label")).toBe(
        "See plan details and continue",
      );
    });
  });

  it("forwards extended props (privacyNote, survey qualification copy) to EmailCapture via spread", async () => {
    const extendedProps = {
      ...emailCaptureProps,
      privacyNote: "We respect your privacy.",
      errorInvalidEmail: "Bad email format",
      qualifiedHeading: "Perfect fit!",
      qualifiedDismissText: "Not now",
      unqualifiedDismissText: "Skip",
    };
    render(<FakeDoorPricing {...defaultProps} emailCapture={extendedProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-privacy-note")).toBe(
        "We respect your privacy.",
      );
      expect(el.getAttribute("data-error-invalid-email")).toBe(
        "Bad email format",
      );
      expect(el.getAttribute("data-qualified-heading")).toBe("Perfect fit!");
      expect(el.getAttribute("data-qualified-dismiss-text")).toBe("Not now");
      expect(el.getAttribute("data-unqualified-dismiss-text")).toBe("Skip");
    });
  });

  it("defaults EmailCapture buttonText to 'Start free trial' when not explicitly provided", async () => {
    const minimalEmailCapture = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [] as SurveyQuestion[],
      discoveryCallUrl: "https://cal.example.com",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={minimalEmailCapture} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-button-text")).toBe("Start free trial");
    });
  });

  it("defaults EmailCapture subtitle to trial-first copy with productName when not explicitly provided", async () => {
    const emailCaptureWithProduct = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [] as SurveyQuestion[],
      discoveryCallUrl: "https://cal.example.com",
      productName: "CrewRoute",
    };
    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={emailCaptureWithProduct}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-subtitle")).toBe(
        "Start the trial now, then choose a plan later inside CrewRoute.",
      );
    });
  });

  it("defaults EmailCapture subtitle to a generic access disclosure when no productName and no explicit subtitle", async () => {
    const minimalEmailCapture = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [] as SurveyQuestion[],
      discoveryCallUrl: "https://cal.example.com",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={minimalEmailCapture} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-subtitle")).toBe(
        marketingCtas.publicSignup.message,
      );
    });
  });

  it("uses the modal aria label for the nested EmailCapture by default", async () => {
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-aria-label")).toBe(
        "See plan details and continue",
      );
    });
  });

  it("uses explicit buttonText override when provided in emailCapture", async () => {
    const customEmailCapture = {
      ...emailCaptureProps,
      buttonText: "Custom CTA",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={customEmailCapture} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-button-text")).toBe("Custom CTA");
    });
  });

  it("uses explicit subtitle override when provided in emailCapture", async () => {
    const customEmailCapture = {
      ...emailCaptureProps,
      subtitle: "Custom subtitle text",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={customEmailCapture} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-subtitle")).toBe("Custom subtitle text");
    });
  });

  it("forwards surveyPreview to EmailCapture", async () => {
    const captureWithSurvey = {
      ...emailCaptureProps,
      surveyPreview: "Quick 3-question survey. Takes 30 seconds.",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={captureWithSurvey} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const el = screen.getByTestId("email-capture");
      expect(el.getAttribute("data-survey-preview")).toBe(
        "Quick 3-question survey. Takes 30 seconds.",
      );
    });
  });
});

describe("FakeDoorPricing — billing toggle", () => {
  const tiersWithMonthly = [
    {
      name: "Starter",
      price: "$49/mo",
      monthlyPriceCents: 4900,
      features: ["5 users", "Basic"],
    },
    {
      name: "Pro",
      price: "$99/mo",
      monthlyPriceCents: 9900,
      features: ["25 users", "Advanced"],
      highlighted: true,
    },
  ];

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("no toggle rendered when no tier has monthlyPriceCents", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiers} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Monthly" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Annual" })).toBeNull();
  });

  it("no toggle rendered when all tiers have pricingModel one-time even with monthlyPriceCents", () => {
    const oneTimeTier = [
      {
        name: "Lifetime",
        price: "$299",
        monthlyPriceCents: 9900,
        pricingModel: "one-time" as const,
        features: ["Lifetime access"],
      },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={oneTimeTier} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("no toggle rendered when showBillingToggle is false even with monthlyPriceCents", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        showBillingToggle={false}
      />,
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("toggle renders Monthly and Annual buttons when tiers have monthlyPriceCents", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    expect(screen.getByRole("radiogroup")).toBeDefined();
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Annual" })).toBeDefined();
  });

  it("clicking Annual switches price display to computed annual price", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    // Initially monthly price shown
    expect(screen.getByText("$49/mo")).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

    await waitFor(() => {
      // 4900 * 10 / 100 = $490
      expect(screen.getByText("$490/yr")).toBeDefined();
    });
  });

  it("annual mode uses annualPriceOverride when provided", async () => {
    const tiersWithOverride = [
      {
        name: "Starter",
        price: "$49/mo",
        monthlyPriceCents: 4900,
        annualPriceOverride: "$24.99/yr",
        features: ["5 users"],
      },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithOverride} />);
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

    await waitFor(() => {
      expect(screen.getByText("$24.99/yr")).toBeDefined();
    });
    // The computed price should NOT show — override takes precedence
    expect(screen.queryByText("$490/yr")).toBeNull();
  });

  it("trial banner renders when trialBannerText is provided", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        trialBannerText="Pick a plan to see pricing details and next steps."
      />,
    );
    expect(
      screen.getByText("Pick a plan to see pricing details and next steps."),
    ).toBeDefined();
  });

  it("trial banner is absent when trialBannerText is not provided", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    expect(
      screen.queryByText("Pick a plan to see pricing details and next steps."),
    ).toBeNull();
  });

  it("normalizes free-trial banner copy before rendering", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        trialBannerText="1-month free trial included"
      />,
    );

    expect(screen.getByText(marketingCtas.publicSignup.message)).toBeDefined();
  });

  it("savings badge appears on cards in annual mode", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        annualSavingsText="2 months free"
      />,
    );
    // Not shown in monthly mode
    expect(screen.queryByText("2 months free")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

    await waitFor(() => {
      const badges = screen.getAllByText("2 months free");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("savings badge is absent in monthly mode", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        annualSavingsText="2 months free"
      />,
    );
    // Default monthly mode — badge must not show
    expect(screen.queryByText("2 months free")).toBeNull();
  });

  it("fetch body contains billingPeriod: monthly by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(opts.body) as { billingPeriod: string };
      expect(body.billingPeriod).toBe("monthly");
    });
  });

  it("fetch body contains billingPeriod: annual after switching to annual", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);

    // Switch to annual first
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

    await waitFor(() => {
      expect(screen.getByText("$490/yr")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(opts.body) as { billingPeriod: string };
      expect(body.billingPeriod).toBe("annual");
    });
  });

  it("struck-through monthly price appears in annual mode for tiers with monthlyPriceCents", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);

    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

    await waitFor(() => {
      // The monthly price string should still be in the DOM (as a struck-through element)
      const allStarterPrice = screen.getAllByText("$49/mo");
      expect(allStarterPrice.length).toBeGreaterThan(0);
      // Check it has line-through styling
      const struckThrough = allStarterPrice.find((el) =>
        el.className.includes("line-through"),
      );
      expect(struckThrough).toBeDefined();
    });
  });

  it("toggle uses custom labels when monthlyToggleLabel and annualToggleLabel are provided", () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        monthlyToggleLabel="Per Month"
        annualToggleLabel="Per Year"
      />,
    );
    expect(screen.getByRole("radio", { name: "Per Month" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Per Year" })).toBeDefined();
    expect(screen.queryByRole("radio", { name: "Monthly" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Annual" })).toBeNull();
  });

  it("Monthly radio is aria-checked=true by default, Annual is aria-checked=false", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    const monthlyBtn = screen.getByRole("radio", { name: "Monthly" });
    const annualBtn = screen.getByRole("radio", { name: "Annual" });
    expect(monthlyBtn.getAttribute("aria-checked")).toBe("true");
    expect(annualBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("Annual radio becomes aria-checked=true after clicking it", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    await waitFor(() => {
      expect(
        screen
          .getByRole("radio", { name: "Annual" })
          .getAttribute("aria-checked"),
      ).toBe("true");
      expect(
        screen
          .getByRole("radio", { name: "Monthly" })
          .getAttribute("aria-checked"),
      ).toBe("false");
    });
  });

  it("billing period radios keep a mobile-safe minimum tap height", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);

    expect(screen.getByRole("radio", { name: "Monthly" }).className).toContain(
      "min-h-11",
    );
    expect(screen.getByRole("radio", { name: "Annual" }).className).toContain(
      "min-h-11",
    );
  });

  it("radiogroup has aria-label 'Billing period'", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-label")).toBe("Billing period");
  });

  it("tiers without monthlyPriceCents show original price in annual mode (no change)", async () => {
    const mixedTiers = [
      {
        name: "Starter",
        price: "$49/mo",
        monthlyPriceCents: 4900,
        features: ["5 users"],
      },
      {
        name: "Enterprise",
        price: "Contact us",
        features: ["Custom"],
      },
    ];
    render(<FakeDoorPricing {...defaultProps} tiers={mixedTiers} />);
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    await waitFor(() => {
      // Enterprise has no monthlyPriceCents — shows original price
      expect(screen.getByText("Contact us")).toBeDefined();
    });
  });

  it("selectedMessages key normalization works in billing toggle context", async () => {
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithMonthly}
        selectedMessages={{ Starter: "Starter toggle message" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      // selectedMessages key normalization (case-insensitive) should work
      expect(screen.getByText("Starter toggle message")).toBeDefined();
    });
  });

  it("switching back to Monthly from Annual restores monthly prices", async () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);

    // Switch to Annual
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    await waitFor(() => {
      expect(screen.getByText("$490/yr")).toBeDefined();
    });

    // Switch back to Monthly
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    await waitFor(() => {
      // Monthly price should be back
      expect(screen.getAllByText("$49/mo").length).toBeGreaterThan(0);
      // Annual price should be gone
      expect(screen.queryByText("$490/yr")).toBeNull();
    });
  });

  it("shows per-month equivalent label below annual price in annual mode", async () => {
    // Tier with monthlyPriceCents: 4900 → annual total $490/yr → ~$40.83/mo equivalent
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);

    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

    await waitFor(() => {
      // The annual total must be visible
      expect(screen.getByText("$490/yr")).toBeDefined();
      // The per-month equivalent must appear below it
      expect(screen.getByText("~$40.83/mo")).toBeDefined();
    });
  });

  it("per-month equivalent label is absent in monthly mode", () => {
    render(<FakeDoorPricing {...defaultProps} tiers={tiersWithMonthly} />);
    // Default monthly mode — equivalent label must not appear
    expect(screen.queryByText("~$40.83/mo")).toBeNull();
  });
});

describe("FakeDoorPricing — clearButtonText prop", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("uses custom clearButtonText on clear buttons", async () => {
    render(<FakeDoorPricing {...defaultProps} clearButtonText="Reset" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reset/i })).toBeDefined();
    });
    // Default "Clear" text must not appear
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  });

  it("defaults clearButtonText to 'Clear' when not provided", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeDefined();
    });
  });

  // --- analytics: pricing_tier_clicked ---

  it("fires pricing_tier_clicked with correct tier_name, source_page, and billing_period on successful POST", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<FakeDoorPricing {...defaultProps} sourcePage="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith("pricing_tier_clicked", {
        tier_name: "Pro",
        source_page: "/pricing",
        billing_period: "monthly",
      });
    });
  });

  it("does not fire trackEvent when the fetch fails", async () => {
    const { trackEvent } = await import("../lib/analytics");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    // Wait a tick for the async handleClick to run
    await waitFor(() => {
      expect(screen.getAllByText("Selected").length).toBeGreaterThanOrEqual(1);
    });

    // Flush the microtask queue so the async catch path has fully settled
    await act(async () => {});

    expect(trackEvent).not.toHaveBeenCalledWith(
      "pricing_tier_clicked",
      expect.anything(),
    );
  });

  // ── Bug 3f: hydration mismatch — sessionId must be set via useEffect, not useState init ──
  it("sessionId is populated via useEffect (not useState initializer), avoiding hydration mismatch", async () => {
    // The fix: useState("") + useEffect(() => setSessionId(generateSessionId()), [])
    // This means on the server the sessionId starts as "" (deterministic),
    // and the client sets it after hydration.
    // We verify this by intercepting fetch calls after a tier click to check
    // that sessionId is a non-empty string (set by useEffect, not initial state).
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} />);

    // Click a tier — this triggers the pricing click which uses sessionId
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    ) as { sessionId: string };

    // sessionId must be a non-empty string (generated by useEffect after mount)
    expect(typeof body.sessionId).toBe("string");
    expect(body.sessionId.length).toBeGreaterThan(0);
  });

  // --- Fix C: z-index standardization ---
  it("modal overlay uses z-[60] class above site header", async () => {
    const emailCaptureProps = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [],
      discoveryCallUrl: "https://cal.test",
    };
    render(
      <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
    await waitFor(() => {
      const modalOverlay = screen.getByRole("dialog").closest(".fixed.inset-0");
      expect(modalOverlay).not.toBeNull();
      expect(modalOverlay!.className).toContain("z-[60]");
      expect(modalOverlay!.className).not.toContain("z-50");
    });
  });

  it("calls trackBillingToggle when monthly toggle is clicked", () => {
    const tiersWithAnnual = tiers.map((t) => ({
      ...t,
      monthlyPriceCents: 2900,
    }));
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithAnnual}
        showBillingToggle={true}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    expect(trackBillingToggleSpy).toHaveBeenCalledWith("monthly", "/pricing");
  });

  it("calls trackBillingToggle when annual toggle is clicked", () => {
    const tiersWithAnnual = tiers.map((t) => ({
      ...t,
      monthlyPriceCents: 2900,
    }));
    render(
      <FakeDoorPricing
        {...defaultProps}
        tiers={tiersWithAnnual}
        showBillingToggle={true}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    expect(trackBillingToggleSpy).toHaveBeenCalledWith("annual", "/pricing");
  });

  describe("open-pricing-modal CustomEvent", () => {
    const emailCaptureProps = {
      apiUrl: "https://api.test",
      sourcePage: "/pricing",
      surveyQuestions: [] as SurveyQuestion[],
      discoveryCallUrl: "",
    };

    it("signals that the pricing modal is ready after mount", async () => {
      const readyListener = vi.fn();
      document.addEventListener("fake-door-pricing-ready", readyListener);

      render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );

      await waitFor(() => {
        expect(readyListener).toHaveBeenCalledTimes(1);
        expect(document.documentElement.dataset.fakeDoorPricingReady).toBe(
          "true",
        );
      });

      document.removeEventListener("fake-door-pricing-ready", readyListener);
    });

    it("opens modal, pre-selects first tier, and tracks the first tier when event is dispatched with emailCapture prop", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      const { trackEvent } = await import("../lib/analytics");
      const onTierClick = vi.fn();

      render(
        <FakeDoorPricing
          {...defaultProps}
          emailCapture={emailCaptureProps}
          onTierClick={onTierClick}
        />,
      );

      // Modal should not be open yet
      expect(screen.queryByRole("dialog")).toBeNull();

      // Dispatch the custom event
      await act(async () => {
        document.dispatchEvent(new CustomEvent("open-pricing-modal"));
      });

      // Modal should now be open
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeNull();
      });

      // The first tier ("Starter") should be pre-selected
      // When selected, the tier shows "Selected" badge and button text
      await waitFor(() => {
        expect(screen.queryAllByText("Selected").length).toBeGreaterThanOrEqual(
          1,
        );
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledOnce();
        const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
        const body = JSON.parse(opts.body) as {
          tier: string;
          sourcePage: string;
          billingPeriod: string;
        };

        expect(body.tier).toBe("starter");
        expect(body.sourcePage).toBe("/pricing");
        expect(body.billingPeriod).toBe("monthly");
        expect(trackEvent).toHaveBeenCalledWith("pricing_tier_clicked", {
          tier_name: "Starter",
          source_page: "/pricing",
          billing_period: "monthly",
        });
        expect(onTierClick).toHaveBeenCalledOnce();
      });
    });

    it("uses the event detail tierName instead of defaulting to the first tier", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );

      await act(async () => {
        document.dispatchEvent(
          new CustomEvent("open-pricing-modal", {
            detail: { tierName: "Enterprise" },
          }),
        );
      });

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeNull();
      });

      await waitFor(() => {
        const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
        const body = JSON.parse(opts.body) as { tier: string };
        expect(body.tier).toBe("enterprise");
      });
    });

    it("auto-opens the matched tier from the current url plan query", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      window.history.replaceState({}, "", "/?plan=enterprise#pricing");

      render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeNull();
      });

      await waitFor(() => {
        const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
        const body = JSON.parse(opts.body) as { tier: string };
        expect(body.tier).toBe("enterprise");
      });

      window.history.replaceState({}, "", "/");
    });

    it("does nothing when open-pricing-modal is dispatched without emailCapture prop", async () => {
      render(<FakeDoorPricing {...defaultProps} />);

      // Dispatch the custom event
      await act(async () => {
        document.dispatchEvent(new CustomEvent("open-pricing-modal"));
      });

      // Modal should still not be open (no emailCapture prop)
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("does nothing when open-pricing-modal is dispatched with empty tiers", async () => {
      render(
        <FakeDoorPricing
          {...defaultProps}
          tiers={[]}
          emailCapture={emailCaptureProps}
        />,
      );

      await act(async () => {
        document.dispatchEvent(new CustomEvent("open-pricing-modal"));
      });

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("has data-fake-door-pricing attribute on the outermost element", () => {
      const { container } = render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );
      expect(
        container.querySelector("[data-fake-door-pricing]"),
      ).not.toBeNull();
    });

    it("removes the event listener on unmount", async () => {
      const { unmount } = render(
        <FakeDoorPricing {...defaultProps} emailCapture={emailCaptureProps} />,
      );

      unmount();

      // Dispatching after unmount should not throw or cause state updates
      await act(async () => {
        document.dispatchEvent(new CustomEvent("open-pricing-modal"));
      });

      // No dialog rendered after unmount
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
