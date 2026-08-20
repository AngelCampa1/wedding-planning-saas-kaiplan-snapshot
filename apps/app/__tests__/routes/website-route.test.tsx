import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";

const routeContext = {
  auth: {
    user: {
      name: "Angel Campa",
      email: "angel@example.com",
    },
  },
};

const PRIMARY_GUEST_ID = "guest-1";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  createFileRoute: () => () => ({
    useRouteContext: () => routeContext,
  }),
}));

vi.mock("../../src/components/top-bar", () => ({
  TopBar: ({ onSelectWedding }: { onSelectWedding: (id: string) => void }) => (
    <div>
      <button type="button" onClick={() => onSelectWedding("wedding-2")}>
        Switch wedding
      </button>
    </div>
  ),
}));

vi.mock("../../src/lib/wedding-context", () => ({
  useActiveWedding: vi.fn(),
}));

vi.mock("../../src/hooks/use-weddings", () => ({
  useWeddings: vi.fn(),
}));

vi.mock("../../src/hooks/use-guests", () => ({
  useGuests: vi.fn(),
}));

vi.mock("../../src/hooks/use-billing", () => ({
  useBillingSummary: vi.fn(),
}));

vi.mock("../../src/hooks/use-website", () => ({
  useWeddingWebsite: vi.fn(),
  useSaveWeddingWebsite: vi.fn(),
  usePublishWeddingWebsite: vi.fn(),
  useUnpublishWeddingWebsite: vi.fn(),
  useWeddingWebsiteSlugAvailability: vi.fn(),
  useWeddingWebsiteHouseholdToken: vi.fn(),
  useCreateWeddingWebsiteHouseholdToken: vi.fn(),
  useWeddingWebsiteHeroUploadIntent: vi.fn(),
  useSendWeddingWebsiteRsvpReminders: vi.fn(),
}));

import { useActiveWedding } from "../../src/lib/wedding-context";
import { useBillingSummary } from "../../src/hooks/use-billing";
import { useWeddings } from "../../src/hooks/use-weddings";
import { useGuests } from "../../src/hooks/use-guests";
import {
  useCreateWeddingWebsiteHouseholdToken,
  usePublishWeddingWebsite,
  useSaveWeddingWebsite,
  useSendWeddingWebsiteRsvpReminders,
  useUnpublishWeddingWebsite,
  useWeddingWebsite,
  useWeddingWebsiteHeroUploadIntent,
  useWeddingWebsiteHouseholdToken,
  useWeddingWebsiteSlugAvailability,
} from "../../src/hooks/use-website";
import { DEFAULT_PUBLIC_SITE_URL } from "../../src/lib/public-site-url";
import { WebsitePage } from "../../src/routes/_authenticated/website";

// Keep invite/public URL expectations anchored to the single source of truth
// the route reads from (lib/public-site-url.ts) so port drift can't silently
// regress the test.
const INVITE_URL = `${DEFAULT_PUBLIC_SITE_URL}/w/angel-and-sam/?token=token-1#rsvp`;
const PUBLIC_URL_ANNA = `${DEFAULT_PUBLIC_SITE_URL}/w/anna-and-lee/`;
const PUBLIC_URL_ANGEL = `${DEFAULT_PUBLIC_SITE_URL}/w/angel-and-sam/`;

const mockedUseActiveWedding = vi.mocked(useActiveWedding);
const mockedUseBillingSummary = vi.mocked(useBillingSummary);
const mockedUseWeddings = vi.mocked(useWeddings);
const mockedUseGuests = vi.mocked(useGuests);
const mockedUseWeddingWebsite = vi.mocked(useWeddingWebsite);
const mockedUseSaveWeddingWebsite = vi.mocked(useSaveWeddingWebsite);
const mockedUsePublishWeddingWebsite = vi.mocked(usePublishWeddingWebsite);
const mockedUseUnpublishWeddingWebsite = vi.mocked(useUnpublishWeddingWebsite);
const mockedUseWeddingWebsiteSlugAvailability = vi.mocked(
  useWeddingWebsiteSlugAvailability,
);
const mockedUseWeddingWebsiteHouseholdToken = vi.mocked(
  useWeddingWebsiteHouseholdToken,
);
const mockedUseCreateWeddingWebsiteHouseholdToken = vi.mocked(
  useCreateWeddingWebsiteHouseholdToken,
);
const mockedUseWeddingWebsiteHeroUploadIntent = vi.mocked(
  useWeddingWebsiteHeroUploadIntent,
);
const mockedUseSendWeddingWebsiteRsvpReminders = vi.mocked(
  useSendWeddingWebsiteRsvpReminders,
);

describe("WebsitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseWeddings.mockReturnValue({
      data: [
        { id: "wedding-1", name: "Angel & Sam", role: "owner" },
        { id: "wedding-2", name: "Mia & Noah", role: "editor" },
      ],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "starter",
        status: "active",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        features: ["weddingWebsite"],
        canManageBilling: true,
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseActiveWedding.mockReturnValue({
      activeWeddingId: "wedding-1",
      setActiveWeddingId: vi.fn(),
      setWeddingSwitchGuard: vi.fn(),
    } as ReturnType<typeof useActiveWedding>);
    mockedUseWeddingWebsite.mockReturnValue({
      data: {
        weddingId: "wedding-1",
        slug: "angel-and-sam",
        publishedSlug: "angel-and-sam",
        template: "classic",
        content: {
          hero: {
            title: "Angel & Sam",
            subtitle: "June 12, 2026",
            body: "Celebrate with us.",
            ctaLabel: "RSVP",
          },
          story: {
            title: "Our Story",
            body: "We met at sunset.",
          },
          venue: {
            name: "Casa Agave",
            address: "123 Garden St",
            details: "",
            mapUrl: null,
          },
          registry: {
            title: "Registry",
            url: null,
            details: "",
          },
          rsvp: {
            visible: true,
            headline: "Please RSVP",
            details: "",
          },
          heroImage: null,
        },
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useWeddingWebsite>);
    mockedUseGuests.mockReturnValue({
      data: [
        {
          id: PRIMARY_GUEST_ID,
          firstName: "Alice",
          lastName: "Smith",
          email: "alice@example.com",
          primaryGuestId: null,
          plusOnes: [],
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useGuests>);
    mockedUseSaveWeddingWebsite.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useSaveWeddingWebsite>);
    mockedUsePublishWeddingWebsite.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof usePublishWeddingWebsite>);
    mockedUseUnpublishWeddingWebsite.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useUnpublishWeddingWebsite>);
    mockedUseWeddingWebsiteSlugAvailability.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useWeddingWebsiteSlugAvailability>);
    mockedUseWeddingWebsiteHouseholdToken.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useWeddingWebsiteHouseholdToken>);
    mockedUseCreateWeddingWebsiteHouseholdToken.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        token: "token-1",
      }),
      isPending: false,
    } as ReturnType<typeof useCreateWeddingWebsiteHouseholdToken>);
    mockedUseWeddingWebsiteHeroUploadIntent.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useWeddingWebsiteHeroUploadIntent>);
    mockedUseSendWeddingWebsiteRsvpReminders.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useSendWeddingWebsiteRsvpReminders>);
  });

  it("generates an invite link without performing a token lookup first", async () => {
    const user = userEvent.setup();
    const createToken = vi.fn().mockResolvedValue({ token: "token-1" });
    const lookupToken = vi.fn();

    mockedUseCreateWeddingWebsiteHouseholdToken.mockReturnValue({
      mutateAsync: createToken,
      isPending: false,
    } as ReturnType<typeof useCreateWeddingWebsiteHouseholdToken>);
    mockedUseWeddingWebsiteHouseholdToken.mockReturnValue({
      mutateAsync: lookupToken,
      isPending: false,
    } as ReturnType<typeof useWeddingWebsiteHouseholdToken>);

    render(<WebsitePage />);

    await user.click(
      screen.getByRole("button", { name: "Generate invite link" }),
    );

    expect(createToken).toHaveBeenCalledWith(PRIMARY_GUEST_ID);
    expect(lookupToken).not.toHaveBeenCalled();
    expect(await screen.findByText("Invite link ready.")).toBeInTheDocument();
    expect(await screen.findByText(INVITE_URL)).toBeInTheDocument();
  });

  it("lets viewers show an existing invite link without creating a token", async () => {
    const user = userEvent.setup();
    const createToken = vi.fn();
    const lookupToken = vi.fn().mockResolvedValue({ token: "token-1" });

    mockedUseWeddings.mockReturnValue({
      data: [{ id: "wedding-1", name: "Angel & Sam", role: "viewer" }],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mockedUseCreateWeddingWebsiteHouseholdToken.mockReturnValue({
      mutateAsync: createToken,
      isPending: false,
    } as ReturnType<typeof useCreateWeddingWebsiteHouseholdToken>);
    mockedUseWeddingWebsiteHouseholdToken.mockReturnValue({
      mutateAsync: lookupToken,
      isPending: false,
    } as ReturnType<typeof useWeddingWebsiteHouseholdToken>);

    render(<WebsitePage />);

    expect(
      screen.getByText(
        "Show the private RSVP link for each primary guest. Their plus-ones ride on the same token.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show invite link" }));

    expect(lookupToken).toHaveBeenCalledWith(PRIMARY_GUEST_ID);
    expect(createToken).not.toHaveBeenCalled();
    expect(await screen.findByText("Invite link ready.")).toBeInTheDocument();
    expect(await screen.findByText(INVITE_URL)).toBeInTheDocument();
  });

  it("clears the displayed invite link when the selected household changes", async () => {
    const user = userEvent.setup();
    const createToken = vi.fn().mockResolvedValue({ token: "token-1" });

    mockedUseGuests.mockReturnValue({
      data: [
        {
          id: PRIMARY_GUEST_ID,
          firstName: "Alice",
          lastName: "Smith",
          email: "alice@example.com",
          primaryGuestId: null,
          plusOnes: [],
        },
        {
          id: "guest-2",
          firstName: "Mia",
          lastName: "Cole",
          email: "mia@example.com",
          primaryGuestId: null,
          plusOnes: [],
        },
      ],
      isLoading: false,
    } as ReturnType<typeof useGuests>);
    mockedUseCreateWeddingWebsiteHouseholdToken.mockReturnValue({
      mutateAsync: createToken,
      isPending: false,
    } as ReturnType<typeof useCreateWeddingWebsiteHouseholdToken>);

    render(<WebsitePage />);

    await user.click(
      screen.getByRole("button", { name: "Generate invite link" }),
    );

    expect(await screen.findByText(INVITE_URL)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Primary guest"), "guest-2");

    expect(screen.queryByText(INVITE_URL)).not.toBeInTheDocument();
  });

  it("keeps the invite action disabled when a wedding has no primary guests", async () => {
    const user = userEvent.setup();
    const createToken = vi.fn().mockResolvedValue({ token: "token-1" });
    let guestList = [
      {
        id: PRIMARY_GUEST_ID,
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@example.com",
        primaryGuestId: null,
        plusOnes: [],
      },
    ];

    mockedUseGuests.mockImplementation(
      () =>
        ({
          data: guestList,
          isLoading: false,
        }) as ReturnType<typeof useGuests>,
    );
    mockedUseCreateWeddingWebsiteHouseholdToken.mockReturnValue({
      mutateAsync: createToken,
      isPending: false,
    } as ReturnType<typeof useCreateWeddingWebsiteHouseholdToken>);

    const { rerender } = render(<WebsitePage />);

    await user.click(
      screen.getByRole("button", { name: "Generate invite link" }),
    );

    guestList = [];
    rerender(<WebsitePage />);

    expect(
      screen.getByRole("button", { name: "Generate invite link" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Primary guest")).toHaveValue("");
  });

  it("hides stale household actions while the next wedding's guests are still loading", () => {
    let activeWeddingId = "wedding-1";

    mockedUseActiveWedding.mockImplementation(
      () =>
        ({
          activeWeddingId,
          setActiveWeddingId: vi.fn(),
          setWeddingSwitchGuard: vi.fn(),
        }) as ReturnType<typeof useActiveWedding>,
    );
    mockedUseGuests.mockImplementation((weddingId) => {
      if (weddingId === "wedding-2") {
        return {
          data: [
            {
              id: PRIMARY_GUEST_ID,
              firstName: "Alice",
              lastName: "Smith",
              email: "alice@example.com",
              primaryGuestId: null,
              plusOnes: [],
            },
          ],
          isLoading: true,
        } as ReturnType<typeof useGuests>;
      }

      return {
        data: [
          {
            id: PRIMARY_GUEST_ID,
            firstName: "Alice",
            lastName: "Smith",
            email: "alice@example.com",
            primaryGuestId: null,
            plusOnes: [],
          },
        ],
        isLoading: false,
      } as ReturnType<typeof useGuests>;
    });

    const { rerender } = render(<WebsitePage />);

    expect(
      screen.getByRole("option", { name: "Alice Smith" }),
    ).toBeInTheDocument();

    activeWeddingId = "wedding-2";
    rerender(<WebsitePage />);

    expect(
      screen.queryByRole("option", { name: "Alice Smith" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Loading guests..." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate invite link" }),
    ).toBeDisabled();
  });

  it("clears the selected primary guest when the next wedding has no households", async () => {
    const user = userEvent.setup();
    let activeWeddingId = "wedding-1";

    mockedUseActiveWedding.mockImplementation(
      () =>
        ({
          activeWeddingId,
          setActiveWeddingId: vi.fn(),
          setWeddingSwitchGuard: vi.fn(),
        }) as ReturnType<typeof useActiveWedding>,
    );
    mockedUseGuests.mockImplementation((weddingId) => {
      if (weddingId === "wedding-2") {
        return {
          data: [],
          isLoading: false,
        } as ReturnType<typeof useGuests>;
      }

      return {
        data: [
          {
            id: PRIMARY_GUEST_ID,
            firstName: "Alice",
            lastName: "Smith",
            email: "alice@example.com",
            primaryGuestId: null,
            plusOnes: [],
          },
        ],
        isLoading: false,
      } as ReturnType<typeof useGuests>;
    });

    const { rerender } = render(<WebsitePage />);

    await user.click(
      screen.getByRole("button", { name: "Generate invite link" }),
    );

    expect(await screen.findByText("Invite link ready.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate invite link" }),
    ).toBeEnabled();

    activeWeddingId = "wedding-2";
    rerender(<WebsitePage />);

    expect(
      screen.getByRole("option", { name: "No guests available yet" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Primary guest")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Generate invite link" }),
    ).toBeDisabled();
  });

  it("shows the paid plan gate without loading website data for free users", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "free",
        status: "inactive",
        stripeCustomerId: null,
        currentPeriodEnd: null,
        features: [],
        canManageBilling: false,
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);

    render(<WebsitePage />);

    expect(
      screen.getByText("Wedding websites are a paid feature"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`${TRIAL_DURATION_DAYS}-day free trial`, "i"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/full app access/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a plan later/i)).toBeInTheDocument();
    expect(screen.queryByText(/LAUNCH/i)).not.toBeInTheDocument();
    expect(mockedUseWeddingWebsite).toHaveBeenCalledWith("wedding-1");
    expect(mockedUseGuests).toHaveBeenCalledWith("wedding-1");
  });

  it("shows the create-wedding empty state immediately when no wedding exists", () => {
    mockedUseWeddings.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mockedUseActiveWedding.mockReturnValue({
      activeWeddingId: null,
      setActiveWeddingId: vi.fn(),
      setWeddingSwitchGuard: vi.fn(),
    } as ReturnType<typeof useActiveWedding>);
    mockedUseBillingSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      status: "pending",
    } as ReturnType<typeof useBillingSummary>);

    render(<WebsitePage />);

    expect(screen.getByText("Create a wedding first")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create wedding" }),
    ).toHaveAttribute("href", "/onboarding");
    expect(
      screen.queryByText("We couldn't load website access right now."),
    ).not.toBeInTheDocument();
  });

  it("shows the paid plan gate for inactive paid subscriptions without website access", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "starter",
        status: "past_due",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        features: [],
        canManageBilling: true,
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);

    render(<WebsitePage />);

    expect(
      screen.getByText("Wedding websites are a paid feature"),
    ).toBeInTheDocument();
    expect(mockedUseWeddingWebsite).toHaveBeenCalledWith("wedding-1");
    expect(mockedUseGuests).toHaveBeenCalledWith("wedding-1");
  });

  it("shows a billing error state instead of the editor when billing access cannot be loaded", () => {
    const refetch = vi.fn();
    mockedUseWeddingWebsite.mockReturnValue({
      data: undefined,
      isLoading: false,
      status: "idle",
    } as ReturnType<typeof useWeddingWebsite>);
    mockedUseBillingSummary.mockReturnValue({
      data: undefined,
      error: new Error("billing is down"),
      isLoading: false,
      status: "error",
      refetch,
    } as ReturnType<typeof useBillingSummary>);

    render(<WebsitePage />);

    expect(
      screen.getByText("We couldn't load website access right now."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("billing is down")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Wedding Website" }),
    ).not.toBeInTheDocument();
    expect(mockedUseWeddingWebsite).toHaveBeenCalledWith("wedding-1");
    expect(mockedUseGuests).toHaveBeenCalledWith("wedding-1");
  });

  it("keeps the editor available when billing refetch fails but cached access data exists", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "starter",
        status: "active",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        features: ["weddingWebsite"],
        canManageBilling: true,
      },
      error: new Error("billing is down"),
      isLoading: false,
      status: "error",
    } as ReturnType<typeof useBillingSummary>);

    render(<WebsitePage />);

    expect(
      screen.queryByText("We couldn't load website access right now."),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(mockedUseWeddingWebsite).toHaveBeenCalledWith("wedding-1");
    expect(mockedUseGuests).toHaveBeenCalledWith("wedding-1");
  });

  it("preserves a dirty draft across a temporary billing access outage", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WebsitePage />);

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Saved locally first");
    expect(screen.getByLabelText("Title")).toHaveValue("Saved locally first");

    mockedUseBillingSummary.mockReturnValue({
      data: undefined,
      error: new Error("billing is down"),
      isLoading: false,
      status: "error",
      refetch: vi.fn(),
    } as ReturnType<typeof useBillingSummary>);

    rerender(<WebsitePage />);

    expect(
      screen.queryByText("We couldn't load website access right now."),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Saved locally first");
  });

  it("allows manually clearing the reminder picker to zero households", async () => {
    const user = userEvent.setup();

    render(<WebsitePage />);

    const reminderCheckbox = screen.getByLabelText("Alice Smith");
    expect(reminderCheckbox).toBeChecked();

    await user.click(reminderCheckbox);

    expect(reminderCheckbox).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Send RSVP reminders" }),
    ).toBeDisabled();
  });

  it("clears stale reminder selections when the primary guest list becomes empty", () => {
    let guestList = [
      {
        id: PRIMARY_GUEST_ID,
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@example.com",
        primaryGuestId: null,
        plusOnes: [],
      },
    ];

    mockedUseGuests.mockImplementation(
      () =>
        ({
          data: guestList,
          isLoading: false,
        }) as ReturnType<typeof useGuests>,
    );

    const { rerender } = render(<WebsitePage />);

    expect(
      screen.getByRole("button", { name: "Send RSVP reminders" }),
    ).toBeEnabled();

    guestList = [];
    rerender(<WebsitePage />);

    expect(
      screen.getByRole("button", { name: "Send RSVP reminders" }),
    ).toBeDisabled();
  });

  it("labels the draft slug as not public before the site is published", async () => {
    mockedUseWeddingWebsite.mockReturnValue({
      data: {
        weddingId: "wedding-1",
        slug: "anna-and-lee",
        publishedSlug: null,
        template: "classic",
        content: {
          hero: {
            title: "Angel & Sam",
            subtitle: "June 12, 2026",
            body: "Celebrate with us.",
            ctaLabel: "RSVP",
          },
          story: {
            title: "Our Story",
            body: "We met at sunset.",
          },
          venue: {
            name: "Casa Agave",
            address: "123 Garden St",
            details: "",
            mapUrl: null,
          },
          registry: {
            title: "Registry",
            url: null,
            details: "",
          },
          rsvp: {
            visible: true,
            headline: "Please RSVP",
            details: "",
          },
          heroImage: null,
        },
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useWeddingWebsite>);

    render(<WebsitePage />);

    expect(
      await screen.findByText(
        `Draft URL: ${PUBLIC_URL_ANNA}. Publish to make it public.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(`Public URL: ${PUBLIC_URL_ANNA}`),
    ).not.toBeInTheDocument();
  });

  it("keeps showing the live published url while a new draft slug is being edited", async () => {
    mockedUseWeddingWebsite.mockReturnValue({
      data: {
        weddingId: "wedding-1",
        slug: "anna-and-lee-after-party",
        publishedSlug: "angel-and-sam",
        template: "classic",
        content: {
          hero: {
            title: "Angel & Sam",
            subtitle: "June 12, 2026",
            body: "Celebrate with us.",
            ctaLabel: "RSVP",
          },
          story: {
            title: "Our Story",
            body: "We met at sunset.",
          },
          venue: {
            name: "Casa Agave",
            address: "123 Garden St",
            details: "",
            mapUrl: null,
          },
          registry: {
            title: "Registry",
            url: null,
            details: "",
          },
          rsvp: {
            visible: true,
            headline: "Please RSVP",
            details: "",
          },
          heroImage: null,
        },
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useWeddingWebsite>);

    render(<WebsitePage />);

    expect(
      await screen.findByText(`Public URL: ${PUBLIC_URL_ANGEL}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(`Public URL: ${PUBLIC_URL_ANNA}`),
    ).not.toBeInTheDocument();
  });

  it("uses one publish tour target for the publish controls section", () => {
    render(<WebsitePage />);

    expect(
      document.querySelectorAll('[data-tour="website-publish"]'),
    ).toHaveLength(1);
  });

  it("does not render a dead live-site link before the website is published", () => {
    mockedUseWeddingWebsite.mockReturnValue({
      data: {
        weddingId: "wedding-1",
        slug: "anna-and-lee",
        publishedSlug: null,
        template: "classic",
        content: {
          hero: {
            title: "Angel & Sam",
            subtitle: "June 12, 2026",
            body: "Celebrate with us.",
            ctaLabel: "RSVP",
          },
          story: {
            title: "Our Story",
            body: "We met at sunset.",
          },
          venue: {
            name: "Casa Agave",
            address: "123 Garden St",
            details: "",
            mapUrl: null,
          },
          registry: {
            title: "Registry",
            url: null,
            details: "",
          },
          rsvp: {
            visible: true,
            headline: "Please RSVP",
            details: "",
          },
          heroImage: null,
        },
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useWeddingWebsite>);

    render(<WebsitePage />);

    expect(
      screen.getByRole("button", { name: "View live site" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: "View live site" }),
    ).not.toBeInTheDocument();
  });

  it("asks before removing the hero image and keeps it when cancelled", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    mockedUseWeddingWebsite.mockReturnValue({
      data: {
        weddingId: "wedding-1",
        slug: "angel-and-sam",
        publishedSlug: "angel-and-sam",
        template: "classic",
        content: {
          hero: {
            title: "Angel & Sam",
            subtitle: "June 12, 2026",
            body: "Celebrate with us.",
            ctaLabel: "RSVP",
          },
          story: {
            title: "Our Story",
            body: "We met at sunset.",
          },
          venue: {
            name: "Casa Agave",
            address: "123 Garden St",
            details: "",
            mapUrl: null,
          },
          registry: {
            title: "Registry",
            url: null,
            details: "",
          },
          rsvp: {
            visible: true,
            headline: "Please RSVP",
            details: "",
          },
          heroImage: {
            url: "https://images.example.com/hero.jpg",
            alt: "Couple portrait",
            mimeType: "image/jpeg",
          },
        },
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useWeddingWebsite>);

    render(<WebsitePage />);

    expect(
      screen.getByRole("img", { name: "Couple portrait" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Remove the hero image from this draft?",
    );
    expect(
      screen.getByRole("img", { name: "Couple portrait" }),
    ).toBeInTheDocument();
  });

  it("removes the hero image after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    mockedUseWeddingWebsite.mockReturnValue({
      data: {
        weddingId: "wedding-1",
        slug: "angel-and-sam",
        publishedSlug: "angel-and-sam",
        template: "classic",
        content: {
          hero: {
            title: "Angel & Sam",
            subtitle: "June 12, 2026",
            body: "Celebrate with us.",
            ctaLabel: "RSVP",
          },
          story: {
            title: "Our Story",
            body: "We met at sunset.",
          },
          venue: {
            name: "Casa Agave",
            address: "123 Garden St",
            details: "",
            mapUrl: null,
          },
          registry: {
            title: "Registry",
            url: null,
            details: "",
          },
          rsvp: {
            visible: true,
            headline: "Please RSVP",
            details: "",
          },
          heroImage: {
            url: "https://images.example.com/hero.jpg",
            alt: "Couple portrait",
            mimeType: "image/jpeg",
          },
        },
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useWeddingWebsite>);

    render(<WebsitePage />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(
      screen.queryByRole("img", { name: "Couple portrait" }),
    ).not.toBeInTheDocument();
  });

  it("asks before unpublishing and keeps the site live when cancelled", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const unpublish = vi.fn();

    mockedUseUnpublishWeddingWebsite.mockReturnValue({
      mutateAsync: unpublish,
      isPending: false,
    } as ReturnType<typeof useUnpublishWeddingWebsite>);

    render(<WebsitePage />);

    await user.click(screen.getByRole("button", { name: "Unpublish" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Unpublish this website and take the live site offline?",
    );
    expect(unpublish).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Unpublish" }),
    ).toBeInTheDocument();
  });

  it("asks before switching weddings when the website draft is dirty", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    let weddingSwitchGuard: ((nextWeddingId: string) => boolean) | null = null;
    const committedWeddingSwitch = vi.fn();
    const setActiveWeddingId = (nextWeddingId: string) => {
      if (weddingSwitchGuard && !weddingSwitchGuard(nextWeddingId)) {
        return;
      }
      committedWeddingSwitch(nextWeddingId);
    };
    const setWeddingSwitchGuard = vi.fn(
      (guard: ((nextWeddingId: string) => boolean) | null) => {
        weddingSwitchGuard = guard;
      },
    );

    mockedUseActiveWedding.mockReturnValue({
      activeWeddingId: "wedding-1",
      setActiveWeddingId,
      setWeddingSwitchGuard,
    } as ReturnType<typeof useActiveWedding>);

    render(<WebsitePage />);

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "New title");
    setActiveWeddingId("wedding-2");

    expect(setWeddingSwitchGuard).toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledWith(
      "You have unsaved website changes. Leave without saving?",
    );
    expect(committedWeddingSwitch).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("New title");
  });

  it("uploads the hero image using PUT with the raw file and correct Content-Type", async () => {
    const user = userEvent.setup();
    const uploadUrl = "https://upload.example.com/presigned?sig=abc";
    const imageUrl = "https://images.example.com/hero-uploaded.jpg";

    mockedUseWeddingWebsiteHeroUploadIntent.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ uploadUrl, imageUrl }),
      isPending: false,
    } as ReturnType<typeof useWeddingWebsiteHeroUploadIntent>);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    render(<WebsitePage />);

    const file = new File(["img-bytes"], "photo.jpg", { type: "image/jpeg" });
    const fileInput =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(fileInput, file);

    expect(fetchSpy).toHaveBeenCalledWith(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: file,
    });

    fetchSpy.mockRestore();
  });

  it("rejects hero images larger than 10 MB before requesting an upload intent", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn();

    mockedUseWeddingWebsiteHeroUploadIntent.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useWeddingWebsiteHeroUploadIntent>);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<WebsitePage />);

    const oversizedFile = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      "too-large.jpg",
      { type: "image/jpeg" },
    );
    const fileInput =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(fileInput, oversizedFile);

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Hero image must be 10 MB or smaller."),
    ).toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  it("unpublishes the site after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const unpublish = vi.fn().mockResolvedValue({
      weddingId: "wedding-1",
      slug: "angel-and-sam",
      publishedSlug: null,
      template: "classic",
      content: {
        hero: {
          title: "Angel & Sam",
          subtitle: "June 12, 2026",
          body: "Celebrate with us.",
          ctaLabel: "RSVP",
        },
        story: {
          title: "Our Story",
          body: "We met at sunset.",
        },
        venue: {
          name: "Casa Agave",
          address: "123 Garden St",
          details: "",
          mapUrl: null,
        },
        registry: {
          title: "Registry",
          url: null,
          details: "",
        },
        rsvp: {
          visible: true,
          headline: "Please RSVP",
          details: "",
        },
        heroImage: null,
      },
    });

    mockedUseUnpublishWeddingWebsite.mockReturnValue({
      mutateAsync: unpublish,
      isPending: false,
    } as ReturnType<typeof useUnpublishWeddingWebsite>);

    render(<WebsitePage />);

    await user.click(screen.getByRole("button", { name: "Unpublish" }));

    expect(unpublish).toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "View live site" }),
      ).toBeDisabled();
    });
  });
});
