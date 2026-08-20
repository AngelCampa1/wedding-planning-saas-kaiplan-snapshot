/**
 * Integration: Standalone EmailCapture → PostSignupSurvey → ReferralShare
 *
 * Tests the full funnel flow when EmailCapture is used directly on a landing
 * page (not via FakeDoorPricing). Verifies that referralCode, position, and
 * surveyToken from the signup API response thread correctly through the
 * PostSignupSurvey and into ReferralShare.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { EmailCapture } from "../components/email-capture";
import type { SurveyQuestion } from "../types";

const surveyQuestions: SurveyQuestion[] = [
  { id: "role", text: "What is your role?", options: ["Founder", "Manager"] },
  { id: "tools", text: "Current tools?", options: ["Excel", "Nothing"] },
];

const defaultProps = {
  apiUrl: "https://api.test",
  sourcePage: "/landing",
  surveyQuestions,
  discoveryCallUrl: "https://cal.com/test",
  successMessage: "You're in!",
  productName: "TestApp",
  productDomain: "testapp.com",
  buttonText: "Join",
  placeholder: "you@test.com",
};

function mockFetch(overrides?: {
  referralCode?: string;
  position?: number;
  surveyToken?: string;
}) {
  const signupResponse = {
    referralCode: overrides?.referralCode ?? "REFCODE1",
    position: overrides?.position ?? 5,
    surveyToken: overrides?.surveyToken ?? "tok123",
  };

  return vi.fn().mockImplementation((url: string) => {
    if (String(url).includes("/api/signup")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(signupResponse),
      });
    }
    // /api/survey
    return Promise.resolve({ ok: true, status: 200 });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
  vi.stubGlobal("fetch", mockFetch());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Helper: submit a valid email and wait for success state */
async function submitEmail(email = "user@test.com") {
  fireEvent.change(screen.getByPlaceholderText("you@test.com"), {
    target: { value: email },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Join" }));
  await waitFor(() => {
    expect(screen.getByText("You're in!")).toBeDefined();
  });
}

/** Helper: advance past the 1500ms delay to show the survey */
async function advanceToSurvey() {
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  await waitFor(() => {
    expect(screen.getByText("What is your role?")).toBeDefined();
  });
}

/** Helper: answer all survey questions to reach done state */
async function completeSurvey() {
  fireEvent.click(screen.getByText("Founder"));
  await waitFor(() => {
    expect(screen.getByText("Current tools?")).toBeDefined();
  });
  fireEvent.click(screen.getByText("Excel"));
}

describe("EmailCapture → PostSignupSurvey → ReferralShare full flow", () => {
  it("signup success → 1.5s delay → PostSignupSurvey appears with question text", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", mockFetch());

    render(<EmailCapture {...defaultProps} />);
    await submitEmail();

    // Survey not yet visible
    expect(screen.queryByText("What is your role?")).toBeNull();

    // Advance the 1500ms delay
    await advanceToSurvey();

    // First question text and options should be present
    expect(screen.getByText("Founder")).toBeDefined();
    expect(screen.getByText("Manager")).toBeDefined();
  });

  it("answering all survey questions calls fetch /api/survey with correct payload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    await submitEmail();
    await advanceToSurvey();
    await completeSurvey();

    await waitFor(() => {
      const surveyCalls = fetchMock.mock.calls.filter((args: unknown[]) =>
        String(args[0]).includes("/api/survey"),
      );
      expect(surveyCalls).toHaveLength(1);

      const body = JSON.parse(
        (surveyCalls[0]![1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      expect(body.surveyToken).toBe("tok123");
      expect(body.answers).toEqual([
        { questionId: "role", answer: "Founder" },
        { questionId: "tools", answer: "Excel" },
      ]);
    });
  });

  it("ReferralShare appears with correct referralUrl after survey completion", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", mockFetch());

    render(<EmailCapture {...defaultProps} />);
    await submitEmail();
    await advanceToSurvey();
    await completeSurvey();

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("https://testapp.com/?ref=REFCODE1"),
      ).toBeDefined();
    });
    expect(screen.getByText("Your signup position is #5")).toBeDefined();
  });

  it("referralCode and position from API thread through to ReferralShare correctly", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      mockFetch({ referralCode: "TESTREF", position: 42 }),
    );

    render(
      <EmailCapture
        {...defaultProps}
        productDomain="testapp.com"
        productName="TestApp"
      />,
    );
    await submitEmail();
    await advanceToSurvey();
    await completeSurvey();

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("https://testapp.com/?ref=TESTREF"),
      ).toBeDefined();
    });
    expect(screen.getByText("Your signup position is #42")).toBeDefined();
  });

  it("surveyToken from signup response threads through to survey fetch call", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockFetch({ surveyToken: "unique-tok-xyz" });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailCapture {...defaultProps} />);
    await submitEmail();
    await advanceToSurvey();
    await completeSurvey();

    await waitFor(() => {
      const surveyCalls = fetchMock.mock.calls.filter((args: unknown[]) =>
        String(args[0]).includes("/api/survey"),
      );
      expect(surveyCalls).toHaveLength(1);

      const body = JSON.parse(
        (surveyCalls[0]![1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      expect(body.surveyToken).toBe("unique-tok-xyz");
    });
  });

  it("survey onComplete returns user to email form", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", mockFetch());

    render(<EmailCapture {...defaultProps} />);
    await submitEmail();
    await advanceToSurvey();
    await completeSurvey();

    // Wait for done state (ReferralShare visible)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue("https://testapp.com/?ref=REFCODE1"),
      ).toBeDefined();
    });

    // Press Escape to trigger onComplete → setShowSurvey(false)
    fireEvent.keyDown(document, { key: "Escape" });

    // Email form input should reappear
    await waitFor(() => {
      expect(screen.getByPlaceholderText("you@test.com")).toBeDefined();
    });
  });
});
