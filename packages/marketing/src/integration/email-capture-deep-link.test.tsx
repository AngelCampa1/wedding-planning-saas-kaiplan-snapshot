/**
 * Integration: EmailCapture survey reminder deep link flow
 *
 * When a user clicks a survey reminder email link with
 * ?survey=open&t=<token>, the EmailCapture component:
 *   1. Sets surveyToken from the `t` param
 *   2. Opens PostSignupSurvey immediately (no 1.5s delay)
 *   3. Threads the surveyToken through to the /api/survey fetch call
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EmailCapture } from "../components/email-capture";
import type { SurveyQuestion } from "../types";

const surveyQuestions: SurveyQuestion[] = [
  { id: "role", text: "What is your role?", options: ["Founder", "Manager"] },
];

const defaultProps = {
  apiUrl: "https://api.test",
  sourcePage: "/landing",
  surveyQuestions,
  discoveryCallUrl: "https://cal.com/test",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    value: { search: "" },
    writable: true,
    configurable: true,
  });
});

describe("EmailCapture deep link flow (?survey=open)", () => {
  it("deep link auto-opens survey without 1.5s delay", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok")));

    Object.defineProperty(window, "location", {
      value: {
        search: "?survey=open&t=deep-link-token",
      },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    // Survey question text appears immediately -- no timer advance needed
    expect(screen.getByText("What is your role?")).toBeDefined();
  });

  it("surveyToken from URL ?t= param threads through to /api/survey fetch call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(window, "location", {
      value: {
        search: "?survey=open&t=deep-link-token-xyz",
      },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    // Survey should be open -- click the only answer to submit
    fireEvent.click(screen.getByRole("button", { name: "Founder" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/api/survey",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    const [, opts] = fetchMock.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        (call[0] as string).includes("/api/survey"),
    ) as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;

    expect(body.surveyToken).toBe("deep-link-token-xyz");
  });

  it("answers array from survey is correctly formed in the fetch payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    Object.defineProperty(window, "location", {
      value: {
        search: "?survey=open&t=tok-abc",
      },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Manager" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/api/survey",
        expect.any(Object),
      );
    });

    const [, opts] = fetchMock.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        (call[0] as string).includes("/api/survey"),
    ) as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as {
      surveyToken: string;
      answers: { questionId: string; answer: string }[];
    };

    expect(body.answers).toEqual([{ questionId: "role", answer: "Manager" }]);
  });

  it("does not auto-open survey when survey param is not 'open'", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok")));

    Object.defineProperty(window, "location", {
      value: {
        search: `?survey=closed&e=${btoa("user@example.com")}&t=tok`,
      },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    // Email form should be shown, not the survey
    expect(screen.queryByText("What is your role?")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
  });

  it("auto-opens survey when email param is missing but token is present", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok")));

    Object.defineProperty(window, "location", {
      value: { search: "?survey=open&t=tok" },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    expect(screen.getByText("What is your role?")).toBeDefined();
  });

  it("ignores malformed legacy email param when token is present", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok")));

    Object.defineProperty(window, "location", {
      value: { search: "?survey=open&e=!!!invalid&t=tok" },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    expect(screen.getByText("What is your role?")).toBeDefined();
  });

  it("does not auto-open survey when token is missing", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok")));

    Object.defineProperty(window, "location", {
      value: { search: "?survey=open" },
      writable: true,
      configurable: true,
    });

    render(<EmailCapture {...defaultProps} />);

    expect(screen.queryByText("What is your role?")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
  });
});
