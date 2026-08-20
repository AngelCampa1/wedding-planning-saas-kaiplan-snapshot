import { captureException } from "@kaiplan/marketing/lib/sentry-client";

declare global {
  interface Window {
    kaiplanTurnstileCallback: (value: string) => void;
  }
}

const GENERIC_RSVP_ERROR =
  "We couldn't save your response. Please check your connection and try again.";
const INCOMPLETE_RSVP_ERROR =
  "Please choose attending or declining for each guest before submitting.";

function withReferenceId(message: string, errorId?: string): string {
  return errorId ? `${message} Reference ID: ${errorId}.` : message;
}

class RsvpSubmissionError extends Error {
  constructor(
    message: string,
    public shouldCapture: boolean,
    public errorId?: string,
  ) {
    super(message);
    this.name = "RsvpSubmissionError";
  }
}

const form = document.querySelector<HTMLFormElement>("[data-rsvp-form]");
const statusElement = document.querySelector<HTMLElement>("[data-rsvp-status]");
const honeypotFieldName = form?.dataset.honeypotField ?? "website";
const turnstileFieldName = form?.dataset.turnstileField ?? "turnstileToken";

window.kaiplanTurnstileCallback = function (value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[name="${turnstileFieldName}"]`,
  );

  if (input) {
    input.value = value;
  }
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  const apiBase = form.dataset.apiBase ?? "";
  const token = form.dataset.token ?? "";
  const guestIds = Array.from(
    new Set(
      Array.from(
        form.querySelectorAll<HTMLInputElement>(
          'input[type="radio"][name^="guest-"]',
        ),
      ).map((input) => input.name.replace(/^guest-/, "")),
    ),
  );

  if (submitButton) {
    submitButton.disabled = true;
  }

  if (statusElement) {
    statusElement.textContent = "Saving your response...";
  }

  try {
    const formData = new FormData(form);
    const turnstileToken = String(formData.get(turnstileFieldName) || "");
    const turnstileRequired = form.dataset.turnstileRequired === "true";

    if (turnstileRequired && !turnstileToken) {
      if (statusElement) {
        statusElement.textContent =
          "Please complete the security check before submitting.";
      }
      if (submitButton) {
        submitButton.disabled = false;
      }
      return;
    }

    const guests = guestIds.map((guestId) => ({
      guestId,
      rsvpStatus: String(formData.get(`guest-${guestId}`) || ""),
    }));

    if (
      guests.some(
        (guest) =>
          guest.rsvpStatus !== "accepted" && guest.rsvpStatus !== "declined",
      )
    ) {
      if (statusElement) {
        statusElement.textContent = INCOMPLETE_RSVP_ERROR;
      }
      if (submitButton) {
        submitButton.disabled = false;
      }
      return;
    }

    const payload = {
      guests,
      [honeypotFieldName]: String(formData.get(honeypotFieldName) || ""),
      [turnstileFieldName]: turnstileToken,
    };

    const response = await fetch(
      `${apiBase.replace(/\/$/, "")}/api/public/rsvp/${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        errorId?: unknown;
      };
      const bodyErrorId =
        typeof body.errorId === "string" && body.errorId.trim()
          ? body.errorId
          : undefined;
      const errorId =
        bodyErrorId ?? response.headers?.get("X-Kaiplan-Error-Id") ?? undefined;

      if (response.status >= 500) {
        throw new RsvpSubmissionError(GENERIC_RSVP_ERROR, !errorId, errorId);
      }

      throw new RsvpSubmissionError(
        typeof body.error === "string" ? body.error : GENERIC_RSVP_ERROR,
        false,
        errorId,
      );
    }

    if (statusElement) {
      statusElement.textContent =
        "Your RSVP has been saved. We can't wait to celebrate with you.";
    }
  } catch (error) {
    const shouldCapture =
      !(error instanceof RsvpSubmissionError) || error.shouldCapture;
    const eventId = shouldCapture
      ? captureException(error)
      : error instanceof RsvpSubmissionError
        ? error.errorId
        : undefined;
    if (statusElement) {
      statusElement.textContent =
        error instanceof RsvpSubmissionError
          ? withReferenceId(error.message, eventId)
          : error instanceof Error
            ? withReferenceId(GENERIC_RSVP_ERROR, eventId)
            : withReferenceId(GENERIC_RSVP_ERROR, eventId);
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});

export {};
