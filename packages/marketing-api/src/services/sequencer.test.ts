import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enrollSequencerSequence,
  unsubscribeSequencerContact,
  upsertSequencerContact,
  type SequencerEnv,
} from "./sequencer";

const env: SequencerEnv = {
  SEQUENCER_BASE_URL: "https://sequencer.example.com/",
  SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
  SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
};

describe("Sequencer service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false without remote calls when config is incomplete", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      upsertSequencerContact({}, { email: "a@example.com" }),
    ).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("upserts contacts with normalized base URL and Access headers", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      upsertSequencerContact(env, {
        email: "lead@example.com",
        metadata: { source: "test" },
      }),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sequencer.example.com/api/v1/contacts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "CF-Access-Client-Id": "client-id",
          "CF-Access-Client-Secret": "client-secret",
        }),
        body: JSON.stringify({
          product: "kaiplan",
          email: "lead@example.com",
          properties: { source: "test" },
        }),
      }),
    );
  });

  it("enrolls only after contact upsert succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await expect(
      enrollSequencerSequence(env, {
        email: "lead@example.com",
        sequenceSlug: "kaiplan-nurture-value-1",
        externalId: "signup-123",
      }),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://sequencer.example.com/api/v1/enrollments",
      expect.objectContaining({
        body: JSON.stringify({
          product: "kaiplan",
          email: "lead@example.com",
          sequence_slug: "kaiplan-nurture-value-1",
          source: "kaiplan-api",
          properties: {
            externalId: "signup-123",
            external_id: "signup-123",
          },
        }),
      }),
    );
  });

  it("throws with response text when Sequencer rejects a request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad token", { status: 403, statusText: "Forbidden" }),
    );

    await expect(
      unsubscribeSequencerContact(env, "lead@example.com"),
    ).rejects.toThrow("Sequencer request failed: 403 Forbidden bad token");
  });
});
