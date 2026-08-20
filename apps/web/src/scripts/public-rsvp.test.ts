import { afterEach, describe, expect, it, vi } from "vitest";

const captureExceptionMock = vi.hoisted(() => vi.fn(() => "event-rsvp-123"));

vi.mock("@kaiplan/marketing/lib/sentry-client", () => ({
  captureException: captureExceptionMock,
}));

type SetupOptions = {
  withForm?: boolean;
  withStatus?: boolean;
  withSubmitButton?: boolean;
  withTurnstileInput?: boolean;
  honeypotFieldName?: string;
  apiBase?: string;
  token?: string;
  omitApiBase?: boolean;
  omitToken?: boolean;
  turnstileFieldName?: string;
  turnstileRequired?: string;
  radioNames?: string[];
  formValues?: Record<string, string>;
};

type SubmitHandler = (event: { preventDefault: () => void }) => Promise<void>;

function setupModuleGlobals(options: SetupOptions = {}) {
  const submitHandlers = new Map<string, SubmitHandler>();
  const statusElement =
    options.withStatus === false ? null : { textContent: "" };
  const submitButton =
    options.withSubmitButton === false ? null : { disabled: false };
  const turnstileInput =
    options.withTurnstileInput === false ? null : { value: "" };
  const honeypotFieldName = options.honeypotFieldName ?? "website";
  const turnstileFieldName = options.turnstileFieldName ?? "turnstileToken";
  const radioInputs = (options.radioNames ?? ["guest-1"]).map((name) => ({
    name,
  }));
  const formValues = new Map(
    Object.entries(
      options.formValues ?? {
        "guest-1": "accepted",
        [honeypotFieldName]: "https://kaiplan.test",
        [turnstileFieldName]: "initial-token",
      },
    ),
  );

  const form =
    options.withForm === false
      ? null
      : {
          dataset: {
            apiBase: options.omitApiBase
              ? undefined
              : (options.apiBase ?? "http://127.0.0.1:8787/"),
            token: options.omitToken
              ? undefined
              : (options.token ?? "household-token"),
            honeypotField: honeypotFieldName,
            turnstileField: turnstileFieldName,
            turnstileRequired: options.turnstileRequired,
          },
          addEventListener: vi.fn((event: string, handler: SubmitHandler) => {
            submitHandlers.set(event, handler);
          }),
          querySelector: vi.fn((selector: string) => {
            if (selector === 'button[type="submit"]') {
              return submitButton;
            }

            return null;
          }),
          querySelectorAll: vi.fn((selector: string) => {
            if (selector === 'input[type="radio"][name^="guest-"]') {
              return radioInputs;
            }

            return [];
          }),
        };

  const documentStub = {
    querySelector: vi.fn((selector: string) => {
      if (selector === "[data-rsvp-form]") {
        return form;
      }

      if (selector === "[data-rsvp-status]") {
        return statusElement;
      }

      if (selector === 'input[name="turnstileToken"]') {
        return turnstileFieldName === "turnstileToken" ? turnstileInput : null;
      }

      if (selector === `input[name="${turnstileFieldName}"]`) {
        return turnstileInput;
      }

      return null;
    }),
  };

  class FormDataStub {
    constructor(_form: unknown) {}

    get(name: string) {
      return formValues.get(name) ?? null;
    }
  }

  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", {});
  vi.stubGlobal("FormData", FormDataStub);

  return {
    form,
    statusElement,
    submitButton,
    turnstileInput,
    submitHandlers,
  };
}

async function importModule() {
  vi.resetModules();
  await import("./public-rsvp");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  captureExceptionMock.mockClear();
});

describe("public-rsvp", () => {
  it("does nothing when no form is present and the turnstile input is missing", async () => {
    setupModuleGlobals({
      withForm: false,
      withStatus: false,
      withTurnstileInput: false,
    });

    await importModule();

    expect(window.kaiplanTurnstileCallback).toBeTypeOf("function");
    expect(() => window.kaiplanTurnstileCallback("next-token")).not.toThrow();
  });

  it("submits accepted and declined RSVP values and updates status on success", async () => {
    const globals = setupModuleGlobals({
      radioNames: ["guest-1", "guest-2"],
      formValues: {
        "guest-1": "accepted",
        "guest-2": "declined",
        website: "https://kaiplan.test",
        turnstileToken: "initial-token",
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    window.kaiplanTurnstileCallback("next-token");

    expect(globals.turnstileInput?.value).toBe("next-token");

    const submitHandler = globals.submitHandlers.get("submit");
    expect(submitHandler).toBeTypeOf("function");

    const preventDefault = vi.fn();
    await submitHandler?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/public/rsvp/household-token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guests: [
            { guestId: "1", rsvpStatus: "accepted" },
            { guestId: "2", rsvpStatus: "declined" },
          ],
          website: "https://kaiplan.test",
          turnstileToken: "initial-token",
        }),
      },
    );
    expect(globals.statusElement?.textContent).toBe(
      "Your RSVP has been saved. We can't wait to celebrate with you.",
    );
    expect(globals.submitButton?.disabled).toBe(false);
  });

  it("blocks submission when a guest has no accepted or declined RSVP choice", async () => {
    const globals = setupModuleGlobals({
      radioNames: ["guest-1", "guest-2"],
      formValues: {
        "guest-1": "accepted",
        website: "",
        turnstileToken: "initial-token",
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    const preventDefault = vi.fn();
    await submitHandler?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(globals.statusElement?.textContent).toBe(
      "Please choose attending or declining for each guest before submitting.",
    );
    expect(globals.submitButton?.disabled).toBe(false);
  });

  it("blocks submission when a guest still has a pending RSVP value", async () => {
    const globals = setupModuleGlobals({
      radioNames: ["guest-1", "guest-2"],
      formValues: {
        "guest-1": "accepted",
        "guest-2": "pending",
        website: "",
        turnstileToken: "initial-token",
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(globals.statusElement?.textContent).toBe(
      "Please choose attending or declining for each guest before submitting.",
    );
    expect(globals.submitButton?.disabled).toBe(false);
  });

  it("blocks incomplete RSVP submissions when optional UI elements are absent", async () => {
    const globals = setupModuleGlobals({
      withStatus: false,
      withSubmitButton: false,
      radioNames: ["guest-1", "guest-2"],
      formValues: {
        "guest-1": "accepted",
        website: "",
        turnstileToken: "initial-token",
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses custom anti-spam field names when submitting the RSVP form", async () => {
    const globals = setupModuleGlobals({
      honeypotFieldName: "botField",
      turnstileFieldName: "challengeField",
      formValues: {
        "guest-1": "accepted",
        botField: "",
        challengeField: "initial-token",
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    window.kaiplanTurnstileCallback("next-token");

    expect(globals.turnstileInput?.value).toBe("next-token");

    const submitHandler = globals.submitHandlers.get("submit");
    const preventDefault = vi.fn();
    await submitHandler?.({ preventDefault });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/public/rsvp/household-token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guests: [{ guestId: "1", rsvpStatus: "accepted" }],
          botField: "",
          challengeField: "initial-token",
        }),
      },
    );
  });

  it("shows the API error message when the RSVP endpoint rejects the payload", async () => {
    const globals = setupModuleGlobals({
      withSubmitButton: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Invite closed" }),
      }),
    );

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(globals.statusElement?.textContent).toBe("Invite closed");
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("shows a reference id for captured non-5xx API errors", async () => {
    const globals = setupModuleGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({
          error: "Invite changed",
          errorId: "event-api-409",
        }),
      }),
    );

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(globals.statusElement?.textContent).toBe(
      "Invite changed Reference ID: event-api-409.",
    );
  });

  it("captures network failures and shows a reference id", async () => {
    const globals = setupModuleGlobals();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("network down"));

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(globals.statusElement?.textContent).toBe(
      "We couldn't save your response. Please check your connection and try again. Reference ID: event-rsvp-123.",
    );
    expect(captureExceptionMock).toHaveBeenCalledWith("network down");
    expect(globals.submitButton?.disabled).toBe(false);
  });

  it("captures 5xx API failures and shows a reference id", async () => {
    const globals = setupModuleGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue({
          error: "Internal server error",
          errorId: "event-api-503",
        }),
      }),
    );

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(globals.statusElement?.textContent).toBe(
      "We couldn't save your response. Please check your connection and try again. Reference ID: event-api-503.",
    );
  });

  it("uses the error id response header when a 5xx body is unreadable", async () => {
    const globals = setupModuleGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: new Headers({ "X-Kaiplan-Error-Id": "event-header-502" }),
        json: vi.fn().mockRejectedValue(new Error("invalid json")),
      }),
    );

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(globals.statusElement?.textContent).toBe(
      "We couldn't save your response. Please check your connection and try again. Reference ID: event-header-502.",
    );
  });

  it("falls back to empty optional payload fields and handles an unreadable API error body", async () => {
    const globals = setupModuleGlobals({
      withStatus: false,
      formValues: {
        "guest-1": "declined",
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
    });
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/public/rsvp/household-token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guests: [{ guestId: "1", rsvpStatus: "declined" }],
          website: "",
          turnstileToken: "",
        }),
      },
    );
    expect(globals.submitButton?.disabled).toBe(false);
  });

  it("blocks submission and shows a message when Turnstile is required but the token is empty", async () => {
    const globals = setupModuleGlobals({
      turnstileRequired: "true",
      formValues: {
        "guest-1": "accepted",
        website: "",
        turnstileToken: "",
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(globals.statusElement?.textContent).toBe(
      "Please complete the security check before submitting.",
    );
    expect(globals.submitButton?.disabled).toBe(false);
  });

  it("blocks submission silently when Turnstile is required but token is empty and UI elements are absent", async () => {
    const globals = setupModuleGlobals({
      withStatus: false,
      withSubmitButton: false,
      turnstileRequired: "true",
      formValues: {
        "guest-1": "accepted",
        website: "",
        turnstileToken: "",
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("URL-encodes the token when building the fetch URL", async () => {
    const globals = setupModuleGlobals({
      token: "tok/special+chars=",
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("tok%2Fspecial%2Bchars%3D");
    expect(calledUrl).not.toContain("tok/special+chars=");
  });

  it("falls back to generic message when body.error is an object (not a string)", async () => {
    const globals = setupModuleGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({
          error: { code: "CLOSED", message: "Invite closed" },
        }),
      }),
    );

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(globals.statusElement?.textContent).toBe(
      "We couldn't save your response. Please check your connection and try again.",
    );
  });

  it("falls back to empty dataset values and completes successfully without a status element", async () => {
    const globals = setupModuleGlobals({
      withStatus: false,
      omitApiBase: true,
      omitToken: true,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await importModule();

    const submitHandler = globals.submitHandlers.get("submit");
    await submitHandler?.({ preventDefault: vi.fn() });

    expect(fetchMock).toHaveBeenCalledWith("/api/public/rsvp/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guests: [{ guestId: "1", rsvpStatus: "accepted" }],
        website: "https://kaiplan.test",
        turnstileToken: "initial-token",
      }),
    });
    expect(globals.submitButton?.disabled).toBe(false);
  });
});
