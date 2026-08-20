import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import {
  CtaButton,
  MemberInviteEmail,
  PasswordResetEmail,
  RsvpConfirmationEmail,
  RsvpReminderEmail,
  TrialEndingReminderEmail,
  TrialActivationNudgeEmail,
  SubscribeNudgeEmail,
  rsvpLabel,
} from "../../src/lib/email-templates";

describe("rsvpLabel", () => {
  it('maps "accepted" to "Joyfully attending"', () => {
    expect(rsvpLabel("accepted")).toBe("Joyfully attending");
  });
  it('maps "declined" to "Can\'t make it"', () => {
    expect(rsvpLabel("declined")).toBe("Can't make it");
  });
  it('maps "pending" to "Still deciding"', () => {
    expect(rsvpLabel("pending")).toBe("Still deciding");
  });
  it('maps "invited" to "Still deciding"', () => {
    expect(rsvpLabel("invited")).toBe("Still deciding");
  });
  it("passes through unknown values", () => {
    expect(rsvpLabel("unknown_status")).toBe("unknown_status");
  });
});

describe("CtaButton", () => {
  it("renders an anchor with correct href", async () => {
    const html = await render(
      CtaButton({ href: "https://example.com", children: "Click me" }),
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("Click me");
  });
  it("renders terracotta background color", async () => {
    const html = await render(
      CtaButton({ href: "https://example.com", children: "Go" }),
    );
    expect(html).toContain("#b0432a");
  });
});

describe("RsvpConfirmationEmail", () => {
  const baseProps = {
    guestFirstName: "Ava",
    weddingName: "Ava & Sam's Wedding",
    weddingDate: "2026-06-07",
    householdSummary: [
      { name: "Ava Rivera", status: "Joyfully attending" },
      { name: "Sam Rivera", status: "Still deciding" },
    ],
    rsvpUrl: "https://kaiplan.app/w/ava-sam?token=abc#rsvp",
    manageUrl: "https://kaiplan.app/manage",
  };

  it("renders without throwing", async () => {
    await expect(
      render(RsvpConfirmationEmail(baseProps)),
    ).resolves.toBeTruthy();
  });

  it("contains guestFirstName and weddingName", async () => {
    const html = await render(RsvpConfirmationEmail(baseProps));
    expect(html).toContain("Ava");
    expect(html).toContain("Ava &amp; Sam&#x27;s Wedding");
  });

  it("contains each household member name and status", async () => {
    const html = await render(RsvpConfirmationEmail(baseProps));
    expect(html).toContain("Ava Rivera");
    expect(html).toContain("Joyfully attending");
    expect(html).toContain("Sam Rivera");
    expect(html).toContain("Still deciding");
  });

  it("includes CTA button when rsvpUrl is set", async () => {
    const html = await render(RsvpConfirmationEmail(baseProps));
    expect(html).toContain("https://kaiplan.app/w/ava-sam?token=abc#rsvp");
  });

  it("omits CTA button when rsvpUrl is null", async () => {
    const html = await render(
      RsvpConfirmationEmail({ ...baseProps, rsvpUrl: null }),
    );
    expect(html).not.toContain("Review or update your RSVP");
  });

  it("renders unsubscribe link with manageUrl", async () => {
    const html = await render(
      RsvpConfirmationEmail({
        ...baseProps,
        manageUrl: "https://kaiplan.app/manage",
      }),
    );
    expect(html).toContain("https://kaiplan.app/manage");
    expect(html).toContain("Manage your email preferences");
  });

  it("omits formatted date when weddingDate is null", async () => {
    const html = await render(
      RsvpConfirmationEmail({ ...baseProps, weddingDate: null }),
    );
    expect(html).not.toContain("·");
  });
});

describe("RsvpReminderEmail", () => {
  const props = {
    guestFirstName: "Ava",
    weddingName: "Ava & Sam's Wedding",
    weddingDate: "2026-06-07",
    rsvpUrl: "https://kaiplan.app/w/ava-sam?token=abc#rsvp",
    manageUrl: "https://kaiplan.app/manage",
  };

  it("renders without throwing", async () => {
    await expect(render(RsvpReminderEmail(props))).resolves.toBeTruthy();
  });

  it("contains guestFirstName and weddingName", async () => {
    const html = await render(RsvpReminderEmail(props));
    expect(html).toContain("Ava");
    expect(html).toContain("Ava &amp; Sam&#x27;s Wedding");
  });

  it("contains CTA with rsvpUrl", async () => {
    const html = await render(RsvpReminderEmail(props));
    expect(html).toContain("https://kaiplan.app/w/ava-sam?token=abc#rsvp");
  });

  it("omits formatted date when weddingDate is null", async () => {
    const html = await render(
      RsvpReminderEmail({ ...props, weddingDate: null }),
    );
    expect(html).not.toContain("·");
  });
});

describe("MemberInviteEmail", () => {
  const props = {
    invitedByName: "Angel",
    weddingName: "Ava & Sam's Wedding",
    role: "editor",
    inviteUrl: "https://kaiplan.app/login",
  };

  it("renders without throwing", async () => {
    await expect(render(MemberInviteEmail(props))).resolves.toBeTruthy();
  });

  it("contains inviter name, wedding name, role, and invite URL", async () => {
    const html = await render(MemberInviteEmail(props));
    expect(html).toContain("Angel");
    expect(html).toContain("Ava &amp; Sam&#x27;s Wedding");
    expect(html).toContain("editor");
    expect(html).toContain("https://kaiplan.app/login");
  });

  it("does not contain unsubscribe text", async () => {
    const html = await render(MemberInviteEmail(props));
    expect(html).not.toContain("Manage your email preferences");
    expect(html).not.toContain("unsubscribe");
  });
});

describe("PasswordResetEmail", () => {
  it("renders without throwing", async () => {
    await expect(
      render(
        PasswordResetEmail({ resetUrl: "https://kaiplan.app/reset?t=abc" }),
      ),
    ).resolves.toBeTruthy();
  });

  it("contains reset URL", async () => {
    const html = await render(
      PasswordResetEmail({ resetUrl: "https://kaiplan.app/reset?t=abc" }),
    );
    expect(html).toContain("https://kaiplan.app/reset?t=abc");
  });
});

describe("SubscribeNudgeEmail", () => {
  it("renders the subscribe CTA and email preference footer", async () => {
    const html = await render(
      SubscribeNudgeEmail({
        name: "Alex",
        subjectFocus: "guest list",
        body: "Your guest list, budget, and website can all live in one calm workspace.",
        ctaLabel: "Start your trial",
        subscribeUrl: "https://app.kaiplan.app/subscribe",
        manageEmailPrefsUrl:
          "https://app.kaiplan.app/email-preferences?token=abc",
      }),
    );

    expect(html).toContain("Alex");
    expect(html).toContain("guest list");
    expect(html).toContain("https://app.kaiplan.app/subscribe");
    expect(html).toContain("Start your trial");
    expect(html).toContain("Manage your email preferences");
  });
});

describe("TrialActivationNudgeEmail", () => {
  it("renders the dashboard CTA and trial guidance", async () => {
    const html = await render(
      TrialActivationNudgeEmail({
        name: "Alex",
        featureFocus: "vendor planning",
        body: "Use your trial to compare quotes and keep every vendor decision tidy.",
        ctaLabel: "Open vendors",
        dashboardUrl: "https://app.kaiplan.app/vendors",
        manageEmailPrefsUrl:
          "https://app.kaiplan.app/email-preferences?token=abc",
      }),
    );

    expect(html).toContain("Alex");
    expect(html).toContain("vendor planning");
    expect(html).toContain("https://app.kaiplan.app/vendors");
    expect(html).toContain("Open vendors");
    expect(html).toContain("Manage your email preferences");
  });
});

describe("TrialEndingReminderEmail", () => {
  const baseProps = {
    name: "Alex",
    planName: "Pro",
    trialStartedOn: "April 20, 2026",
    chargeOn: "May 20, 2026",
    amountLabel: "$35.00/month",
    manageBillingUrl: "https://app.kaiplan.app/settings?tab=billing",
    manageEmailPrefsUrl: "https://app.kaiplan.app/settings?tab=notifications",
  };

  it("renders without throwing", async () => {
    await expect(
      render(TrialEndingReminderEmail(baseProps)),
    ).resolves.toBeTruthy();
  });

  it("renders the manage-billing CTA link", async () => {
    const html = await render(TrialEndingReminderEmail(baseProps));
    expect(html).toContain("https://app.kaiplan.app/settings?tab=billing");
    expect(html).toContain("Manage billing");
  });

  it("renders the email-preference link in the footer", async () => {
    const html = await render(TrialEndingReminderEmail(baseProps));
    expect(html).toContain(
      "https://app.kaiplan.app/settings?tab=notifications",
    );
    expect(html).toContain("Manage your email preferences");
  });

  it("renders trial dates and amount label", async () => {
    const html = await render(TrialEndingReminderEmail(baseProps));
    expect(html).toContain("April 20, 2026");
    expect(html).toContain("May 20, 2026");
    expect(html).toContain("$35.00/month");
  });

  it("the footer email-prefs link is the only unsubscribe — Manage billing is the primary CTA", async () => {
    const html = await render(TrialEndingReminderEmail(baseProps));
    const billingMatches = html.match(/Manage billing/g) ?? [];
    expect(billingMatches.length).toBe(1);
    const prefsMatches = html.match(/Manage your email preferences/g) ?? [];
    expect(prefsMatches.length).toBe(1);
  });

  it("omits the email-preference footer when manageEmailPrefsUrl is not provided", async () => {
    // The prop is optional to keep older call sites compiling. When omitted
    // the Layout receives `unsubscribeUrl=null` and the footer link must be
    // suppressed.
    const { manageEmailPrefsUrl: _omit, ...without } = baseProps;
    void _omit;
    const html = await render(TrialEndingReminderEmail(without));
    expect(html).not.toContain("Manage your email preferences");
  });
});
