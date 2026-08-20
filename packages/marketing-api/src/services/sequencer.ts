export type SequencerSequenceSlug =
  | "kaiplan-fulfillment-welcome"
  | "kaiplan-lead-magnet-nurture"
  | "kaiplan-nurture-value-1"
  | (string & {});

export interface SequencerEnv {
  SEQUENCER_BASE_URL?: string;
  SEQUENCER_CF_ACCESS_CLIENT_ID?: string;
  SEQUENCER_CF_ACCESS_CLIENT_SECRET?: string;
}

const PRODUCT_ID = "kaiplan";

function getSequencerConfig(env: SequencerEnv) {
  const baseUrl = env.SEQUENCER_BASE_URL?.trim().replace(/\/+$/, "");
  const clientId = env.SEQUENCER_CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = env.SEQUENCER_CF_ACCESS_CLIENT_SECRET?.trim();

  if (!baseUrl || !clientId || !clientSecret) return null;
  return { baseUrl, clientId, clientSecret };
}

async function callSequencer(
  env: SequencerEnv,
  path: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const config = getSequencerConfig(env);
  if (!config) return false;

  const res = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Access-Client-Id": config.clientId,
      "CF-Access-Client-Secret": config.clientSecret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    throw new Error(
      `Sequencer request failed: ${res.status} ${res.statusText} ${responseBody}`.trim(),
    );
  }

  return true;
}

export async function upsertSequencerContact(
  env: SequencerEnv,
  input: { email: string; metadata?: Record<string, unknown> },
) {
  return callSequencer(env, "/api/v1/contacts", {
    product: PRODUCT_ID,
    email: input.email,
    properties: input.metadata ?? {},
  });
}

export async function enrollSequencerSequence(
  env: SequencerEnv,
  input: {
    email: string;
    sequenceSlug: SequencerSequenceSlug;
    externalId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await upsertSequencerContact(env, {
    email: input.email,
    metadata: input.metadata,
  });

  return callSequencer(env, "/api/v1/enrollments", {
    product: PRODUCT_ID,
    email: input.email,
    sequence_slug: input.sequenceSlug,
    source: "kaiplan-api",
    properties: {
      ...(input.metadata ?? {}),
      externalId: input.externalId,
      external_id: input.externalId,
    },
  });
}

export async function unsubscribeSequencerContact(
  env: SequencerEnv,
  email: string,
  metadata: Record<string, unknown> = {},
) {
  return callSequencer(env, "/api/v1/unsubscribe", {
    product: PRODUCT_ID,
    email,
    scope: "product",
    reason:
      typeof metadata["reason"] === "string"
        ? metadata["reason"]
        : "Kaiplan unsubscribe",
  });
}
