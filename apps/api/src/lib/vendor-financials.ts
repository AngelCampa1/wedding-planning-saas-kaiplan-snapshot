type VendorQuoteRecency = {
  id: string;
  vendorId: string;
  status: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function timestamp(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isNewerQuote<T extends VendorQuoteRecency>(next: T, current: T) {
  const nextUpdatedAt = timestamp(next.updatedAt);
  const currentUpdatedAt = timestamp(current.updatedAt);
  if (nextUpdatedAt !== currentUpdatedAt) {
    return nextUpdatedAt > currentUpdatedAt;
  }

  const nextCreatedAt = timestamp(next.createdAt);
  const currentCreatedAt = timestamp(current.createdAt);
  if (nextCreatedAt !== currentCreatedAt) {
    return nextCreatedAt > currentCreatedAt;
  }

  return next.id > current.id;
}

export function getLatestAcceptedQuotesByVendorId<T extends VendorQuoteRecency>(
  quotes: T[],
) {
  const acceptedByVendorId = new Map<string, T>();

  for (const quote of quotes) {
    if (quote.status !== "accepted") {
      continue;
    }

    const current = acceptedByVendorId.get(quote.vendorId);
    if (!current || isNewerQuote(quote, current)) {
      acceptedByVendorId.set(quote.vendorId, quote);
    }
  }

  return acceptedByVendorId;
}
