import type { WeddingWithRole } from "@kaiplan/shared";
import { Link } from "@tanstack/react-router";
import { HelpCircle, MousePointer2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useOptionalTour } from "./guidance/tour-provider";
import { Button } from "./ui/button";
import { HelpTooltip } from "./guidance/help-tooltip";
import { WeddingPicker } from "./wedding-picker";
import { UserMenu } from "./user-menu";

interface TopBarProps {
  user: { name: string; email: string };
  weddings: WeddingWithRole[];
  activeWeddingId: string;
  onSelectWedding: (id: string) => void;
}

export function TopBar({
  user,
  weddings,
  activeWeddingId,
  onSelectWedding,
}: TopBarProps) {
  return (
    <header className="hidden h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 shrink-0 md:flex">
      <WeddingPicker
        weddings={weddings}
        activeWeddingId={activeWeddingId}
        onSelect={onSelectWedding}
      />
      <div className="flex items-center gap-2">
        <TopBarHelpActions />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

export function TopBarHelpActions({ compact = false }: { compact?: boolean }) {
  const tour = useOptionalTour();

  return (
    <div className={cn("flex items-center gap-2", compact && "shrink-0")}>
      <HelpTooltip content="Show plain-language guidance for this page.">
        <Button
          type="button"
          variant={tour?.helpMode ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={
            tour?.helpMode ? "Turn off Help mode" : "Turn on Help mode"
          }
          onClick={tour?.toggleHelpMode}
          disabled={!tour}
        >
          <MousePointer2 className="h-4 w-4" />
        </Button>
      </HelpTooltip>
      <HelpTooltip content="Open the help guide and restart tours.">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/help" aria-label="Open help">
            <HelpCircle className="h-4 w-4" />
          </Link>
        </Button>
      </HelpTooltip>
    </div>
  );
}
