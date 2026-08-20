import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

const routeSearch: { token?: string } = {};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useSearch: () => routeSearch,
  }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("../../src/hooks/use-email-preferences", () => ({
  usePublicEmailPreferences: vi.fn(),
  useUpdatePublicEmailPreferences: vi.fn(),
}));

import {
  EmailPreferencesPage,
  validateEmailPreferencesSearch,
} from "../../src/routes/email-preferences";
import {
  usePublicEmailPreferences,
  useUpdatePublicEmailPreferences,
} from "../../src/hooks/use-email-preferences";

const mockedUsePublicEmailPreferences = vi.mocked(usePublicEmailPreferences);
const mockedUseUpdatePublicEmailPreferences = vi.mocked(
  useUpdatePublicEmailPreferences,
);

describe("EmailPreferencesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeSearch.token = "token-123";
    mockedUsePublicEmailPreferences.mockReturnValue({
      data: {
        email: "guest@example.com",
        allowedTypes: ["memberInvite", "rsvpConfirmation", "rsvpReminder"],
        preferences: {
          memberInvite: true,
          rsvpConfirmation: true,
          rsvpReminder: false,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof usePublicEmailPreferences>);
    mockedUseUpdatePublicEmailPreferences.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isSuccess: false,
    } as ReturnType<typeof useUpdatePublicEmailPreferences>);
  });

  it("renders public guest-facing preference toggles", () => {
    render(<EmailPreferencesPage />);

    expect(screen.getByText("Email preferences")).toBeInTheDocument();
    expect(screen.getByText("Member invites")).toBeInTheDocument();
    expect(screen.getByText("RSVP confirmations")).toBeInTheDocument();
    expect(screen.getByText("RSVP reminders")).toBeInTheDocument();
  });

  it("updates a public preference when toggled", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseUpdatePublicEmailPreferences.mockReturnValue({
      mutateAsync,
      isPending: false,
      isSuccess: false,
    } as ReturnType<typeof useUpdatePublicEmailPreferences>);

    render(<EmailPreferencesPage />);

    await user.click(screen.getByRole("checkbox", { name: "RSVP reminders" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      preferences: {
        memberInvite: true,
        rsvpConfirmation: true,
        rsvpReminder: true,
      },
    });
  });

  it("renders clean loading copy while public preferences load", () => {
    mockedUsePublicEmailPreferences.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof usePublicEmailPreferences>);

    render(<EmailPreferencesPage />);

    expect(screen.getByText("Loading preferences...")).toBeInTheDocument();
    expect(screen.queryByText(/â€¦/)).not.toBeInTheDocument();
  });

  it("validateEmailPreferencesSearch passes through a valid token", () => {
    expect(validateEmailPreferencesSearch({ token: "xyz" })).toEqual({
      token: "xyz",
    });
  });

  it("validateEmailPreferencesSearch drops invalid or empty tokens", () => {
    expect(validateEmailPreferencesSearch({})).toEqual({});
    expect(validateEmailPreferencesSearch({ token: "" })).toEqual({});
    expect(validateEmailPreferencesSearch({ token: 42 })).toEqual({});
    expect(validateEmailPreferencesSearch({ token: null })).toEqual({});
  });

  it("shows missing-token notice when token is absent from search", () => {
    routeSearch.token = undefined;
    mockedUsePublicEmailPreferences.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof usePublicEmailPreferences>);

    render(<EmailPreferencesPage />);

    expect(
      screen.getByText("This link is missing its email preference token."),
    ).toBeInTheDocument();
  });
});
