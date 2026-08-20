export type TourStatus = "queued" | "started" | "skipped" | "completed";

export const TOUR_STORAGE_PREFIX = "kaiplan:tour:";
export const HELP_MODE_STORAGE_KEY = "kaiplan:help-mode";
export const SEATING_OPENED_STORAGE_KEY = "kaiplan:seating-opened";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorageKey(tourId: string) {
  return `${TOUR_STORAGE_PREFIX}${tourId}:status`;
}

export function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readTourStatus(
  tourId: string,
  storage: StorageLike | null = getBrowserStorage(),
): TourStatus | null {
  const value = storage?.getItem(getStorageKey(tourId));

  if (
    value === "queued" ||
    value === "started" ||
    value === "skipped" ||
    value === "completed"
  ) {
    return value;
  }

  return null;
}

export function writeTourStatus(
  tourId: string,
  status: TourStatus,
  storage: StorageLike | null = getBrowserStorage(),
) {
  storage?.setItem(getStorageKey(tourId), status);
}

export function queueTour(
  tourId: string,
  storage: StorageLike | null = getBrowserStorage(),
) {
  const current = readTourStatus(tourId, storage);
  if (current === "completed" || current === "skipped") {
    return;
  }

  writeTourStatus(tourId, "queued", storage);
}

export function shouldAutoStartTour(
  tourId: string,
  storage: StorageLike | null = getBrowserStorage(),
) {
  return readTourStatus(tourId, storage) === "queued";
}

export function readHelpMode(
  storage: StorageLike | null = getBrowserStorage(),
) {
  return storage?.getItem(HELP_MODE_STORAGE_KEY) === "true";
}

export function writeHelpMode(
  enabled: boolean,
  storage: StorageLike | null = getBrowserStorage(),
) {
  storage?.setItem(HELP_MODE_STORAGE_KEY, String(enabled));
}

export function markSeatingOpened(
  storage: StorageLike | null = getBrowserStorage(),
) {
  storage?.setItem(SEATING_OPENED_STORAGE_KEY, "true");
}

export function hasOpenedSeating(
  storage: StorageLike | null = getBrowserStorage(),
) {
  return storage?.getItem(SEATING_OPENED_STORAGE_KEY) === "true";
}
