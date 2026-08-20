import { HelpCircle } from "lucide-react";
import { Label } from "../ui/label";
import { HelpTooltip } from "./help-tooltip";

interface HelpFieldLabelProps {
  htmlFor?: string;
  children: string;
  help: string;
  hint?: string;
}

export function HelpFieldLabel({
  htmlFor,
  children,
  help,
  hint,
}: HelpFieldLabelProps) {
  const descriptionId = htmlFor ? `${htmlFor}-help-trigger-description` : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{children}</Label>
        {descriptionId ? (
          <span id={descriptionId} className="sr-only">
            Help for {children}
          </span>
        ) : null}
        <HelpTooltip content={help}>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Explain this field"
            aria-describedby={descriptionId ?? undefined}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </HelpTooltip>
      </div>
      {hint ? (
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
