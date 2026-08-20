export const INDEXNOW_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
export const INDEXNOW_KEY_FILENAME = `${INDEXNOW_KEY}.txt`;

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export interface IndexNowResult {
  success: boolean;
  status: number;
  message: string;
}

function extractLocUrls(xml: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    // match[1] is the first capture group and always exists when the full match succeeds.
    urls.push(match[1]!);
  }
  return urls;
}

export function parseSitemapIndex(xml: string): string[] {
  return extractLocUrls(xml);
}

export function parseSitemap(xml: string): string[] {
  return extractLocUrls(xml);
}

export function buildIndexNowPayload(
  host: string,
  urls: string[],
): IndexNowPayload {
  return {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `https://${host}/${INDEXNOW_KEY_FILENAME}`,
    urlList: urls,
  };
}

export async function submitToIndexNow(
  payload: IndexNowPayload,
  fetchFn: typeof fetch = fetch,
): Promise<IndexNowResult> {
  try {
    const response = await fetchFn("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return {
      success: response.status === 200 || response.status === 202,
      status: response.status,
      message: response.statusText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, status: 0, message };
  }
}
