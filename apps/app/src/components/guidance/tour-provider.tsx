import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  getHelpControl,
  helpControls,
  getTourDefinition,
  type TourDefinition,
} from "../../lib/guidance-content";
import {
  readHelpMode,
  shouldAutoStartTour,
  writeHelpMode,
  writeTourStatus,
} from "../../lib/tour-storage";
import { Button } from "../ui/button";

interface TourContextValue {
  helpMode: boolean;
  toggleHelpMode: () => void;
  startTour: (tourId: string) => void;
  restartTour: (tourId: string) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

interface ActiveTour {
  definition: TourDefinition;
  index: number;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findTourTarget(targetKey: string | undefined) {
  return document.querySelector<HTMLElement>(
    `[data-tour="${targetKey}"], [data-help-key="${targetKey}"]`,
  );
}

function readTargetRect(targetKey: string | undefined): TargetRect | null {
  const target = findTourTarget(targetKey);
  if (!target) {
    return null;
  }

  const rect = target.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [helpMode, setHelpMode] = useState(() => readHelpMode());
  const [activeTour, setActiveTour] = useState<ActiveTour | null>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const startTour = useCallback((tourId: string) => {
    const definition = getTourDefinition(tourId);
    if (!definition) {
      return;
    }

    writeTourStatus(tourId, "started");
    setActiveTour({ definition, index: 0 });
  }, []);

  const restartTour = useCallback(
    (tourId: string) => {
      writeTourStatus(tourId, "started");
      startTour(tourId);
    },
    [startTour],
  );

  const toggleHelpMode = useCallback(() => {
    setHelpMode((current) => {
      const next = !current;
      writeHelpMode(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (
      location.pathname === "/dashboard" &&
      shouldAutoStartTour("dashboard")
    ) {
      startTour("dashboard");
    }
  }, [location.pathname, startTour]);

  useEffect(() => {
    if (!activeTour) {
      setTargetRect(null);
      return;
    }

    const step = activeTour.definition.steps[activeTour.index]!;

    if (step.route !== location.pathname) {
      void navigate({ to: step.route as never });
      return;
    }

    const updateRect = () => setTargetRect(readTargetRect(step.targetKey));
    const raf = window.requestAnimationFrame(updateRect);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [activeTour, location.pathname, navigate]);

  const value = useMemo<TourContextValue>(
    () => ({
      helpMode,
      restartTour,
      startTour,
      toggleHelpMode,
    }),
    [helpMode, restartTour, startTour, toggleHelpMode],
  );
  const hasHelpModePanel =
    helpMode &&
    helpControls.some((control) => control.route === location.pathname);

  return (
    <TourContext.Provider value={value}>
      <div
        data-help-mode={helpMode ? "true" : "false"}
        className={hasHelpModePanel ? "md:pr-[24rem]" : undefined}
      >
        {children}
      </div>
      {hasHelpModePanel ? <HelpModePanel pathname={location.pathname} /> : null}
      {activeTour ? (
        <TourOverlay
          activeTour={activeTour}
          targetRect={targetRect}
          onBack={() =>
            setActiveTour({
              ...activeTour,
              index: Math.max(0, activeTour.index - 1),
            })
          }
          onNext={() => {
            const nextIndex = activeTour.index + 1;
            setActiveTour(() => {
              if (nextIndex >= activeTour.definition.steps.length) {
                writeTourStatus(activeTour.definition.id, "completed");
                return null;
              }

              return { ...activeTour, index: nextIndex };
            });
          }}
          onSkip={() => {
            writeTourStatus(activeTour.definition.id, "skipped");
            setActiveTour(null);
          }}
        />
      ) : null}
    </TourContext.Provider>
  );
}

function HelpModePanel({ pathname }: { pathname: string }) {
  const controls = helpControls.filter((control) => control.route === pathname);

  if (controls.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Contextual help"
      className="fixed bottom-20 left-4 z-[60] max-h-[45vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-card border border-border bg-background p-4 shadow-floating max-md:relative max-md:bottom-auto max-md:left-auto max-md:z-auto max-md:m-4 max-md:max-h-none max-md:w-auto md:bottom-auto md:left-auto md:right-4 md:top-20"
    >
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted">
        Help mode
      </p>
      <h2 className="mt-2 font-heading text-lg text-foreground">
        Guidance on this page
      </h2>
      <div className="mt-3 space-y-2">
        {controls.map((control) => (
          <article
            key={control.key}
            className="rounded-control bg-secondary px-3 py-2 text-xs leading-5 text-secondary-foreground"
          >
            <p>
              <span className="font-medium">{control.label}:</span>{" "}
              {control.body}
            </p>
            <p className="mt-2 text-muted-foreground">
              <span className="font-medium text-secondary-foreground">
                Why this matters:
              </span>{" "}
              {control.why}
            </p>
            <p className="mt-1 text-muted-foreground">
              <span className="font-medium text-secondary-foreground">
                Next step:
              </span>{" "}
              {control.nextAction}
            </p>
          </article>
        ))}
      </div>
    </aside>
  );
}

interface TourOverlayProps {
  activeTour: ActiveTour;
  targetRect: TargetRect | null;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

function TourOverlay({
  activeTour,
  targetRect,
  onBack,
  onNext,
  onSkip,
}: TourOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const step = activeTour.definition.steps[activeTour.index]!;
  const isFirstStep = activeTour.index === 0;
  const isLastStep =
    activeTour.index === activeTour.definition.steps.length - 1;
  const control = step.targetKey ? getHelpControl(step.targetKey) : null;

  useEffect(() => {
    dialogRef.current?.focus();
  }, [activeTour.index]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onSkip();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => !element.hasAttribute("disabled"));

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onSkip]);

  const dialogStyle = targetRect
    ? {
        top: Math.min(
          Math.max(24, window.innerHeight - 260),
          Math.max(24, targetRect.top + targetRect.height + 16),
        ),
        left: Math.min(
          Math.max(16, window.innerWidth - 380),
          Math.max(16, targetRect.left + targetRect.width / 2 - 180),
        ),
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div className="fixed inset-0 z-[80]" aria-live="polite">
      <div className="absolute inset-0 bg-foreground/45" />
      {targetRect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-card ring-4 ring-primary/60 ring-offset-4 ring-offset-background"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      ) : null}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        className="absolute w-[min(22rem,calc(100vw-2rem))] rounded-card border border-border bg-background p-5 text-foreground shadow-floating outline-none"
        style={dialogStyle}
      >
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted">
          Step {activeTour.index + 1} of {activeTour.definition.steps.length}
        </p>
        <h2 id="tour-title" className="mt-3 font-heading text-xl">
          {step.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {step.body}
        </p>
        {control ? (
          <p className="mt-3 rounded-control bg-secondary px-3 py-2 text-xs leading-5 text-secondary-foreground">
            {control.label}: {control.body}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isFirstStep}
            >
              Previous
            </Button>
            <Button type="button" onClick={onNext}>
              {isLastStep ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used inside TourProvider.");
  }

  return context;
}

export function useOptionalTour() {
  return useContext(TourContext);
}
