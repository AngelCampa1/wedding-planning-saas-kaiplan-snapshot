import { useLayoutEffect, useRef } from "react";
import { queryClient } from "../lib/query-client";

export function useAuthQueryReset(userId: string | null | undefined) {
  const previousUserId = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    if (previousUserId.current === undefined) {
      previousUserId.current = userId;
      return;
    }

    if (previousUserId.current === userId) {
      return;
    }

    previousUserId.current = userId;

    // Clear synchronously to prevent the previous user's data from flashing
    // in the UI during the brief window between userId change and cache wipe.
    // cancelQueries is fire-and-forget — clear() unilaterally wipes the cache
    // and any in-flight requests are orphaned (results ignored by the cleared cache).
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [userId]);
}
