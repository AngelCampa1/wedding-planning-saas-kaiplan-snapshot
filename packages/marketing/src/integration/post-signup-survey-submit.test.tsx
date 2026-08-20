/**
 * Integration: PostSignupSurvey fetch payload verification
 *
 * Verifies the component sends the correct payload to /api/survey when
 * a user completes all survey questions, and handles edge cases like
 * fetch failures and missing surveyToken.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PostSignupSurvey } from "../components/post-signup-survey";
import type { SurveyQuestion } from "../types";

const questions: SurveyQuestion[] = [
  {
    id: "role",
    text: "What is your role?",
    options: ["Founder", "Manager", "IC"],
  },
  {
    id: "tools",
    text: "Current tools?",
    options: ["Spreadsheets", "Nothing", "Other"],
  },
];

const defaultProps = {
  apiUrl: "https://api.test",
  surveyToken: "test-token-abc123",
  questions,
  discoveryCallUrl: "https://cal.com/test",
  onComplete: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  defaultProps.onComplete = vi.fn();
});

describe("PostSignupSurvey submit integration", () => {
  it("calls fetch to /api/survey with correct surveyToken and answers after completing all questions", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", mockFetch);

    render(<PostSignupSurvey {...defaultProps} />);

    fireEvent.click(screen.getByText("Founder"));
    fireEvent.click(screen.getByText("Spreadsheets"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test/api/survey");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(options.body);
    expect(body).toEqual({
      surveyToken: "test-token-abc123",
      answers: [
        { questionId: "role", answer: "Founder" },
        { questionId: "tools", answer: "Spreadsheets" },
      ],
    });
  });

  it("does NOT call fetch until all questions are answered", () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", mockFetch);

    render(<PostSignupSurvey {...defaultProps} />);

    fireEvent.click(screen.getByText("Founder"));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("transitions to 'done' status after successful fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", mockFetch);

    render(<PostSignupSurvey {...defaultProps} />);

    fireEvent.click(screen.getByText("Founder"));
    fireEvent.click(screen.getByText("Spreadsheets"));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Survey complete" }),
      ).toBeDefined();
    });
  });

  it("shows error state with retry when fetch rejects", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    vi.stubGlobal("fetch", mockFetch);

    render(<PostSignupSurvey {...defaultProps} />);

    fireEvent.click(screen.getByText("Founder"));
    fireEvent.click(screen.getByText("Spreadsheets"));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Survey error" }),
      ).toBeDefined();
      expect(screen.getByText("Something went wrong")).toBeDefined();
      expect(screen.getByText("Try Again")).toBeDefined();
    });
  });

  it("skips fetch entirely when surveyToken is undefined", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    render(<PostSignupSurvey {...defaultProps} surveyToken={undefined} />);

    fireEvent.click(screen.getByText("Founder"));
    fireEvent.click(screen.getByText("Spreadsheets"));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Survey complete" }),
      ).toBeDefined();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("Escape key calls onComplete during answering phase", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<PostSignupSurvey {...defaultProps} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(defaultProps.onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows question text and progress indicator", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<PostSignupSurvey {...defaultProps} />);

    expect(screen.getByText("Question 1 of 2")).toBeDefined();
    expect(screen.getByText("What is your role?")).toBeDefined();
  });
});
