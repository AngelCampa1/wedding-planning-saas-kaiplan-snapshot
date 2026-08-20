type BackgroundExecutionContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

type BackgroundContext = {
  executionCtx?: BackgroundExecutionContext;
};

/**
 * Schedule best-effort work without making public API responses depend on it.
 * Some embedded/local runtimes provide no ExecutionContext or an incomplete one.
 */
export function scheduleBackgroundTask(
  context: BackgroundContext,
  task: Promise<unknown>,
): void {
  try {
    const waitUntil = context.executionCtx?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil.call(context.executionCtx, task);
      return;
    }
  } catch {
    // Fall back to fire-and-forget below.
  }

  void task.catch(() => undefined);
}
