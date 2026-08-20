export function filterIndexableEntries<
  T extends {
    data: {
      noindex?: boolean;
    };
  },
>(entries: T[]): T[] {
  return entries.filter((entry) => entry.data.noindex !== true);
}
