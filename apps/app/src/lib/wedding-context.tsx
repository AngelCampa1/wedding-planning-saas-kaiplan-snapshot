import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const SESSION_STORAGE_KEY = "kaiplan:activeWeddingId";

interface WeddingContextValue {
  activeWeddingId: string | null;
  setActiveWeddingId: (id: string | null) => void;
  setWeddingSwitchGuard: (
    guard: ((nextWeddingId: string) => boolean) | null,
  ) => void;
}

const WeddingContext = createContext<WeddingContextValue | null>(null);

export function WeddingProvider({ children }: { children: ReactNode }) {
  const [activeWeddingId, setActiveWeddingIdState] = useState<string | null>(
    () => {
      try {
        return sessionStorage.getItem(SESSION_STORAGE_KEY);
      } catch {
        return null;
      }
    },
  );
  const switchGuardRef = useRef<((nextWeddingId: string) => boolean) | null>(
    null,
  );

  const setActiveWeddingId = useCallback((id: string | null) => {
    if (id !== null && switchGuardRef.current && !switchGuardRef.current(id)) {
      return;
    }

    try {
      if (id) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, id);
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
    setActiveWeddingIdState(id);
  }, []);

  const setWeddingSwitchGuard = useCallback(
    (guard: ((nextWeddingId: string) => boolean) | null) => {
      switchGuardRef.current = guard;
    },
    [],
  );

  const value = useMemo(
    () => ({ activeWeddingId, setActiveWeddingId, setWeddingSwitchGuard }),
    [activeWeddingId, setActiveWeddingId, setWeddingSwitchGuard],
  );

  return (
    <WeddingContext.Provider value={value}>{children}</WeddingContext.Provider>
  );
}

export function useActiveWedding() {
  const ctx = useContext(WeddingContext);
  if (!ctx) {
    throw new Error("useActiveWedding must be used within WeddingProvider");
  }
  return ctx;
}
