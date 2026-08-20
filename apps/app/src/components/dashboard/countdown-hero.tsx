import { Link } from "@tanstack/react-router";

interface CountdownHeroProps {
  weddingName: string;
  weddingDate: string | null;
}

function getDaysToGo(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  const weddingDate = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  weddingDate.setHours(0, 0, 0, 0);
  const diff = weddingDate.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatLongDate(dateStr: string): { weekday: string; rest: string } {
  const parts = dateStr.split("-").map(Number);
  const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const rest = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return { weekday, rest };
}

export function CountdownHero({
  weddingName,
  weddingDate,
}: CountdownHeroProps) {
  const daysToGo = weddingDate ? getDaysToGo(weddingDate) : null;
  const formatted = weddingDate ? formatLongDate(weddingDate) : null;

  if (daysToGo === null) {
    return (
      <section className="py-8">
        <p
          className="font-heading text-foreground"
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2rem)",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
          }}
        >
          Your big day awaits
        </p>
        <Link
          to="/settings"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Set your wedding date to start the countdown
        </Link>
      </section>
    );
  }

  if (daysToGo === 0 || daysToGo < 0) {
    const message =
      daysToGo === 0 ? "Today is the day." : "Congratulations — you did it.";
    return (
      <section className="py-10">
        <p
          className="heading-display font-heading text-foreground"
          style={{ fontSize: "clamp(2.75rem, 7vw, 5rem)" }}
        >
          {message}
        </p>
        {weddingName && (
          <p className="mt-3 max-w-2xl break-words font-body text-base text-muted-foreground">
            {weddingName}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-10">
      <div className="grid grid-cols-1 items-center gap-x-8 gap-y-6 sm:grid-cols-[minmax(0,22rem)_1px_minmax(0,1fr)] sm:gap-x-12">
        {/* Number block */}
        <div className="relative min-w-0">
          <div
            className="font-heading text-foreground tabular-nums leading-none"
            style={{
              fontSize: "clamp(4.5rem, 12vw, 9rem)",
              fontWeight: 400,
              letterSpacing: "-0.045em",
            }}
            aria-label={`${daysToGo} days to go`}
          >
            {daysToGo}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-body text-kicker text-muted-foreground">
              days to go
            </span>
            <span aria-hidden className="rule-accent h-px flex-1 max-w-24" />
          </div>
        </div>

        {/* Vertical rule (desktop only) */}
        <div
          aria-hidden
          className="rule-primary hidden sm:block h-32 w-px self-center"
        />

        {/* Name + date block */}
        <div className="min-w-0">
          <h2
            className="heading-display break-words font-heading text-foreground"
            style={{
              fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)",
              lineHeight: 1.05,
              letterSpacing: "-0.015em",
            }}
          >
            {weddingName}
          </h2>
          {formatted && (
            <div className="mt-4 space-y-1">
              <p
                className="font-body text-foreground"
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                }}
              >
                {formatted.weekday}
              </p>
              <p className="font-body text-base text-muted-foreground">
                {formatted.rest}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
