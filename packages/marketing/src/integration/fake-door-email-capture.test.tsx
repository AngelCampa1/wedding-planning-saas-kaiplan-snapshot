/**
 * Integration: FakeDoorPricing + real EmailCapture (no mock)
 *
 * Regression: FakeDoorPricing forwards props into the real EmailCapture
 * component without intermediate mocks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { FakeDoorPricing } from "../components/fake-door-pricing";
import type { SurveyQuestion, ReferralReward } from "../types";

const surveyQuestions: SurveyQuestion[] = [
  { id: "role", text: "What is your role?", options: ["Founder", "Manager"] },
];

const referralRewards: ReferralReward[] = [
  { threshold: 3, description: "Get 7 extra trial days" },
];

const tiers = [
  { name: "Starter", price: "$29/mo", features: ["5 users"] },
  {
    name: "Pro",
    price: "$79/mo",
    features: ["25 users"],
    highlighted: true,
  },
];

const emailCapturePassthrough = {
  apiUrl: "https://api.test",
  sourcePage: "/pricing",
  surveyQuestions,
  discoveryCallUrl: "https://cal.example.com",
  buttonText: "Start Your Free Trial",
  placeholder: "work@email.com",
  errorInvalidEmail: "Enter a valid email",
  errorGeneric: "Something went wrong",
  successMessage: "You're in!",
};

const defaultProps = {
  apiUrl: "https://api.test",
  sourcePage: "/pricing",
  tiers,
  buttonPrefix: "Choose",
  heading: "Plans",
  emailCapture: emailCapturePassthrough,
};

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FakeDoorPricing + real EmailCapture (no mock)", () => {
  it("modal contains a real email input after tier click", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      // Real EmailCapture renders a real <input type="email">
      expect(screen.getByPlaceholderText("work@email.com")).toBeDefined();
    });
  });

  it("submit button uses the buttonText forwarded from emailCapture prop", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Start Your Free Trial" }),
      ).toBeDefined();
    });
  });

  it("submitting a valid email calls fetch with emailCapture.apiUrl and sourcePage", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/api/pricing-click")) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("work@email.com")).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText("work@email.com"), {
      target: { value: "user@test.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Start Your Free Trial" }),
    );

    await waitFor(() => {
      const signupCall = fetchMock.mock.calls.find((args: unknown[]) =>
        String(args[0]).includes("/api/signup"),
      );
      expect(signupCall).toBeDefined();
      const body = JSON.parse(
        (signupCall![1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      expect(body.email).toBe("user@test.com");
      expect(body.sourcePage).toBe("/pricing");
    });
  });

  it("shows inline validation error for invalid email inside the modal", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("work@email.com")).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText("work@email.com"), {
      target: { value: "notanemail" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Start Your Free Trial" }),
    );

    expect(screen.getByText("Enter a valid email")).toBeDefined();
    // fetch should NOT have been called for signup — only for pricing-click
    const globalFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    const signupCalls = globalFetch.mock.calls.filter((args: unknown[]) =>
      String(args[0]).includes("/api/signup"),
    );
    expect(signupCalls).toHaveLength(0);
  });

  it("PostSignupSurvey question text appears after 1.5 s delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes("/api/pricing-click")) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      }),
    );

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("work@email.com")).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText("work@email.com"), {
      target: { value: "user@test.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Start Your Free Trial" }),
    );

    // Success state first
    await waitFor(() => {
      expect(screen.getByText("You're in!")).toBeDefined();
    });

    // Survey not yet visible
    expect(screen.queryByText("What is your role?")).toBeNull();

    // Advance the 1500 ms delay
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Survey question text should now appear
    await waitFor(() => {
      expect(screen.getByText("What is your role?")).toBeDefined();
    });
  });

  it("surveyQuestions prop flows through to PostSignupSurvey question options", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes("/api/pricing-click")) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      }),
    );

    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("work@email.com")).toBeDefined(),
    );

    fireEvent.change(screen.getByPlaceholderText("work@email.com"), {
      target: { value: "x@y.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Start Your Free Trial" }),
    );

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() => {
      // Options from surveyQuestions must appear
      expect(screen.getByText("Founder")).toBeDefined();
      expect(screen.getByText("Manager")).toBeDefined();
    });
  });

  it("Escape key closes the modal", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("clicking the backdrop closes the modal", async () => {
    render(<FakeDoorPricing {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose Starter" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    // Click the backdrop overlay (the dialog element itself, which has onClick=clearSelection)
    fireEvent.click(screen.getByRole("dialog"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("productName and productDomain flow through to ReferralShare after survey completion", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes("/api/pricing-click")) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              referralCode: "refXYZ",
              position: 12,
              surveyToken: "tok123",
            }),
        });
      }),
    );

    render(
      <FakeDoorPricing
        {...defaultProps}
        emailCapture={{
          ...emailCapturePassthrough,
          referralRewards,
          productName: "TestApp",
          productDomain: "testapp.com",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("work@email.com")).toBeDefined(),
    );

    fireEvent.change(screen.getByPlaceholderText("work@email.com"), {
      target: { value: "user@test.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Start Your Free Trial" }),
    );

    await waitFor(() => screen.getByText("You're in!"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Answer the survey question to reach the completion screen
    await waitFor(() =>
      expect(screen.getByText("What is your role?")).toBeDefined(),
    );
    fireEvent.click(screen.getByText("Founder"));

    // ReferralShare should appear with the referral URL built from productDomain + referralCode
    await waitFor(() => {
      expect(
        screen.getByDisplayValue("https://testapp.com/?ref=refXYZ"),
      ).toBeDefined();
    });
    expect(screen.getByText("Your signup position is #12")).toBeDefined();
  });
});
