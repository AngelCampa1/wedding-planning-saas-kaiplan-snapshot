import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addToProductList } from "./apollo.js";
import { createLocalOutbox } from "../integration/local-outbox";

const VALID_RESPONSE = {
  ok: true,
  status: 200,
  json: async () => ({ contact: { id: "c123" } }),
  text: async () => "",
  body: null,
} as unknown as Response;

const SERVER_ERROR_RESPONSE = {
  ok: false,
  status: 500,
  json: async () => ({}),
  text: async () => "Internal Server Error",
  body: { cancel: vi.fn() },
} as unknown as Response;

const RATE_LIMIT_RESPONSE = {
  ok: false,
  status: 429,
  json: async () => ({}),
  text: async () => "Rate limited",
  body: { cancel: vi.fn() },
} as unknown as Response;

const BAD_REQUEST_RESPONSE = {
  ok: false,
  status: 400,
  json: async () => ({}),
  text: async () => "Bad Request",
  body: null,
} as unknown as Response;

describe("addToProductList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends correct request to Apollo API", async () => {
    vi.mocked(fetch).mockResolvedValue(VALID_RESPONSE);

    await addToProductList("test@example.com", "CrewRoute", "api-key-123");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.apollo.io/api/v1/contacts",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": "api-key-123",
        },
        body: JSON.stringify({
          email: "test@example.com",
          label_names: ["CrewRoute Signups"],
          run_dedupe: true,
        }),
      }),
    );
  });

  it("succeeds on first try when response is ok", async () => {
    vi.mocked(fetch).mockResolvedValue(VALID_RESPONSE);

    await expect(
      addToProductList("test@example.com", "CrewRoute", "key"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries once on 5xx and succeeds", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(SERVER_ERROR_RESPONSE)
      .mockResolvedValueOnce(VALID_RESPONSE);

    await expect(
      addToProductList("test@example.com", "CrewRoute", "key"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries once on 429 with delay and succeeds", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(RATE_LIMIT_RESPONSE)
      .mockResolvedValueOnce(VALID_RESPONSE);

    const promise = addToProductList("test@example.com", "CrewRoute", "key");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws on non-retryable 4xx error", async () => {
    vi.mocked(fetch).mockResolvedValue(BAD_REQUEST_RESPONSE);

    await expect(
      addToProductList("test@example.com", "CrewRoute", "key"),
    ).rejects.toThrow("Apollo API request failed: 400 Bad Request");
  });

  it("throws when retry also fails with 5xx", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(SERVER_ERROR_RESPONSE)
      .mockResolvedValueOnce(SERVER_ERROR_RESPONSE);

    await expect(
      addToProductList("test@example.com", "CrewRoute", "key"),
    ).rejects.toThrow("Apollo API request failed: 500");
  });

  it("throws when contact shape is unexpected", async () => {
    const noContactResponse = {
      ok: true,
      status: 200,
      json: async () => ({ something: "else" }),
      text: async () => "",
      body: null,
    } as unknown as Response;

    vi.mocked(fetch).mockResolvedValue(noContactResponse);

    await expect(
      addToProductList("test@example.com", "CrewRoute", "key"),
    ).rejects.toThrow("Apollo contact create returned unexpected shape");
  });

  it("retries once on AbortError (timeout) and succeeds", async () => {
    const abortError = new DOMException("signal timed out", "AbortError");
    vi.mocked(fetch)
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(VALID_RESPONSE);

    await expect(
      addToProductList("test@example.com", "CrewRoute", "key"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries once on TimeoutError and succeeds", async () => {
    const timeoutError = new DOMException("signal timed out", "TimeoutError");
    vi.mocked(fetch)
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(VALID_RESPONSE);

    await expect(
      addToProductList("test@example.com", "CrewRoute", "key"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws non-timeout fetch errors without retrying", async () => {
    const networkError = new TypeError("Failed to fetch");
    vi.mocked(fetch).mockRejectedValue(networkError);

    await expect(
      addToProductList("test@example.com", "CrewRoute", "key"),
    ).rejects.toThrow("Failed to fetch");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when timeout retry also throws", async () => {
    const abortError = new DOMException("signal timed out", "AbortError");
    vi.mocked(fetch)
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError);

    await expect(
      addToProductList("test@example.com", "CrewRoute", "key"),
    ).rejects.toThrow("Apollo API request failed: timeout after retry");
  });

  it("captures the outbound payload in e2e mode", async () => {
    const outbox = createLocalOutbox();

    await expect(
      addToProductList("test@example.com", "CrewRoute", undefined, {
        e2eMode: true,
        localOutbox: outbox,
      }),
    ).resolves.toBeUndefined();

    expect(fetch).not.toHaveBeenCalled();
    expect(outbox.apollo).toEqual([
      {
        channel: "apollo",
        email: "test@example.com",
        listName: "CrewRoute Signups",
        payload: {
          email: "test@example.com",
          label_names: ["CrewRoute Signups"],
          run_dedupe: true,
        },
      },
    ]);
  });
});
