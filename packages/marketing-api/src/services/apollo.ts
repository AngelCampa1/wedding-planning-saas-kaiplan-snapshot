import type { LocalOutbox } from "../integration/local-outbox";

export async function addToProductList(
  email: string,
  productName: string,
  apolloApiKey: string | undefined,
  options: { e2eMode?: boolean; localOutbox?: LocalOutbox } = {},
): Promise<void> {
  if (options.e2eMode) {
    options.localOutbox?.apollo.push({
      channel: "apollo",
      email,
      listName: `${productName} Signups`,
      payload: {
        email,
        label_names: [`${productName} Signups`],
        run_dedupe: true,
      },
    });
    return;
  }

  if (!apolloApiKey) {
    throw new Error("APOLLO_API_KEY is required to add contacts.");
  }

  const listName = `${productName} Signups`;

  const createContact = async (): Promise<Response> =>
    fetch("https://api.apollo.io/api/v1/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apolloApiKey,
      },
      body: JSON.stringify({
        email,
        label_names: [listName],
        run_dedupe: true,
      }),
      signal: AbortSignal.timeout(5000),
    });

  let res: Response;
  try {
    res = await createContact();
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "AbortError" || err.name === "TimeoutError")
    ) {
      try {
        res = await createContact();
      } catch (retryErr) {
        throw new Error(
          `Apollo API request failed: timeout after retry`,
          retryErr instanceof Error ? { cause: retryErr } : undefined,
        );
      }
    } else {
      throw err;
    }
  }
  if (!res.ok) {
    // Retry on server errors (5xx) and 429 rate limits — other 4xx are not transient
    if (res.status >= 500 || res.status === 429) {
      await res.body?.cancel();
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      res = await createContact();
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apollo API request failed: ${res.status} ${text}`);
    }
  }

  const data = (await res.json()) as { contact?: { id: string } };
  if (!data?.contact?.id) {
    throw new Error(
      `Apollo contact create returned unexpected shape: ${JSON.stringify(data)}`,
    );
  }
}
