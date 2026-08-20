import type { ZodType } from "zod";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export function extractApiErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (Array.isArray(error)) {
    for (const entry of error) {
      const message = extractApiErrorMessage(entry);
      if (message !== "Request failed") {
        return message;
      }
    }
    return "Request failed";
  }

  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string") {
      return extractApiErrorMessage(error.message);
    }

    if ("formErrors" in error && Array.isArray(error.formErrors)) {
      const message = extractApiErrorMessage(error.formErrors);
      if (message !== "Request failed") {
        return message;
      }
    }

    if ("fieldErrors" in error && error.fieldErrors) {
      const fieldErrors =
        typeof error.fieldErrors === "object"
          ? Object.values(error.fieldErrors as Record<string, unknown>)
          : [];
      const message = extractApiErrorMessage(fieldErrors);
      if (message !== "Request failed") {
        return message;
      }
    }
  }

  return "Request failed";
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { schema?: ZodType<T> },
): Promise<T> {
  const { schema, ...fetchOptions } = options ?? {};
  const isFormData = fetchOptions.body instanceof FormData;
  const mergedHeaders = new Headers(
    isFormData ? {} : { "Content-Type": "application/json" },
  );
  if (fetchOptions.headers) {
    new Headers(fetchOptions.headers as HeadersInit).forEach((v, k) =>
      mergedHeaders.set(k, v),
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    credentials: "include",
    headers: mergedHeaders,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const bodyErrorId =
      body &&
      typeof body === "object" &&
      "errorId" in body &&
      typeof body.errorId === "string"
        ? body.errorId
        : undefined;
    const errorId =
      bodyErrorId ?? res.headers?.get("X-Kaiplan-Error-Id") ?? undefined;
    throw new ApiError(
      res.status,
      extractApiErrorMessage(body.error ?? body),
      errorId,
    );
  }

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const bodyText = await res.text();
  if (bodyText.trim().length === 0) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = JSON.parse(bodyText) as unknown;
    if (schema) {
      return schema.parse(data);
    }
    return data as T;
  }

  if (schema) {
    throw new Error(
      `Schema validation requested but response is not JSON (status ${res.status})`,
    );
  }

  return bodyText as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errorId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
