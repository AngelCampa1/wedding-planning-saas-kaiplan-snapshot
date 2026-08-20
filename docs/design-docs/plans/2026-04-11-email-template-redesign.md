# Email Template Redesign + RSVP URL Fix Implementation Plan


**Goal:** Fix the RSVP URL bug (uses `weddingId` instead of `publishedSlug`), redesign all four email templates with Kaiplan brand styling, and enrich RSVP emails with guest and wedding context loaded via raw DB queries.

**Architecture:** All changes in `apps/api` and `packages/shared`. `email-templates.tsx` gets a full redesign with inline brand tokens. `email.ts` gets raw `db.select()` queries (no Drizzle relations) to load context before rendering. `packages/shared/src/email-schemas.ts` gets a new `"skippedNoWebsite"` status value.

**Tech Stack:** React Email (`@react-email/components`, `@react-email/render`), Resend, Drizzle ORM raw queries, Vitest

---

## Task 1: Add `skippedNoWebsite` to shared schema

**Files:**
- Modify: `packages/shared/src/email-schemas.ts`

- [ ] **Step 1: Write the failing test**

  In `packages/shared/__tests__/email-schemas.test.ts`, add:

  ```typescript
  it("includes skippedNoWebsite in reminderDeliveryResultSchema status", () => {
    const result = reminderDeliveryResultSchema.parse({
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      guestEmail: "test@example.com",
      status: "skippedNoWebsite",
      emailId: null,
      error: null,
    });
    expect(result.status).toBe("skippedNoWebsite");
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm --filter @kaiplan/shared test
  ```

  Expected: ZodError — `"skippedNoWebsite"` not in enum.

- [ ] **Step 3: Add the new status to the enum**

  In `packages/shared/src/email-schemas.ts`, change the `reminderDeliveryResultSchema` status enum:

  ```typescript
  status: z.enum([
    "sent",
    "skippedOptedOut",
    "skippedMissingEmail",
    "skippedIneligible",
    "skippedNoWebsite",
    "failed",
  ]),
  ```

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  pnpm --filter @kaiplan/shared test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/shared/src/email-schemas.ts packages/shared/__tests__/
  git commit -m "feat(shared): add skippedNoWebsite to reminderDeliveryResultSchema"
  ```

---

## Task 2: Redesign email templates

**Files:**
- Modify: `apps/api/src/lib/email-templates.tsx`
- Create: `apps/api/__tests__/lib/email-templates.test.tsx`

- [ ] **Step 1: Write failing tests first**

  Create `apps/api/__tests__/lib/email-templates.test.tsx`:

  ```tsx
  import { describe, expect, it } from "vitest";
  import { render } from "@react-email/render";
  import {
    CtaButton,
    MemberInviteEmail,
    PasswordResetEmail,
    RsvpConfirmationEmail,
    RsvpReminderEmail,
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
      const html = await render(CtaButton({ href: "https://example.com", children: "Click me" }));
      expect(html).toContain('href="https://example.com"');
      expect(html).toContain("Click me");
    });
    it("renders green background color", async () => {
      const html = await render(CtaButton({ href: "https://example.com", children: "Go" }));
      expect(html).toContain("#7C9A82");
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
      await expect(render(RsvpConfirmationEmail(baseProps))).resolves.toBeTruthy();
    });

    it("contains guestFirstName and weddingName", async () => {
      const html = await render(RsvpConfirmationEmail(baseProps));
      expect(html).toContain("Ava");
      expect(html).toContain("Ava & Sam's Wedding");
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
      const html = await render(RsvpConfirmationEmail({ ...baseProps, rsvpUrl: null }));
      expect(html).not.toContain("Review or update your RSVP");
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
      expect(html).toContain("Ava & Sam's Wedding");
    });

    it("contains CTA with rsvpUrl", async () => {
      const html = await render(RsvpReminderEmail(props));
      expect(html).toContain("https://kaiplan.app/w/ava-sam?token=abc#rsvp");
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
      expect(html).toContain("Ava & Sam's Wedding");
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
      await expect(render(PasswordResetEmail({ resetUrl: "https://kaiplan.app/reset?t=abc" }))).resolves.toBeTruthy();
    });

    it("contains reset URL", async () => {
      const html = await render(PasswordResetEmail({ resetUrl: "https://kaiplan.app/reset?t=abc" }));
      expect(html).toContain("https://kaiplan.app/reset?t=abc");
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/api test __tests__/lib/email-templates.test.tsx
  ```

  Expected: imports fail — `CtaButton` and `rsvpLabel` don't exist; existing templates have wrong props.

- [ ] **Step 3: Rewrite `email-templates.tsx`**

  Replace the entire file content with:

  ```tsx
  import * as React from "react";

  // Brand tokens (inline — email clients don't support CSS variables)
  const BRAND = {
    bg: "#f8f8f6",
    card: "#ffffff",
    cardBorder: "#e5e7eb",
    headingFont: 'Georgia, "Times New Roman", serif',
    bodyFont: "Arial, Helvetica, sans-serif",
    green: "#7C9A82",
    gold: "#C5A55A",
    muted: "#8A8478",
    text: "#1f2937",
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
          backgroundColor: BRAND.green,
          color: "#ffffff",
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
            <div style={{ fontSize: "16px", lineHeight: "1.6", color: BRAND.text }}>
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
    // Parse the ISO date string as a local date to avoid UTC timezone shifting
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(year, (month ?? 1) - 1, day ?? 1);
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
      <Layout
        title="Your RSVP is in!"
        unsubscribeUrl={props.manageUrl}
      >
        <p>Hi {props.guestFirstName},</p>
        <p>We've received your RSVP for {props.weddingName}. Here's a summary of your household:</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}>
          <tbody>
            {props.householdSummary.map((member) => (
              <tr key={member.name}>
                <td style={{ padding: "6px 0", fontWeight: "600" }}>{member.name}</td>
                <td style={{ padding: "6px 0", color: BRAND.muted, textAlign: "right" }}>{member.status}</td>
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
          The couple is still waiting on your household's RSVP for{" "}
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
          {props.invitedByName} invited you to collaborate on{" "}
          {props.weddingName} as a {props.role}.
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
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/api test __tests__/lib/email-templates.test.tsx
  ```

- [ ] **Step 5: Check coverage for email-templates.tsx**

  ```bash
  pnpm --filter @kaiplan/api test:coverage -- --reporter=text 2>&1 | grep email-templates
  ```

  Expected: ≥ 95%.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/src/lib/email-templates.tsx apps/api/__tests__/lib/email-templates.test.tsx
  git commit -m "feat(api): redesign email templates with brand tokens and new props"
  ```

---

## Task 3: Fix `sendRsvpConfirmation` in `email.ts`

**Files:**
- Modify: `apps/api/src/lib/email.ts`
- Modify: `apps/api/__tests__/lib/email.test.ts`

Need to: (1) query `weddingWebsite` for `publishedSlug`, (2) use `publishedSlug` in URL or pass null, (3) query primary guest + plus-ones, (4) query wedding name/date, (5) build household summary, (6) pass new props to template.

- [ ] **Step 1: Read the existing email.test.ts to understand mock patterns**

  Read `apps/api/__tests__/lib/email.test.ts` fully before writing new tests.

- [ ] **Step 2: Write failing tests for `sendRsvpConfirmation`**

  In `apps/api/__tests__/lib/email.test.ts`, in the `sendRsvpConfirmation` describe block, add:

  ```typescript
  it("sends with rsvpUrl: null when publishedSlug is null", async () => {
    // Mock db.select chain to return: weddingWebsite with null slug,
    // primary guest, no plus-ones, wedding row
    // Assert that RsvpConfirmationEmail was called with rsvpUrl: null
    // Assert sendMessage was still called (email still goes out)
  });

  it("uses publishedSlug in rsvpUrl when present", async () => {
    // Mock weddingWebsite to return publishedSlug: "ava-sam-2026"
    // Assert rsvpUrl contains "ava-sam-2026"
  });

  it("includes correct householdSummary with plus-ones", async () => {
    // Mock primary guest + 1 plus-one
    // Assert householdSummary has 2 entries with correct names and rsvpLabel'd statuses
  });
  ```

  (Fill in the mock shapes using the same `vi.fn()` chain pattern already established in the file. Read the existing file first to copy the exact mock setup.)

- [ ] **Step 3: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/api test __tests__/lib/email.test.ts -- --reporter=verbose 2>&1 | grep -A3 "rsvpConfirmation"
  ```

- [ ] **Step 4: Update `sendRsvpConfirmation` in `email.ts`**

  Add these imports at the top of the file (if not already present):
  ```typescript
  import { guest, wedding, weddingWebsite } from "../db/schema";
  ```

  Replace the `sendRsvpConfirmation` method body:

  ```typescript
  async sendRsvpConfirmation(input) {
    const enabled = await loadPreferenceValue(db, {
      email: input.guestEmail,
      weddingId: input.weddingId,
      preferenceType: "rsvpConfirmation",
    });
    if (!enabled) {
      return;
    }

    try {
      // Load publishedSlug (nullable)
      const [websiteRow] = await db
        .select({ publishedSlug: weddingWebsite.publishedSlug })
        .from(weddingWebsite)
        .where(eq(weddingWebsite.weddingId, input.weddingId))
        .limit(1);

      const rsvpUrl = websiteRow?.publishedSlug
        ? `${env.APP_URL.replace(/\/$/, "")}/w/${websiteRow.publishedSlug}?token=${input.token}#rsvp`
        : null;

      // Load primary guest
      const [primaryGuest] = await db
        .select({
          firstName: guest.firstName,
          lastName: guest.lastName,
          rsvpStatus: guest.rsvpStatus,
        })
        .from(guest)
        .where(eq(guest.id, input.primaryGuestId))
        .limit(1);

      // Load plus-ones
      const plusOnes = await db
        .select({
          firstName: guest.firstName,
          lastName: guest.lastName,
          rsvpStatus: guest.rsvpStatus,
        })
        .from(guest)
        .where(eq(guest.primaryGuestId, input.primaryGuestId));

      // Load wedding name + date
      const [weddingRow] = await db
        .select({ name: wedding.name, date: wedding.date })
        .from(wedding)
        .where(eq(wedding.id, input.weddingId))
        .limit(1);

      // Build household summary
      const householdSummary = [
        {
          name: `${primaryGuest.firstName} ${primaryGuest.lastName}`,
          status: rsvpLabel(primaryGuest.rsvpStatus ?? "pending"),
        },
        ...plusOnes.map((po) => ({
          name: `${po.firstName} ${po.lastName}`,
          status: rsvpLabel(po.rsvpStatus ?? "pending"),
        })),
      ];

      const manageUrl = await createManagePreferencesUrl(db, env, {
        email: input.guestEmail,
        weddingId: input.weddingId,
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
      });

      const html = await render(
        RsvpConfirmationEmail({
          guestFirstName: primaryGuest.firstName,
          weddingName: weddingRow.name,
          weddingDate: weddingRow.date ?? null,
          householdSummary,
          rsvpUrl,
          manageUrl,
        }),
      );

      const emailId = await sendMessage(getResendClient(), env, {
        to: input.guestEmail,
        subject: `Your RSVP is confirmed — ${weddingRow.name}`,
        html,
      });

      await recordSend(db, {
        email: input.guestEmail,
        weddingId: input.weddingId,
        emailType: "rsvpConfirmation",
        status: "sent",
        providerMessageId: emailId,
      });
    } catch (error) {
      await logFailureAndRethrow(
        db,
        {
          email: input.guestEmail,
          weddingId: input.weddingId,
          emailType: "rsvpConfirmation",
        },
        error,
      );
    }
  },
  ```

  Also add `import { rsvpLabel } from "./email-templates";` to the imports at the top.

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/api test __tests__/lib/email.test.ts
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/src/lib/email.ts apps/api/__tests__/lib/email.test.ts
  git commit -m "fix(api): sendRsvpConfirmation uses publishedSlug, loads household context"
  ```

---

## Task 4: Fix `sendRsvpReminder` in `email.ts`

**Files:**
- Modify: `apps/api/src/lib/email.ts`
- Modify: `apps/api/__tests__/lib/email.test.ts`

Need to: gate on `publishedSlug` (return `skippedNoWebsite` if null), load `guest.firstName` + `wedding.name`/`date`, pass new props.

- [ ] **Step 1: Write failing tests for `sendRsvpReminder`**

  In `apps/api/__tests__/lib/email.test.ts`, in the `sendRsvpReminder` describe block, add:

  ```typescript
  it("returns skippedNoWebsite when publishedSlug is null", async () => {
    // Mock weddingWebsite returning null publishedSlug
    // Assert return value: { status: "skippedNoWebsite", emailId: null, error: null }
    // Assert sendMessage was NOT called
  });

  it("uses publishedSlug in rsvpUrl when present", async () => {
    // Mock weddingWebsite returning publishedSlug: "ava-sam-2026"
    // Assert rsvpUrl passed to template contains "ava-sam-2026"
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/api test __tests__/lib/email.test.ts -- --reporter=verbose 2>&1 | grep -A3 "rsvpReminder"
  ```

- [ ] **Step 3: Update `sendRsvpReminder` in `email.ts`**

  After the `!input.token` early return and the preference check, add the `publishedSlug` query and gate:

  ```typescript
  // Load publishedSlug — skip reminder if website not published
  const [websiteRow] = await db
    .select({ publishedSlug: weddingWebsite.publishedSlug })
    .from(weddingWebsite)
    .where(eq(weddingWebsite.weddingId, input.weddingId))
    .limit(1);

  if (!websiteRow?.publishedSlug) {
    return {
      primaryGuestId: input.primaryGuestId,
      guestEmail: input.guestEmail,
      status: "skippedNoWebsite",
      emailId: null,
      error: null,
    };
  }

  const rsvpUrl = `${env.APP_URL.replace(/\/$/, "")}/w/${websiteRow.publishedSlug}?token=${input.token}#rsvp`;

  // Load guest firstName
  const [primaryGuest] = await db
    .select({ firstName: guest.firstName })
    .from(guest)
    .where(eq(guest.id, input.primaryGuestId))
    .limit(1);

  // Load wedding name + date
  const [weddingRow] = await db
    .select({ name: wedding.name, date: wedding.date })
    .from(wedding)
    .where(eq(wedding.id, input.weddingId))
    .limit(1);
  ```

  Then update the `render` call to use new template props:

  ```typescript
  const html = await render(
    RsvpReminderEmail({
      guestFirstName: primaryGuest.firstName,
      weddingName: weddingRow.name,
      weddingDate: weddingRow.date ?? null,
      rsvpUrl,
      manageUrl,
    }),
  );
  ```

  Update subject: `subject: \`RSVP reminder from ${weddingRow.name}\``

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/api test __tests__/lib/email.test.ts
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/lib/email.ts apps/api/__tests__/lib/email.test.ts
  git commit -m "fix(api): sendRsvpReminder gates on publishedSlug, loads guest + wedding context"
  ```

---

## Task 5: Fix `sendMemberInvite` in `email.ts`

**Files:**
- Modify: `apps/api/src/lib/email.ts`
- Modify: `apps/api/__tests__/lib/email.test.ts`

Need to: add `wedding.name` query, remove `createManagePreferencesUrl` call, pass `weddingName` to template, remove `unsubscribeUrl` from template call.

- [ ] **Step 1: Write failing test for `sendMemberInvite`**

  In `apps/api/__tests__/lib/email.test.ts`, in the `sendMemberInvite` describe block, add:

  ```typescript
  it("passes weddingName to the template", async () => {
    // Mock wedding query returning name: "Ava & Sam's Wedding"
    // Assert MemberInviteEmail was called with weddingName: "Ava & Sam's Wedding"
  });

  it("does not create an unsubscribe token", async () => {
    // Assert createManagePreferencesUrl was NOT called during sendMemberInvite
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/api test __tests__/lib/email.test.ts -- --reporter=verbose 2>&1 | grep -A3 "memberInvite"
  ```

- [ ] **Step 3: Update `sendMemberInvite` in `email.ts`**

  Inside the `try` block, before `render`:

  1. Remove the `createManagePreferencesUrl` call entirely.
  2. Add wedding name query:

  ```typescript
  const [weddingRow] = await db
    .select({ name: wedding.name })
    .from(wedding)
    .where(eq(wedding.id, input.weddingId))
    .limit(1);
  ```

  3. Update the `render` call:

  ```typescript
  const html = await render(
    MemberInviteEmail({
      invitedByName: input.invitedBy.name,
      weddingName: weddingRow.name,
      role: input.role,
      inviteUrl: `${env.APP_URL.replace(/\/$/, "")}/login`,
    }),
  );
  ```

  4. Update subject: `subject: \`${input.invitedBy.name} invited you to ${weddingRow.name} on Kaiplan\``

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/api test __tests__/lib/email.test.ts
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/lib/email.ts apps/api/__tests__/lib/email.test.ts
  git commit -m "feat(api): sendMemberInvite includes weddingName, removes unsubscribe token"
  ```

---

## Task 6: Run full coverage gate and fix gaps

**Files:**
- Modify: `apps/api/__tests__/lib/email.test.ts` (add any missing branches)
- Modify: `apps/api/__tests__/lib/email-templates.test.tsx` (add any missing branches)

- [ ] **Step 1: Run API coverage**

  ```bash
  pnpm --filter @kaiplan/api test:coverage -- --reporter=text 2>&1 | grep -E "email-templates|email\.ts"
  ```

  Expected: ≥ 95% for both files.

- [ ] **Step 2: If below 95% on email.ts, identify missing branches**

  ```bash
  pnpm --filter @kaiplan/api test:coverage -- --reporter=text 2>&1 | grep -A5 "email\.ts"
  ```

  Common gaps: the `primaryGuest` / `weddingRow` not-found case, the error path in `sendRsvpConfirmation`. Write tests for each uncovered line.

- [ ] **Step 3: Run typecheck**

  ```bash
  pnpm --filter @kaiplan/api run typecheck
  ```

  Fix all type errors before continuing.

- [ ] **Step 4: Run lint**

  ```bash
  pnpm --filter @kaiplan/api run lint
  ```

- [ ] **Step 5: Run shared package typecheck (the enum change may affect it)**

  ```bash
  pnpm --filter @kaiplan/shared run typecheck
  pnpm --filter @kaiplan/shared test:coverage
  ```

- [ ] **Step 6: Final commit if any coverage fixes were needed**

  ```bash
  git add apps/api/ packages/shared/
  git commit -m "test(api): close coverage gaps on email.ts and email-templates.tsx"
  ```

---

## Verification

Before declaring done:

1. `pnpm --filter @kaiplan/api test:coverage` — `email-templates.tsx` and `email.ts` ≥ 95%
2. `pnpm --filter @kaiplan/shared test:coverage` — `email-schemas.ts` ≥ 95%
3. `pnpm run typecheck` — clean
4. `pnpm run lint` — clean
