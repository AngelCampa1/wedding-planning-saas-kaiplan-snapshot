import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpCircle, Map, MousePointer2 } from "lucide-react";
import {
  getHelpControl,
  helpTopics,
  tourDefinitions,
} from "../../lib/guidance-content";
import { useTour } from "../../components/guidance/tour-provider";
import { Button } from "../../components/ui/button";

export const Route = createFileRoute("/_authenticated/help")({
  component: HelpPage,
});

export function HelpPage() {
  const { helpMode, restartTour, toggleHelpMode } = useTour();

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-muted">
            Help
          </p>
          <h1 className="mt-3 font-heading text-3xl font-semibold text-foreground">
            Find your next step without guessing.
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Use these guides when a planning task feels fuzzy. The tour walks
            across the app, and Help mode adds gentle notes near controls while
            you work.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" onClick={() => restartTour("dashboard")}>
              <Map className="h-4 w-4" />
              Restart dashboard tour
            </Button>
            <Button type="button" variant="outline" onClick={toggleHelpMode}>
              <MousePointer2 className="h-4 w-4" />
              {helpMode ? "Turn off Help mode" : "Turn on Help mode"}
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {helpTopics.map((topic) => (
            <article
              key={topic.id}
              className="rounded-card border border-border bg-card p-5 shadow-card"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-heading text-xl text-foreground">
                    {topic.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {topic.summary}
                  </p>
                </div>
                <HelpCircle className="mt-1 h-5 w-5 shrink-0 text-primary" />
              </div>
              <ol className="mt-4 space-y-2 text-sm text-foreground">
                {topic.steps.map((step) => (
                  <li key={step} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={topic.route as never}>Open section</Link>
                </Button>
              </div>
              <div className="mt-4 grid gap-2">
                {topic.controls
                  .map((key) => getHelpControl(key))
                  .filter(Boolean)
                  .map((control) => (
                    <div
                      key={control!.key}
                      className="rounded-control bg-secondary px-3 py-2 text-xs leading-5 text-secondary-foreground"
                    >
                      <p>
                        <span className="font-medium">{control!.label}:</span>{" "}
                        {control!.body}
                      </p>
                      <p className="mt-2 text-muted-foreground">
                        <span className="font-medium text-secondary-foreground">
                          Why this matters:
                        </span>{" "}
                        {control!.why}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        <span className="font-medium text-secondary-foreground">
                          Next step:
                        </span>{" "}
                        {control!.nextAction}
                      </p>
                    </div>
                  ))}
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-card border border-border bg-background p-5">
          <h2 className="font-heading text-xl text-foreground">
            Available tours
          </h2>
          <div className="mt-4 grid gap-3">
            {tourDefinitions.map((tour) => (
              <div
                key={tour.id}
                className="flex flex-col gap-3 rounded-card border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {tour.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tour.description}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => restartTour(tour.id)}
                >
                  Restart
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
