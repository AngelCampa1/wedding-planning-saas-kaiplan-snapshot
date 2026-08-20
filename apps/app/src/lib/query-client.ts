import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";
import { captureQueryError } from "./sentry";

type NavigateFn = (opts: { to: string }) => Promise<void> | void;
type SignOutFn = () => Promise<unknown>;
type ClearFn = () => void;

interface Global401Deps {
  signOut: SignOutFn;
  navigate: NavigateFn;
  clear: ClearFn;
}

let global401Deps: Global401Deps | null = null;
let handling401 = false;

export function registerGlobal401Handler(deps: Global401Deps): void {
  global401Deps = deps;
}

function handle401(error: unknown): void {
  captureQueryError(error);

  if (!(error instanceof ApiError) || error.status !== 401) {
    return;
  }

  if (!global401Deps) {
    return;
  }

  if (handling401) {
    return;
  }

  handling401 = true;

  const { signOut, navigate, clear } = global401Deps;
  void signOut()
    .catch(() => undefined)
    .then(async () => {
      try {
        clear();
        await navigate({ to: "/login" });
      } catch {
        // Ignore navigate errors
      } finally {
        handling401 = false;
      }
    });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handle401,
  }),
  mutationCache: new MutationCache({
    onError: handle401,
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});
